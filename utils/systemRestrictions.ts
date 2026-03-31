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
            'horario_fin_turno_1',
            'tiempo_gracia_post_cuadre'
        ]);
    
    const config = configRows?.reduce((acc: any, curr) => {
        acc[curr.clave] = curr.valor;
        return acc;
    }, { 
        horario_apertura: '10:00', 
        horario_cierre: '19:00', 
        horario_fin_turno_1: '13:00',
        tiempo_gracia_post_cuadre: '10'
    });

    const isUnlockActive = config.desbloqueo_hasta && new Date(config.desbloqueo_hasta) > now;
    if (isUnlockActive && userRole !== 'admin' && ['solicitud', 'renovacion', 'prestamo'].includes(action)) {
        return {
             allowed: false,
             reason: 'El Desbloqueo Temporal activado por el administrador SOLO permite registrar pagos y cuadres.',
             code: 'TEMPORARY_UNLOCK_RESTRICTION'
        };
    }
    const isTemporaryUnlocked = isUnlockActive && ['pago', 'cuadre', 'otros'].includes(action);

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
        
        // a) Calcular saldo real retenido en este momento
        const { data: carteras } = await supabase.from('carteras').select('id').eq('asesor_id', userId);
        const carterIds = carteras?.map((c: any) => c.id) || [];
        
        const { data: accounts } = await supabase
            .from('cuentas_financieras')
            .select('saldo')
            .in('cartera_id', carterIds)
            .eq('tipo', 'cobranzas');
        const currentBalance = accounts?.reduce((acc: any, c: any) => acc + parseFloat(c.saldo || '0'), 0) || 0;

        // Si el asesor tiene 0 efectivo, no tiene sentido bloquearlo y forzar un Cierre Mañana
        if (currentBalance > 1.05) {
            
            // Verificamos si ya hizo legalmente el Cierre Mañana formal
            const { data: MorningCuadre } = await supabase
                .from('cuadres_diarios')
                .select('created_at')
                .eq('asesor_id', userId)
                .eq('fecha', todayStr)
                .in('tipo_cuadre', ['parcial_mañana', 'final']) // Sólo tipo oficial de cierre
                .eq('estado', 'aprobado')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (!MorningCuadre) {
                return {
                    allowed: false,
                    reason: `Para operar en el turno tarde, debes reportar obligatoriamente la recaudación de hoy haciendo un "Cierre Mañana". (Monto actual retenido: S/ ${currentBalance.toFixed(2)})`,
                    code: 'MISSING_MORNING_CUADRE'
                };
            }

            // Si ya hizo su cierre de turno y fue aceptado, evaluamos el tiempo de gracia (si no lo ha superado)
            const timeSinceCuadre = Math.floor((now.getTime() - new Date(MorningCuadre.created_at).getTime()) / 60000);
            const graceTime = parseInt(config.tiempo_gracia_post_cuadre || '10');
            if (timeSinceCuadre < graceTime) {
                return {
                    allowed: false,
                    reason: `Cierre de turno verificado correctamente. El sistema iniciará el turno tarde automáticamente en ${graceTime - timeSinceCuadre} minuto(s).`,
                    code: 'GRACE_PERIOD'
                };
            }
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
