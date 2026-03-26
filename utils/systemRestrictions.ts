import { SupabaseClient } from "@supabase/supabase-js";
import { checkAdvisorBlocked } from "./checkAdvisorBlocked";

export type SystemAction = 'solicitud' | 'renovacion' | 'pago' | 'prestamo' | 'cuadre' | 'otros';

export interface AccessResult {
    allowed: boolean;
    reason?: string;
    code?: string;
    config?: any;
}

export async function checkSystemAccess(
    supabase: SupabaseClient, 
    userId: string, 
    userRole: string, 
    action: SystemAction = 'otros'
): Promise<AccessResult> {
    // 1. ADMIN EXCEPTION FOR HOLIDAYS (Rule 4)
    // "los dias feriados y domingos... usuarios excepto el admin no puedan hacer nada"
    // We'll evaluate holidays first, then standard rules.

    // 2. GET CURRENT TIME IN LIMA
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    const parts = formatter.formatToParts(now);
    const day = parts.find(p => p.type === 'day')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const year = parts.find(p => p.type === 'year')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    
    const todayStr = `${year}-${month}-${day}`;
    const timePart = `${hour}:${minute}`;

    const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const limaDayOfWeek = limaDate.getDay(); // 0 = Sunday

    console.log(`[SYSTEM ACCESS] User: ${userId} (${userRole}) | Time: ${timePart} | Day: ${limaDayOfWeek} (${todayStr}) | Action: ${action}`);


    // 3. CHECK SUNDAYS AND HOLIDAYS
    const isSunday = limaDayOfWeek === 0;
    const { data: holiday } = await supabase
        .from('feriados')
        .select('id, descripcion')
        .eq('fecha', todayStr)
        .maybeSingle();

    if (isSunday || holiday) {
        if (userRole === 'admin') {
            console.log(`[SYSTEM ACCESS] Role ${userRole} allowed on ${isSunday ? 'Sunday' : 'Holiday'}`);
        } else {
            // Check for Temporary Unlock
            const { data: configUnlock } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('clave', 'desbloqueo_hasta')
                .single();

            const unlockedUntil = configUnlock?.valor ? new Date(configUnlock.valor) : null;
            if (!unlockedUntil || now >= unlockedUntil) {
                return {
                    allowed: false,
                    reason: `Hoy es ${isSunday ? 'Domingo' : 'Feriado'}. El sistema se encuentra cerrado para personal operativo.`,
                    code: 'HOLIDAY_BLOCK'
                };
            }
        }
    }

    // 4. GET SYSTEM CONFIG (APERTURA / CIERRE / CUADRES)
    const { data: configRows } = await supabase
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', [
            'horario_apertura', 
            'horario_cierre', 
            'desbloqueo_hasta', 
            'horario_fin_turno_1'
        ]);
    
    const config = configRows?.reduce((acc: any, curr) => {
        acc[curr.clave] = curr.valor;
        return acc;
    }, { 
        horario_apertura: '10:00', 
        horario_cierre: '19:00', 
        horario_fin_turno_1: '13:00'
    });

    const isTemporaryUnlocked = config.desbloqueo_hasta && new Date(config.desbloqueo_hasta) > now;

    // 5. SALDO PENDIENTE BLOCK (Except for the Cuadre itself)
    if (userRole === 'asesor' && action !== 'cuadre' && !isTemporaryUnlocked) {
        const blockStatus = await checkAdvisorBlocked(supabase, userId);
        if (blockStatus.isBlocked) {
            const shiftMessage = (timePart >= config.horario_apertura && timePart <= config.horario_fin_turno_1)
                ? `Primer Turno (${config.horario_apertura} - ${config.horario_fin_turno_1}): `
                : '';

            return {
                allowed: false,
                reason: `${shiftMessage}${blockStatus.reason}`,
                code: 'PENDING_SALDO'
            };
        }
    }

    // 6. GLOBAL HOUR BLOCK
    if (!isTemporaryUnlocked && userRole !== 'admin' && action !== 'cuadre') {
        if (timePart < config.horario_apertura || timePart > config.horario_cierre) {
            console.warn(`[SYSTEM ACCESS] Blocked by hours: ${timePart} outside ${config.horario_apertura} - ${config.horario_cierre}`);
            return {
                allowed: false,
                reason: `Fuera del horario de operación (${config.horario_apertura} - ${config.horario_cierre}).`,
                code: 'OUT_OF_HOURS'
            };
        }
    }

    // 6. NIGHT BLOCK
    if (timePart >= config.horario_cierre && action !== 'cuadre' && !isTemporaryUnlocked && userRole !== 'admin') {
         return {
             allowed: false,
             reason: `A partir de las ${config.horario_cierre}, el sistema solo permite realizar el CIERRE FINAL de caja.`,
             code: 'NIGHT_RESTRICTION'
         };
    }

    // 7. CUADRE MAÑANA RULE (At the end of Shift 1)
    if (timePart >= config.horario_fin_turno_1 && (action === 'solicitud' || action === 'renovacion' || action === 'prestamo') && !isTemporaryUnlocked && userRole !== 'admin') {
        const { data: firstCuadre } = await supabase
            .from('cuadres_diarios')
            .select('created_at')
            .eq('asesor_id', userId)
            .eq('fecha', todayStr)
            .eq('tipo_cuadre', 'parcial')
            .eq('estado', 'aprobado') // Solo cuadres ya aceptados por admin
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        // El punto de corte es el primer cuadre aprobado, o la hora límite establecida
        const timestampMorningCutoff = firstCuadre?.created_at || `${todayStr}T${config.horario_fin_turno_1}:00-05:00`;

        // a) Recaudación Bruta Mañana (todo lo recolectado antes del primer cuadre APROBADO)
        const { data: morningPayments } = await supabase
            .from('pagos')
            .select('monto_pagado')
            .eq('registrado_por', userId)
            .gte('created_at', `${todayStr}T00:00:00-05:00`)
            .lte('created_at', timestampMorningCutoff);
        
        const netMorningDue = morningPayments?.reduce((acc, p) => acc + parseFloat(p.monto_pagado || '0'), 0) || 0;

        // c) Total liquidado y ACEPTADO hoy
        const { data: squaredToday } = await supabase
            .from('cuadres_diarios')
            .select('saldo_entregado, total_gastos')
            .eq('asesor_id', userId)
            .eq('fecha', todayStr)
            .eq('tipo_cuadre', 'parcial')
            .eq('estado', 'aprobado'); // Debe estar aprobado para considerarse "cuadrado"
        
        const totalSquaredToday = squaredToday?.reduce((acc, c) => acc + parseFloat(c.saldo_entregado || '0') + parseFloat(c.total_gastos || '0'), 0) || 0;

        const morningLeftover = netMorningDue - totalSquaredToday;

        // Bloqueo obligatorio si no hay ningún cuadre parcial APROBADO hoy, o si no cubrió la mañana
        if (!firstCuadre || morningLeftover > 1.05) {
            return {
                allowed: false,
                reason: !firstCuadre 
                    ? `Al finalizar el Primer Turno (${config.horario_fin_turno_1}), el Administrador debe APROBAR tu CUADRE PARCIAL para que puedas seguir operando.`
                    : `Para operar en el turno tarde, debes liquidar el saldo pendiente de tu primera ruta (S/ ${morningLeftover.toFixed(2)} restante).`,
                code: 'MISSING_MORNING_CUADRE'
            };
        }
    }


    return { allowed: true, config };
}
