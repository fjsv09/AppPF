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
    // Helper para comparar horas de forma robusta (numérica)
    const timeToMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

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

    // Helper para comparar horas
    const tNow = timeToMinutes(timePart);
    const tApertura = timeToMinutes(config.horario_apertura);
    const tCierre = timeToMinutes(config.horario_cierre);
    const tFinTurno1 = timeToMinutes(config.horario_fin_turno_1);

    // 5. SALDO PENDIENTE BLOCK (Except for the Cuadre itself)
    if (userRole === 'asesor' && action !== 'cuadre' && !isTemporaryUnlocked) {
        const blockStatus = await checkAdvisorBlocked(supabase, userId);
        if (blockStatus.isBlocked) {
            const shiftMessage = (tNow >= tApertura && tNow <= tFinTurno1)
                ? `Primer Turno (${config.horario_apertura} - ${config.horario_fin_turno_1}): `
                : '';

            return {
                allowed: false,
                reason: `${shiftMessage}${blockStatus.reason}`,
                code: 'PENDING_SALDO'
            };
        }
    }

    // 7. CUADRE MAÑANA RULE (At the end of Shift 1)
    if (tNow >= tFinTurno1 && (['solicitud', 'renovacion', 'pago', 'prestamo'].includes(action)) && !isTemporaryUnlocked && userRole !== 'admin') {
        const { data: firstCuadre } = await supabase
            .from('cuadres_diarios')
            .select('created_at')
            .eq('asesor_id', userId)
            .eq('fecha', todayStr)
            .in('tipo_cuadre', ['parcial', 'parcial_mañana'])
            .eq('estado', 'aprobado') // Solo cuadres ya aceptados por admin
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        // El punto de corte es la hora límite oficial del Primer Turno.
        // NO usamos firstCuadre?.created_at porque el asesor debe liquidar TODO lo cobrado hasta la hora oficial
        // de fin de turno (normalmente 15:00), independientemente de a qué hora hizo su primer intento de cuadre.
        const timestampMorningCutoff = `${todayStr}T${config.horario_fin_turno_1}:00-05:00`;

        // a) Recaudación Bruta Mañana (todo lo recolectado hoy hasta la hora oficial de corte)
        const { data: morningPayments } = await supabase
            .from('pagos')
            .select('monto_pagado')
            .eq('registrado_por', userId)
            .gte('created_at', `${todayStr}T00:00:00-05:00`)
            .lte('created_at', timestampMorningCutoff);
        
        const netMorningDue = morningPayments?.reduce((acc, p) => acc + parseFloat(p.monto_pagado || '0'), 0) || 0;

        // b) Deuda Histórica (Saldo que el asesor trae de días anteriores sin liquidar)
        const { checkAdvisorBlocked } = await import('./checkAdvisorBlocked');
        const historicalCheck = await checkAdvisorBlocked(supabase, userId);
        const leftoverHistorical = historicalCheck.leftover || 0;

        // c) Total liquidado y ACEPTADO hoy
        const { data: squaredToday } = await supabase
            .from('cuadres_diarios')
            .select('saldo_entregado, total_gastos')
            .eq('asesor_id', userId)
            .eq('fecha', todayStr)
            .in('tipo_cuadre', ['parcial', 'parcial_mañana'])
            .eq('estado', 'aprobado'); // Debe estar aprobado para considerarse "cuadrado"
        
        const totalSquaredToday = squaredToday?.reduce((acc, c) => acc + parseFloat(c.saldo_entregado || '0') + parseFloat(c.total_gastos || '0'), 0) || 0;

        // CÁLCULO FINAL: RecaudadoMañana + DeudaHistórica - EntregasHoy
        // Si Michel debe 40 (ayer) y cobró 98 (hoy), pero entregó 40 (hoy)... 
        // Aún tiene 98 en su bolsillo procedentes de la mañana de hoy.
        const totalPendingFromMorning = leftoverHistorical + netMorningDue - totalSquaredToday;

        // Bloqueo obligatorio si el saldo pendiente de lo recaudado en la mañana es significativo
        if (!firstCuadre || totalPendingFromMorning > 1.05) {
            return {
                allowed: false,
                reason: !firstCuadre 
                    ? `Al finalizar el Primer Turno (${config.horario_fin_turno_1}), el Administrador debe APROBAR tu CUADRE PARCIAL para que puedas seguir operando.`
                    : `Para operar en el turno tarde, debes entregar el saldo total pendiente (S/ ${totalPendingFromMorning.toFixed(2)} que incluye deudas anteriores y cobros de esta mañana).`,
                code: 'MISSING_MORNING_CUADRE'
            };
        }
    }

    // 6. GLOBAL HOUR BLOCK
    if (!isTemporaryUnlocked && userRole !== 'admin' && action !== 'cuadre') {
        if (tNow < tApertura || tNow > tCierre) {
            console.warn(`[SYSTEM ACCESS] Blocked by hours: ${timePart} outside ${config.horario_apertura} - ${config.horario_cierre}`);
            return {
                allowed: false,
                reason: `Fuera del horario de operación (${config.horario_apertura} - ${config.horario_cierre}).`,
                code: 'OUT_OF_HOURS'
            };
        }
    }

    // 6. NIGHT BLOCK
    if (action !== 'cuadre' && !isTemporaryUnlocked && userRole !== 'admin') {
         if (tNow >= tCierre) {
            return {
                allowed: false,
                reason: `A partir de las ${config.horario_cierre}, el sistema solo permite realizar el CIERRE FINAL de caja.`,
                code: 'NIGHT_RESTRICTION'
            };
         }
    }


    return { allowed: true, config };
}
