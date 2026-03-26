import { SupabaseClient } from "@supabase/supabase-js";

export async function checkAdvisorBlocked(supabase: SupabaseClient, userId: string): Promise<{ isBlocked: boolean, reason: string, leftover: number }> {
    // --- 1. LOGGING FISICO (PARA DEBUGEAR EN PRODUCCION) ---
    const fs = require('fs');
    const logPath = 'c:/Users/fjsvc/OneDrive/Escritorio/AppPF/debug_access.log';
    const writeLog = (msg: string) => {
        try {
            const time = new Date().toISOString();
            fs.appendFileSync(logPath, `[${time}] [CHECK_ADVISOR] ${msg}\n`);
        } catch(e) {}
    };

    writeLog(`[START] Analyzing user: ${userId}`);

    // --- 2. CONFIGURACIÓN DE FECHA LIMA (ULTRA ROBUSTA) ---
    const now = new Date();
    const limaTime = now.toLocaleString('en-US', { timeZone: 'America/Lima' });
    const limaDate = new Date(limaTime);
    const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`;
    const startOfTodayISO = `${todayStr}T00:00:00-05:00`;

    // --- 3. REVISIÓN DE INTEGRIDAD OBLIGATORIA (SIEMPRE SE EJECUTA) ---
    // Rule: All advisors MUST have a FINAL APPROVED report for every day they operated PRIOR to today.
    // This ignores balance (even if they owe 0, they MUST report the final status of the day).
    const { data: history } = await supabase
        .from('cuadres_diarios')
        .select('fecha, tipo_cuadre, estado')
        .eq('asesor_id', userId)
        .lt('fecha', todayStr)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

    writeLog(`[HISTORY] Found ${history?.length || 0} previous records. Today is ${todayStr}`);

    if (history && history.length > 0) {
        const daysEvaluated = new Set();
        for (const record of history) {
            if (!daysEvaluated.has(record.fecha)) {
                daysEvaluated.add(record.fecha);
                writeLog(`[DAY_CHECK] Day: ${record.fecha} | Type: ${record.tipo_cuadre} | Status: ${record.estado}`);
                if (record.tipo_cuadre !== 'final' || record.estado !== 'aprobado') {
                    const statusMsg = record.estado === 'pendiente' ? 'está PENDIENTE DE REVISIÓN' : (record.estado === 'rechazado' ? 'fue RECHAZADO' : 'está INCOMPLETO (Falta Cierre Final)');
                    writeLog(`[BLOCK] INTEGRITY_FAIL: ${record.fecha} -> ${statusMsg}`);
                    return {
                        isBlocked: true,
                        reason: `El cierre del día ${record.fecha} ${statusMsg}. Debes regularizarlo con el administrador para operar hoy.`,
                        leftover: 0
                    };
                }
            }
        }
    }

    // --- 4. CÁLCULO DE SALDO FINANCIERO (SEGUNDA CAPA) ---
    // Si la integridad está bien, verificamos que no deba dinero acumulado.
    
    // a) Cuentas de cobranzas
    const { data: accounts } = await supabase
        .from('cuentas_financieras')
        .select('id, saldo, cartera_id')
        .eq('asesor_id', userId)
        .eq('tipo', 'cobranzas');

    if (!accounts || accounts.length === 0) {
        writeLog(`[INFO] No accounts found, but integrity check passed.`);
        return { isBlocked: false, reason: '', leftover: 0 };
    }

    const accountIds = accounts.map(a => a.id);
    const saldoActualTotal = accounts.reduce((acc: number, c: any) => acc + parseFloat(c.saldo || 0), 0) || 0;

    // b) Flujo de hoy
    const { data: movementsToday } = await supabase
        .from('movimientos_financieros')
        .select('monto, tipo, cuenta_origen_id, cuenta_destino_id')
        .or(`cuenta_origen_id.in.(${accountIds.join(',')}),cuenta_destino_id.in.(${accountIds.join(',')})`)
        .gte('created_at', startOfTodayISO);

    const ingresosHoy = movementsToday?.filter(m => m.cuenta_destino_id && accountIds.includes(m.cuenta_destino_id))
                                      .reduce((acc, m) => acc + parseFloat(m.monto || 0), 0) || 0;
    
    const gastosHoy = movementsToday?.filter(m => m.tipo === 'egreso' && m.cuenta_origen_id && accountIds.includes(m.cuenta_origen_id))
                                     .reduce((acc, m) => acc + parseFloat(m.monto || 0), 0) || 0;

    const entregasAprobadasHoy = movementsToday?.filter(m => m.tipo === 'transferencia' && m.cuenta_origen_id && accountIds.includes(m.cuenta_origen_id))
                                                .reduce((acc, m) => acc + parseFloat(m.monto || 0), 0) || 0;

    const deudaNetaHoy = (ingresosHoy - gastosHoy) - entregasAprobadasHoy;
    const leftoverHistorical = saldoActualTotal - deudaNetaHoy;

    writeLog(`[DEBT_CHECK] Saldo: ${saldoActualTotal} | NetoHoy: ${deudaNetaHoy} | Historical: ${leftoverHistorical}`);

    if (leftoverHistorical > 1.05) {
        writeLog(`[BLOCK] PENDING_SALDO: ${leftoverHistorical}`);
        return {
            isBlocked: true,
            reason: `Tienes un SALDO PENDIENTE de S/ ${leftoverHistorical.toFixed(2)} de días anteriores. Debes liquidar para continuar.`,
            leftover: leftoverHistorical
        };
    }

    writeLog(`[RESULT] ALLOWED`);
    return { isBlocked: false, reason: '', leftover: leftoverHistorical };
}
