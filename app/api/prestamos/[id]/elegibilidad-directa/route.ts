import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { getComprehensiveEvaluation, getTodayPeru, calculateRenovationAdjustment, getLoanHealthScoreAction, getFinancialConfig } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

// GET - Verificar elegibilidad para refinanciacion directa admin
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // 1. Verificar Rol Admin Estrictamente
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo los administradores pueden usar la refinanciación directa', elegibilidad: { elegible: false, razon_bloqueo: 'Usuario no es administrador' } }, { status: 403 })
        }

        // 2. Obtener datos básicos del préstamo y el límite del cliente
        const { data: prestamo } = await supabaseAdmin
            .from('prestamos')
            .select(`
                *,
                clientes:cliente_id(limite_prestamo)
            `)
            .eq('id', id)
            .single()

        if (!prestamo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        // 3. Evaluar elegibilidad general ignorando el bloqueo de "porcentaje pagado".
        // Reusamos la lógica de RPC pero forzamos el 'elegible' en el cliente.
        // Como alternativa, podemos calcular el score y los límites directamente.
        
        // Calcular porcentaje pagado (sólo para visualización)
        const { data: cuotasData } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('monto_cuota, monto_pagado')
            .eq('prestamo_id', id)
        
        let totalCuotas = 0;
        let totalPagado = 0;
        
        if (cuotasData) {
            totalCuotas = cuotasData.reduce((sum, c) => sum + Number(c.monto_cuota), 0);
            totalPagado = cuotasData.reduce((sum, c) => sum + Number(c.monto_pagado || 0), 0);
        }

        const porcentajePagado = totalCuotas > 0 ? (totalPagado / totalCuotas) * 100 : 0;
        const saldoPendiente = totalCuotas - totalPagado;

        // [NUEVO] CALCULAR SCORES DUALES USANDO LÓGICA CENTRALIZADA
        const todayPeru = getTodayPeru()
        
        // 1. Fetch full loan data for score
        const { data: loanFull } = await supabaseAdmin
            .from('prestamos')
            .select('*, cronograma_cuotas(*), clientes(*)')
            .eq('id', id)
            .single()
        
        // 2. Fetch all client loans for reputation (Sencillo, sin pagos anidados)
        const { data: allClientLoans } = await supabaseAdmin
            .from('prestamos')
            .select('*, cronograma_cuotas(*)')
            .eq('cliente_id', prestamo.cliente_id)

        // 3. Fetch TODOS los pagos del cliente en una sola query plana (MUCHO más rápido)
        const prestamoIds = allClientLoans?.map(l => l.id) || []
        const { data: qAllPayments } = await supabaseAdmin
            .from('pagos')
            .select('*, cronograma_cuotas!inner(prestamo_id)')
            .in('cronograma_cuotas.prestamo_id', prestamoIds)

        // [ATOMICO] Obtener Salud del Préstamo (La "Verdad" de 18 PTS)
        const atomicHealthScore = await getLoanHealthScoreAction(supabaseAdmin, id)

        // [NUEVO] Obtener configuración centralizada
        const systemConfig = await getFinancialConfig(supabaseAdmin)

        // [NUEVO] CALCULAR EVALUACIÓN INTEGRAL CENTRALIZADA (con optimización de pagos e ID específico)
        const evaluation = getComprehensiveEvaluation(loanFull.clientes as any, allClientLoans || [], qAllPayments || [], id, systemConfig)

        // [NUEVO] CALCULAR AJUSTE DE CAPITAL SEGÚN REGLAS DE NEGOCIO ACTUALIZADAS
        const adjustment = calculateRenovationAdjustment(
            atomicHealthScore.score, 
            evaluation.reputationScore, 
            prestamo.monto
        )

        const montoOriginal = prestamo.monto;
        let montoMaximo = adjustment.montoSugerido;
        let montoMinimo = montoOriginal * 0.5;

        if (saldoPendiente > 0) {
            montoMinimo = Math.max(montoMinimo, saldoPendiente);
        }

        const clientLimit = parseFloat((prestamo.clientes as any)?.limite_prestamo || 0);
        if (clientLimit > 0 && montoMaximo > clientLimit) {
            montoMaximo = clientLimit;
        }

        if (montoMaximo < montoMinimo) {
            montoMaximo = montoMinimo;
        }

        // Respuesta siempre elegible para el Admin
        const elegibilidadMock = {
            elegible: true,
            score: atomicHealthScore.score, // Legacy support
            healthScore: atomicHealthScore.score,
            reputationScore: evaluation.reputationScore,
            loanScoreData: atomicHealthScore,
            score_detalle: atomicHealthScore, // Legacy support fix
            porcentaje_pagado: parseFloat(porcentajePagado.toFixed(2)),
            monto_original: prestamo.monto,
            saldo_pendiente: parseFloat(saldoPendiente.toFixed(2)),
            monto_maximo: parseFloat(montoMaximo.toFixed(2)),
            monto_minimo: parseFloat(montoMinimo.toFixed(2)),
            ajuste_recomendado_pct: adjustment.totalPotentialPct, // Sincronizado
            requiere_excepcion: true,
            tipo_excepcion: 'mora_critica',
            estado_prestamo: prestamo.estado,
            estado_mora: prestamo.estado_mora,
            es_refinanciado: prestamo.estado === 'refinanciado',
            es_ultimo_prestamo: true,
            requiere_admin_excepcion: true
        }

        return NextResponse.json(elegibilidadMock)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
