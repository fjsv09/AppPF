import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { getComprehensiveEvaluation, getTodayPeru } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

// GET - Verificar elegibilidad para renovación
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

        // Obtener perfil para verificar rol
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

        // Bloqueo estricto para supervisores según reglas de negocio
        if (perfil.rol === 'supervisor') {
            return NextResponse.json({ 
                error: 'Los supervisores no tienen permisos para solicitar renovaciones.',
                elegibilidad: { elegible: false, razon_bloqueo: 'Rol no autorizado' } 
            }, { status: 403 })
        }

        // OBTENER ESTADO DEL PRÉSTAMO Y ORIGEN PARA VALIDACIONES TEMPRANAS
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('estado')
            .eq('id', id)
            .single()

        const { data: origen } = await supabaseAdmin
            .from('renovaciones')
            .select('prestamo_original:prestamo_original_id(estado)')
            .eq('prestamo_nuevo_id', id)
            .maybeSingle()
        
        const esProductoDeRefinanciamiento = (origen?.prestamo_original as any)?.estado === 'refinanciado'

        if ((esProductoDeRefinanciamiento || prestamoInfo?.estado === 'refinanciado') && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: 'Este préstamo es producto de una refinanciación y solo puede ser renovado por el administrador.',
                elegibilidad: { elegible: false, razon_bloqueo: 'Producto de refinanciación' } 
            }, { status: 403 })
        }

        // Evaluar elegibilidad usando la función RPC
        const { data: elegibilidad, error } = await supabaseAdmin
            .rpc('evaluar_elegibilidad_renovacion', { p_prestamo_id: id })

        if (error) {
            console.error('Error evaluating eligibility:', error)
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        // OBTENER DATOS DEL PRÉSTAMO PARA VALIDACIONES DE BYPASS
        const { data: prestamo } = await supabaseAdmin
            .from('prestamos')
            .select('es_paralelo, cliente_id')
            .eq('id', id)
            .single()

        let responseElegibilidad = elegibilidad;

        // EXCEPCIÓN ADMIN/ASESOR: Permitir renovar aunque el RPC diga que es paralelo (si el préstamo en sí no lo es para el asesor)
        const esAdmin = perfil.rol === 'admin'
        const esAsesor = perfil.rol === 'asesor'
        const esParaleloRazon = elegibilidad?.razon_bloqueo?.toLowerCase().includes('paralelo')

        if (elegibilidad && !elegibilidad.elegible && esParaleloRazon) {
            // Si es Admin, siempre permitimos el bypass de paralelo.
            // Si es Asesor, permitimos el bypass SOLO si el préstamo actual NO es el paralelo (!prestamo.es_paralelo).
            if (esAdmin || (esAsesor && prestamo && !prestamo.es_paralelo)) {
                // Intentar obtener score real para que el modal no se vea vacío
                const { data: scoreDataRaw } = await supabaseAdmin.rpc('calcular_score_cliente', { p_cliente_id: prestamo?.cliente_id || elegibilidad.cliente_id })
                const scoreDataStr = typeof scoreDataRaw === 'string' ? scoreDataRaw : JSON.stringify(scoreDataRaw || '{}')
                const scoreDetalle = JSON.parse(scoreDataStr)
                
                // Calcular progreso del préstamo actual para visualización realista
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
                
                // Re-obtener monto original y límites del cliente
                const { data: prestamoFull } = await supabaseAdmin
                    .from('prestamos')
                    .select('monto, estado, estado_mora, clientes:cliente_id(limite_prestamo)')
                    .eq('id', id)
                    .single()
                
                const montoOriginal = prestamoFull?.monto || 0;
                const scoreValue = parseInt(scoreDetalle.score !== undefined ? scoreDetalle.score : '50');
                
                // Límites según Score (reusando lógica original de elegibilidad)
                let montoMaximo = montoOriginal;
                let montoMinimo = montoOriginal * 0.5;

                if (scoreValue >= 80) montoMaximo = montoOriginal * 1.40;
                else if (scoreValue >= 60) montoMaximo = montoOriginal * 1.20;
                else if (scoreValue < 40) montoMaximo = montoOriginal * 0.8;

                if (saldoPendiente > 0) {
                    montoMinimo = Math.max(montoMinimo, saldoPendiente);
                }

                const clientLimit = parseFloat((prestamoFull?.clientes as any)?.limite_prestamo || 0);
                if (clientLimit > 0 && montoMaximo > clientLimit) {
                    montoMaximo = clientLimit;
                }

                if (montoMaximo < montoMinimo) {
                    montoMaximo = montoMinimo;
                }

                responseElegibilidad = {
                    ...elegibilidad,
                    elegible: true,
                    score: scoreValue,
                    score_detalle: scoreDetalle,
                    porcentaje_pagado: parseFloat(porcentajePagado.toFixed(2)),
                    monto_original: montoOriginal,
                    saldo_pendiente: parseFloat(saldoPendiente.toFixed(2)),
                    monto_maximo: parseFloat(montoMaximo.toFixed(2)),
                    monto_minimo: parseFloat(montoMinimo.toFixed(2)),
                    estado_prestamo: prestamoFull?.estado || 'activo',
                    estado_mora: prestamoFull?.estado_mora || 'al_dia',
                    requiere_excepcion: true,
                    tipo_excepcion: esAdmin ? 'paralelo_admin' : 'paralelo_asesor_principal'
                };
            }
        }

        // [NUEVO] CALCULAR SCORES DUALES USANDO LÓGICA CENTRALIZADA (lib/financial-logic)
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
            .eq('cliente_id', prestamo?.cliente_id || responseElegibilidad.cliente_id)

        // 3. Fetch TODOS los pagos del cliente en una sola query plana (MUCHO más rápido)
        const prestamoIds = allClientLoans?.map(l => l.id) || []
        const { data: qAllPayments } = await supabaseAdmin
            .from('pagos')
            .select('*, cronograma_cuotas!inner(prestamo_id)')
            .in('cronograma_cuotas.prestamo_id', prestamoIds)

        // [NUEVO] CALCULAR EVALUACIÓN INTEGRAL CENTRALIZADA (con optimización de pagos y ID específico)
        const evaluation = getComprehensiveEvaluation(loanFull.clientes, allClientLoans || [], qAllPayments || [], id)

        // Actualizar respuesta con los nuevos scores
        const finalResponse = {
            ...responseElegibilidad,
            healthScore: evaluation.healthScore,
            reputationScore: evaluation.reputationScore,
            loanScoreData: evaluation.healthScoreData, // Para el desglose en el modal
            // Sobrescribir el score legacy si existe
            score: evaluation.healthScore 
        }

        return NextResponse.json(finalResponse)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
