import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // Verify user is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    if (perfil?.rol !== 'admin') {
        return NextResponse.json({ error: 'Solo administradores' }, { status: 403 })
    }

    const today = new Date().toISOString().split('T')[0]
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfMonthISO = startOfMonth.toISOString()

    // ============================================
    // BLOQUE 1: FINANZAS
    // ============================================

    // Capital Activo Total: Solo suma el componente de CAPITAL pendiente (NO interés)
    const { data: prestamosActivos } = await supabaseAdmin
        .from('prestamos')
        .select(`
            id,
            monto,
            interes,
            cronograma_cuotas (
                monto_cuota,
                monto_pagado,
                estado
            )
        `)
        .in('estado', ['activo'])

    let capital_activo_total = 0
    let capital_original_total = 0 // Para tasa de morosidad: usa monto original, no pendiente
    
    prestamosActivos?.forEach(p => {
        const cuotas = p.cronograma_cuotas || []
        const numCuotas = cuotas.length
        
        // Capital original del préstamo (para tasa de morosidad)
        const montoCapital = parseFloat(p.monto) || 0
        capital_original_total += montoCapital
        
        if (numCuotas > 0) {
            // Interés total = monto × (tasa/100)
            const interesTotal = montoCapital * (parseFloat(p.interes) || 0) / 100
            // Capital por cuota = monto / num_cuotas
            const capitalPorCuota = montoCapital / numCuotas
            // Interés por cuota = interés total / num_cuotas
            const interesPorCuota = interesTotal / numCuotas
            
            cuotas.forEach((c: any) => {
                if (c.estado === 'pagado') {
                    // Cuota completamente pagada, no suma
                } else if (c.estado === 'parcial') {
                    // Cuota parcialmente pagada
                    const montoPagado = parseFloat(c.monto_pagado) || 0
                    const montoCuota = parseFloat(c.monto_cuota) || 0
                    // Proporción pagada
                    const proporcionPagada = montoCuota > 0 ? montoPagado / montoCuota : 0
                    // Capital pendiente de esta cuota
                    capital_activo_total += capitalPorCuota * (1 - proporcionPagada)
                } else {
                    // Cuota pendiente, suma capital completo
                    capital_activo_total += capitalPorCuota
                }
            })
        }
    })

    // Ganancia Realizada Mes: Suma de interes_cobrado del mes actual
    const { data: pagosMes } = await supabaseAdmin
        .from('pagos')
        .select('monto_pagado, interes_cobrado')
        .gte('fecha_pago', startOfMonthISO)

    let ganancia_realizada_mes = 0
    pagosMes?.forEach(p => {
        // Si existe interes_cobrado usarlo, sino es 0
        ganancia_realizada_mes += parseFloat(p.interes_cobrado || 0)
    })

    // ============================================
    // BLOQUE 2: RIESGO
    // ============================================

    // Capital Vencido: Solo el componente de CAPITAL de cuotas vencidas (NO interés)
    const { data: cuotasVencidas } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select(`
            monto_cuota,
            monto_pagado,
            prestamo_id,
            prestamos!inner (estado, monto, interes)
        `)
        .lte('fecha_vencimiento', today)
        .in('estado', ['pendiente', 'parcial', 'vencido'])

    // Agrupar por préstamo para calcular capital por cuota
    const prestamoCuotasMap = new Map<string, { prestamo: any, cuotas: any[] }>()
    
    cuotasVencidas?.forEach((c: any) => {
        if (c.prestamos?.estado === 'activo') {
            const key = c.prestamo_id
            if (!prestamoCuotasMap.has(key)) {
                prestamoCuotasMap.set(key, { prestamo: c.prestamos, cuotas: [] })
            }
            prestamoCuotasMap.get(key)!.cuotas.push(c)
        }
    })

    let capital_vencido = 0
    const prestamosEnMoraSet = new Set<string>()

    // Calcular capital vencido por préstamo
    for (const [prestamoId, data] of prestamoCuotasMap) {
        const { prestamo, cuotas } = data
        const montoCapital = parseFloat(prestamo.monto) || 0
        
        // Obtener número total de cuotas del préstamo
        const { count: totalCuotas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('*', { count: 'exact', head: true })
            .eq('prestamo_id', prestamoId)
        
        if (totalCuotas && totalCuotas > 0) {
            const capitalPorCuota = montoCapital / totalCuotas
            
            cuotas.forEach((c: any) => {
                const montoCuota = parseFloat(c.monto_cuota) || 0
                const montoPagado = parseFloat(c.monto_pagado) || 0
                const pendiente = montoCuota - montoPagado
                
                if (pendiente > 0.01) {
                    // Proporción pendiente de la cuota
                    const proporcionPendiente = montoCuota > 0 ? pendiente / montoCuota : 1
                    // Capital vencido de esta cuota
                    capital_vencido += capitalPorCuota * proporcionPendiente
                    prestamosEnMoraSet.add(prestamoId)
                }
            })
        }
    }

    // Tasa de morosidad = (Capital Vencido / Capital ORIGINAL) × 100
    // Usa capital original, no el pendiente, porque la mora se mide contra lo desembolsado
    const tasa_morosidad_capital = capital_original_total > 0 
        ? (capital_vencido / capital_original_total) * 100 
        : 0

    const clientes_en_mora = prestamosEnMoraSet.size

    // Clientes castigados: préstamos en estado 'vencido' o con mora > 90 días (simplificado)
    const { count: clientes_castigados } = await supabaseAdmin
        .from('prestamos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'anulado') // Consideramos anulados como cartera perdida

    // ============================================
    // BLOQUE 3: OPERATIVIDAD
    // ============================================

    // Renovaciones del mes
    const { data: renovacionesMes, count: renovaciones_cantidad } = await supabaseAdmin
        .from('renovaciones')
        .select(`
            saldo_pendiente_original,
            prestamo_nuevo:prestamo_nuevo_id (monto)
        `, { count: 'exact' })
        .gte('fecha_renovacion', startOfMonthISO)

    let renovaciones_volumen = 0
    renovacionesMes?.forEach((r: any) => {
        renovaciones_volumen += parseFloat(r.prestamo_nuevo?.monto || 0)
    })

    // Total clientes activos con deuda vigente
    const { data: clientesConDeuda } = await supabaseAdmin
        .from('prestamos')
        .select('cliente_id')
        .eq('estado', 'activo')

    const clientesUnicos = new Set(clientesConDeuda?.map(p => p.cliente_id) || [])
    const total_clientes_activos = clientesUnicos.size

    // ============================================
    // BLOQUE 4: OPORTUNIDADES (Recaptables)
    // ============================================

    // Clientes con préstamo finalizado SIN préstamo activo actual
    const { data: clientesFinalizados } = await supabaseAdmin
        .from('prestamos')
        .select(`
            cliente_id,
            monto,
            clientes (id, nombres, telefono),
            cronograma_cuotas (fecha_pago)
        `)
        .eq('estado', 'finalizado')
        .order('created_at', { ascending: false })

    // Filtrar clientes que NO tienen préstamo activo
    const clientesConActivo = new Set(clientesConDeuda?.map(p => p.cliente_id) || [])
    
    const recaptablesMap = new Map<string, any>()
    clientesFinalizados?.forEach((p: any) => {
        if (!clientesConActivo.has(p.cliente_id) && !recaptablesMap.has(p.cliente_id)) {
            // Encontrar última fecha de pago
            const pagos = p.cronograma_cuotas?.filter((c: any) => c.fecha_pago) || []
            const ultimoPago = pagos.length > 0 
                ? pagos.sort((a: any, b: any) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime())[0]?.fecha_pago
                : null

            recaptablesMap.set(p.cliente_id, {
                id: p.cliente_id,
                nombre: p.clientes?.nombres || 'Sin nombre',
                telefono: p.clientes?.telefono || 'Sin teléfono',
                ultimo_pago: ultimoPago,
                monto_ultimo_prestamo: parseFloat(p.monto)
            })
        }
    })

    const recaptables = Array.from(recaptablesMap.values()).slice(0, 20) // Limitar a 20

    // ============================================
    // RESPONSE
    // ============================================

    return NextResponse.json({
        finanzas: {
            capital_activo_total: Math.round(capital_activo_total * 100) / 100,
            ganancia_realizada_mes: Math.round(ganancia_realizada_mes * 100) / 100
        },
        riesgo: {
            capital_vencido: Math.round(capital_vencido * 100) / 100,
            tasa_morosidad_capital: Math.round(tasa_morosidad_capital * 100) / 100,
            clientes_en_mora,
            clientes_castigados: clientes_castigados || 0
        },
        operatividad: {
            renovaciones_mes: {
                cantidad: renovaciones_cantidad || 0,
                volumen: Math.round(renovaciones_volumen * 100) / 100
            },
            total_clientes_activos
        },
        oportunidades: {
            recaptables
        }
    })
}
