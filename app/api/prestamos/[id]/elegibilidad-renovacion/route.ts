import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { getComprehensiveEvaluation, getTodayPeru, calculateRenovationAdjustment, getLoanHealthScoreAction, getFinancialConfig } from '@/lib/financial-logic'

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
        // 1. Obtener datos básicos, perfil y configuración en paralelo
        const [userResponse, systemConfig] = await Promise.all([
            supabase.auth.getUser(),
            getFinancialConfig(supabaseAdmin)
        ]);

        const user = userResponse.data.user;
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // 2. Obtener perfil, info de préstamo y origen en paralelo
        const [perfilRes, prestamoInfoRes, origenRes, elegibilidadRes] = await Promise.all([
            supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single(),
            supabaseAdmin.from('prestamos').select('estado, es_paralelo, cliente_id, monto, estado_mora').eq('id', id).single(),
            supabaseAdmin.from('renovaciones').select('prestamo_original:prestamo_original_id(estado)').eq('prestamo_nuevo_id', id).maybeSingle(),
            supabaseAdmin.rpc('evaluar_elegibilidad_renovacion', { p_prestamo_id: id })
        ]);

        const perfil = perfilRes.data;
        const prestamo = prestamoInfoRes.data;
        const origen = origenRes.data;
        const elegibilidad = elegibilidadRes.data;

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

        if (perfil.rol === 'supervisor') {
            return NextResponse.json({ 
                error: 'Los supervisores no tienen permisos para solicitar renovaciones.',
                elegibilidad: { elegible: false, razon_bloqueo: 'Rol no autorizado' } 
            }, { status: 403 })
        }

        const esProductoDeRefinanciamiento = (origen?.prestamo_original as any)?.estado === 'refinanciado'
        if ((esProductoDeRefinanciamiento || prestamo?.estado === 'refinanciado') && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: 'Este préstamo es producto de una refinanciación y solo puede ser renovado por el administrador.',
                elegibilidad: { elegible: false, razon_bloqueo: 'Producto de refinanciación' } 
            }, { status: 403 })
        }

        if (elegibilidadRes.error) {
            console.error('Error evaluating eligibility:', elegibilidadRes.error)
            return NextResponse.json({ error: elegibilidadRes.error.message }, { status: 400 })
        }

        let responseElegibilidad = elegibilidad;

        // EXCEPCIÓN ADMIN/ASESOR: Permitir renovar aunque el RPC diga que es paralelo
        const esAdmin = perfil.rol === 'admin'
        const esAsesor = perfil.rol === 'asesor'
        const esParaleloRazon = elegibilidad?.razon_bloqueo?.toLowerCase().includes('paralelo')

        if (elegibilidad && !elegibilidad.elegible && esParaleloRazon) {
            if (esAdmin || (esAsesor && prestamo && !prestamo.es_paralelo)) {
                // Bypass paralelo... (se calculará más abajo con loanFull)
            }
        }

        // 3. FETCH DATA PARA SCORES (Paso crítico de optimización)
        // Obtenemos todo el historial del cliente de una vez
        const clienteId = prestamo?.cliente_id || responseElegibilidad.cliente_id;

        const [loanFullRes, allClientLoansRes] = await Promise.all([
            supabaseAdmin.from('prestamos').select('*, cronograma_cuotas(*), clientes(*)').eq('id', id).single(),
            supabaseAdmin.from('prestamos').select('*, cronograma_cuotas(*)').eq('cliente_id', clienteId)
        ]);

        const loanFull = loanFullRes.data;
        const allClientLoans = allClientLoansRes.data;

        if (!loanFull) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        // Fetch de todos los pagos en un solo paso
        const allClientCuotasIds = (allClientLoans || []).flatMap(l => (l.cronograma_cuotas || []).map((c: any) => c.id))
        const { data: qAllPayments } = await supabaseAdmin
            .from('pagos')
            .select('*, cronograma_cuotas(prestamo_id)')
            .in('cuota_id', allClientCuotasIds)

        // 4. CÁLCULO DE MÉTRICAS Y SCORES (Sin volver a consultar DB)
        const todayPeru = getTodayPeru()
        
        // Pagos específicos del préstamo actual para el Health Score
        const loanCuotasIds = new Set((loanFull.cronograma_cuotas || []).map((c: any) => c.id));
        const currentLoanPayments = (qAllPayments || []).filter(p => p.cuota_id && loanCuotasIds.has(p.cuota_id));

        // Calcular Health Score directamente (reemplaza getLoanHealthScoreAction)
        const { calculateLoanMetrics } = require('@/lib/financial-logic');
        const metrics = calculateLoanMetrics(
            { ...loanFull, cronograma_cuotas: loanFull.cronograma_cuotas || [] },
            todayPeru,
            systemConfig,
            currentLoanPayments
        );

        const atomicHealthScore = {
            ...metrics,
            score: metrics.loanScore?.score ?? 100,
            details: metrics.loanScore?.details ?? [],
            pagos_puntuales: metrics.loanScore?.pagos_puntuales ?? 0,
            pagos_tardios: metrics.loanScore?.pagos_tardios ?? 0,
        };

        // Si entramos en modo Bypass de Paralelo, actualizamos responseElegibilidad
        if (elegibilidad && !elegibilidad.elegible && esParaleloRazon && (esAdmin || (esAsesor && !prestamo?.es_paralelo))) {
            const totalCuotas = (loanFull.cronograma_cuotas || []).reduce((sum: number, c: any) => sum + Number(c.monto_cuota), 0);
            const totalPagado = (loanFull.cronograma_cuotas || []).reduce((sum: number, c: any) => sum + Number(c.monto_pagado || 0), 0);
            const porcentajePagado = totalCuotas > 0 ? (totalPagado / totalCuotas) * 100 : 0;
            const saldoPendiente = totalCuotas - totalPagado;
            
            responseElegibilidad = {
                ...elegibilidad,
                elegible: true,
                score: atomicHealthScore.score,
                score_detalle: atomicHealthScore.loanScore,
                porcentaje_pagado: parseFloat(porcentajePagado.toFixed(2)),
                monto_original: loanFull.monto,
                saldo_pendiente: parseFloat(saldoPendiente.toFixed(2)),
                estado_prestamo: loanFull.estado || 'activo',
                estado_mora: loanFull.estado_mora || 'al_dia',
                requiere_excepcion: true,
                tipo_excepcion: esAdmin ? 'paralelo_admin' : 'paralelo_asesor_principal'
            };
        }

        // Evaluación integral (Reputación + Hábitos)
        const evaluation = getComprehensiveEvaluation(loanFull.clientes, allClientLoans || [], qAllPayments || [], id, systemConfig)

        // Ajuste de capital sugerido
        const adjustment = calculateRenovationAdjustment(
            atomicHealthScore.score, 
            evaluation.reputationScore, 
            responseElegibilidad.monto_original || loanFull.monto,
            responseElegibilidad.saldo_pendiente || 0,
            systemConfig
        )

        // Consolidar respuesta final
        const finalResponse = {
            ...responseElegibilidad,
            healthScore: atomicHealthScore.score,
            reputationScore: evaluation.reputationScore,
            loanScoreData: atomicHealthScore, 
            reputationScoreData: evaluation,
            monto_maximo: adjustment.montoSugerido,
            monto_minimo: Math.max(responseElegibilidad.monto_minimo || 0, responseElegibilidad.saldo_pendiente || 0, (loanFull.monto * 0.5)),
            ajuste_recomendado_pct: adjustment.totalPotentialPct,
            ajuste_detalles: adjustment.detalles,
            score: atomicHealthScore.score,
            config: systemConfig
        }

        // 1. Encontrar el monto máximo histórico pagado con éxito por este cliente
        const historicalMax = (allClientLoans || [])
            .filter(l => ['finalizado', 'liquidado', 'renovado'].includes(l.estado))
            .reduce((max, l) => Math.max(max, Number(l.monto || 0)), 0);

        // 2. Respetar Límite Global del Cliente, pero permitir al menos su récord histórico
        const clientLimit = parseFloat((loanFull.clientes as any)?.limite_prestamo || 0)
        
        // El límite efectivo es el mayor entre: su límite en ficha, su préstamo anterior o su récord histórico
        const effectiveLimit = Math.max(clientLimit, loanFull.monto, historicalMax)
        
        if (effectiveLimit > 0 && finalResponse.monto_maximo > effectiveLimit) {
            finalResponse.monto_maximo = effectiveLimit
        }
        
        // Garantizar que el monto_maximo no sea inferior al monto anterior si el ajuste es positivo
        if (adjustment.totalPotentialPct >= 0 && finalResponse.monto_maximo < loanFull.monto) {
            finalResponse.monto_maximo = loanFull.monto
        }

        return NextResponse.json(finalResponse)

    } catch (e: any) {
        console.error('Unexpected error in eligibility API:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
