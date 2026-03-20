import { SupabaseClient } from "@supabase/supabase-js";

export async function checkAdvisorBlocked(supabase: SupabaseClient, userId: string): Promise<{ isBlocked: boolean, reason: string, leftover: number }> {
    const { data: lastFinal } = await supabase
        .from('cuadres_diarios')
        .select('created_at')
        .eq('asesor_id', userId)
        .eq('tipo_cuadre', 'final')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!lastFinal) {
        return { isBlocked: false, reason: '', leftover: 0 };
    }

    const tLastFinal = lastFinal.created_at;

    const { data: carteras } = await supabase
        .from('carteras')
        .select('id')
        .eq('asesor_id', userId);
    
    if (!carteras || carteras.length === 0) {
        return { isBlocked: false, reason: '', leftover: 0 };
    }

    const carteraIds = carteras.map((c: any) => c.id);

    // 1. Current Saldo in cobranzas
    const { data: cuentas } = await supabase
        .from('cuentas_financieras')
        .select('saldo')
        .in('cartera_id', carteraIds)
        .eq('tipo', 'cobranzas');

    const saldoActual = cuentas?.reduce((acc: number, c: any) => acc + parseFloat(c.saldo), 0) || 0;

    // 2. Ingresos since last Cierre Final
    const { data: pagosPost } = await supabase
        .from('pagos')
        .select('monto_pagado')
        .eq('registrado_por', userId)
        .gte('created_at', tLastFinal);
    
    const ingresosSince = pagosPost?.reduce((acc: number, p: any) => acc + parseFloat(p.monto_pagado), 0) || 0;

    // 3. Gastos since last Cierre Final
    const { data: gastosPost } = await supabase
        .from('movimientos_financieros')
        .select('monto')
        .in('cartera_id', carteraIds)
        .eq('tipo', 'egreso')
        .gte('created_at', tLastFinal);
    
    const gastosSince = gastosPost?.reduce((acc: number, g: any) => acc + parseFloat(g.monto), 0) || 0;

    const leftover = saldoActual - ingresosSince + gastosSince;

    if (leftover > 1) { // 1 to account for any decimal rounding anomalies
        return {
            isBlocked: true,
            reason: `Quedó un saldo pendiente de S/ ${leftover.toFixed(2)} por cuadrar de tu último Cierre del Día. Regulariza tu cuadre para continuar operando.`,
            leftover
        };
    }

    return { isBlocked: false, reason: '', leftover: 0 };
}
