import { SupabaseClient } from "@supabase/supabase-js";

export async function checkAdvisorBlocked(supabase: SupabaseClient, userId: string): Promise<{ isBlocked: boolean, reason: string, leftover: number }> {
    // --- 1. CONFIGURACIÓN DE FECHA LIMA ---
    const now = new Date();
    const limaTime = now.toLocaleString('en-US', { timeZone: 'America/Lima' });
    const limaDate = new Date(limaTime);
    const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`;
    const startOfTodayISO = `${todayStr}T00:00:00-05:00`;

    // --- 2. OBTENER CARTERAS DEL ASESOR ---
    // El dinero está vinculado a las carteras que gestiona el asesor.
    const { data: carteras } = await supabase
        .from('carteras')
        .select('id')
        .eq('asesor_id', userId);

    const carterIds = carteras?.map(c => c.id) || [];
    
    // Si no tiene carteras, no tiene deuda pendiente (o es un error de configuración)
    if (carterIds.length === 0) {
        return { isBlocked: false, reason: '', leftover: 0 };
    }

    // --- 3. CÁLCULO DE SALDO FINANCIERO (POR CARTERA) ---
    // a) Cuentas de cobranzas de sus carteras
    const { data: accounts } = await supabase
        .from('cuentas_financieras')
        .select('id, saldo')
        .in('cartera_id', carterIds)
        .eq('tipo', 'cobranzas');

    let leftoverHistorical = 0;
    if (accounts && accounts.length > 0) {
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
        leftoverHistorical = saldoActualTotal - deudaNetaHoy;
    }

    // --- 4. REVISIÓN DE INTEGRIDAD ---
    const { data: history } = await supabase
        .from('cuadres_diarios')
        .select('fecha, tipo_cuadre, estado')
        .eq('asesor_id', userId)
        .lt('fecha', todayStr)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

    if (history && history.length > 0) {
        const daysEvaluated = new Set();
        for (const record of history) {
            if (!daysEvaluated.has(record.fecha)) {
                daysEvaluated.add(record.fecha);
                if (record.tipo_cuadre !== 'final' || record.estado !== 'aprobado') {
                    const statusMsg = record.estado === 'pendiente' ? 'está PENDIENTE' : (record.estado === 'rechazado' ? 'fue RECHAZADO' : 'está INCOMPLETO');
                    const amountStr = leftoverHistorical > 1 
                        ? `. Saldo pendiente: S/ ${leftoverHistorical.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` 
                        : '';

                    return {
                        isBlocked: true,
                        reason: `El cierre del día ${record.fecha} ${statusMsg}${amountStr}. Debes regularizarlo con el administrador para operar hoy.`,
                        leftover: leftoverHistorical
                    };
                }
            }
        }
    }

    // --- 5. BLOQUEO POR SALDO ACUMULADO ---
    if (leftoverHistorical > 1.05) {
        return {
            isBlocked: true,
            reason: `Tienes un SALDO PENDIENTE de S/ ${leftoverHistorical.toLocaleString('es-PE', { minimumFractionDigits: 2 })} de días anteriores. Debes liquidar para continuar.`,
            leftover: leftoverHistorical
        };
    }

    return { isBlocked: false, reason: '', leftover: leftoverHistorical };
}
