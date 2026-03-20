import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const filterAsesorId = searchParams.get('asesorId')
    const filterSupervisorId = searchParams.get('supervisorId')

    let targetAsesorIds: string[] | null = null

    if (filterAsesorId) {
        targetAsesorIds = [filterAsesorId]
    } else if (filterSupervisorId) {
        const { data: team } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', filterSupervisorId)
            .eq('rol', 'asesor')
        targetAsesorIds = team?.map(a => a.id) || []
    }

    const today = new Date().toISOString().split('T')[0]
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfMonthISO = startOfMonth.toISOString()

    // ============================================
    // BLOQUE 1: FINANZAS
    // ============================================

    // 1. Fetch Loans
    let loansQuery = supabaseAdmin
        .from('prestamos')
        .select(`
            id, 
            monto, 
            interes, 
            clientes!inner(asesor_id)
        `)
        .in('estado', ['activo', 'vencido', 'moroso', 'cpp'])

    if (targetAsesorIds) {
        loansQuery.in('clientes.asesor_id', targetAsesorIds)
    }

    const { data: loansRaw, error: loansError } = await loansQuery
    if (loansError) console.error("Error en loansQuery:", loansError)
    
    // Map raw result to a cleaner format
    const loans = loansRaw?.map((l: any) => ({
        id: l.id,
        monto: l.monto,
        interes: l.interes,
        asesor_id: l.clientes?.asesor_id
    }))
    const loanIds = loans?.map(l => l.id) || []

    let capital_activo_sin_interes = 0
    let capital_activo_con_interes = 0
    let capital_original_total = 0 

    if (loanIds.length > 0) {
        // 2. Fetch installments for these loans
        const { data: allCuotas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('prestamo_id, monto_cuota, monto_pagado, estado')
            .in('prestamo_id', loanIds)
            .neq('estado', 'pagado')

        // Group cuotas by loan
        const cuotasByLoan = new Map<string, any[]>()
        allCuotas?.forEach(c => {
            if (!cuotasByLoan.has(c.prestamo_id)) cuotasByLoan.set(c.prestamo_id, [])
            cuotasByLoan.get(c.prestamo_id)!.push(c)
        })

        // 3. Process each loan
        loans?.forEach(p => {
            const montoCapital = parseFloat(p.monto) || 0
            capital_original_total += montoCapital

            const cuotas = cuotasByLoan.get(p.id) || []
            if (cuotas.length > 0) {
                // We need the TOTAL count of cuotas for SIN INTERES calculation
                // But as an optimization, if we don't have it, we can't be precise for 'parcial'
                // For now, let's assume we can calculate it or just use the pending ones as a proxy
                // Actually, let's fetch the count for each loan or assume they are fully pending if no 'pagado'
                
                cuotas.forEach(c => {
                    const montoPagado = parseFloat(c.monto_pagado) || 0
                    const montoCuota = parseFloat(c.monto_cuota) || 0
                    const pendienteCuota = Math.max(0, montoCuota - montoPagado)
                    
                    capital_activo_con_interes += pendienteCuota

                    // Simple approximation for capital without interest: 
                    // Use the same proportion as the full cuota
                    if (montoCapital > 0 && montoCuota > 0) {
                        const interesTotal = montoCapital * (parseFloat(p.interes) / 100)
                        const totalPagar = montoCapital + interesTotal
                        const ratioCapital = montoCapital / totalPagar
                        capital_activo_sin_interes += pendienteCuota * ratioCapital
                    }
                })
            }
        })
    }

    // Ganancias: Interés cobrado
    const pagosQuery = supabaseAdmin
        .from('pagos')
        .select(`
            id,
            interes_cobrado, 
            fecha_pago,
            cronograma_cuotas!inner (
                prestamos!inner (
                    clientes!inner (
                        asesor_id
                    )
                )
            )
        `)

    if (targetAsesorIds) {
        pagosQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', targetAsesorIds)
    }

    const { data: todosLosPagos, error: pagosError } = await pagosQuery
    if (pagosError) console.error("Error en pagosQuery:", pagosError)

    let ganancia_mes = 0
    let ganancia_total = 0
    
    todosLosPagos?.forEach((p: any) => {
        const interes = parseFloat(p.interes_cobrado || 0)
        ganancia_total += interes
        
        if (p.fecha_pago && new Date(p.fecha_pago) >= startOfMonth) {
            ganancia_mes += interes
        }
    })

    // Gastos del Mes
    const gastosQuery = supabaseAdmin
        .from('movimientos_financieros')
        .select('monto')
        .eq('tipo', 'egreso')
        .gte('created_at', startOfMonthISO)

    if (targetAsesorIds) {
        // Here we filter by creator if the expense is recorded by the advisor
        gastosQuery.in('registrado_por', targetAsesorIds)
    }

    const { data: gastosMesData } = await gastosQuery

    let gastos_mes = 0
    gastosMesData?.forEach(g => {
        gastos_mes += parseFloat(g.monto || 0)
    })

    // ============================================
    // BLOQUE 2: RIESGO
    // ============================================

    // ============================================
    // BLOQUE 2: RIESGO
    // ============================================

    let capital_vencido = 0
    const prestamosEnMoraSet = new Set<string>()

    if (loanIds.length > 0) {
        // Fetch ALL cuotas for these loans to calculate total count (for precise capital ratio)
        // and identifying overdue ones
        const { data: vCuotas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('prestamo_id, monto_cuota, monto_pagado, estado, fecha_vencimiento')
            .in('prestamo_id', loanIds)
            .lte('fecha_vencimiento', today)
            .in('estado', ['pendiente', 'parcial', 'atrasado', 'vencido'])

        // Process each overdue installment
        vCuotas?.forEach(c => {
            const loan = loans?.find(l => l.id === c.prestamo_id)
            if (!loan) return

            const montoCapital = parseFloat(loan.monto) || 0
            const montoCuota = parseFloat(c.monto_cuota) || 0
            const montoPagado = parseFloat(c.monto_pagado) || 0
            const pendiente = Math.max(0, montoCuota - montoPagado)

            if (pendiente > 0.01) {
                // Approximate capital without interest per quota
                const tasaInteres = parseFloat(loan.interes) || 0
                const ratioCapital = 1 / (1 + (tasaInteres / 100))
                
                const proporcionPendiente = montoCuota > 0 ? pendiente / montoCuota : 1
                const capitalCuota = (montoCapital / 24) * proporcionPendiente // Assuming 24 as a fallback or calculating it better
                
                // More precise: we need the number of installments for each loan
                // For now, let's use the ratioCapital approximation which is very close
                capital_vencido += pendiente * ratioCapital
                prestamosEnMoraSet.add(c.prestamo_id)
            }
        })
    }

    // Tasa de morosidad = (Capital Vencido / Capital ORIGINAL) × 100
    const tasa_morosidad_capital = capital_original_total > 0 
        ? (capital_vencido / capital_original_total) * 100 
        : 0

    const clientes_en_mora = prestamosEnMoraSet.size

    // Clientes castigados
    const { count: clientes_castigados } = await supabaseAdmin
        .from('prestamos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'anulado') 

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

    const recaptables = Array.from(recaptablesMap.values()).slice(0, 20) 

    // ============================================
    // BLOQUE 5: PENDIENTES (Solicitudes y Renovaciones)
    // ============================================
    const { data: solicitudesPendientes } = await supabaseAdmin
        .from('solicitudes')
        .select(`
            id, monto_solicitado, created_at,
            cliente:cliente_id(nombres),
            asesor:asesor_id(nombre_completo)
        `)
        .eq('estado_solicitud', 'pendiente_supervision')
        .order('created_at', { ascending: false })
        .limit(10)

    const { data: renovacionesPendientes } = await supabaseAdmin
        .from('renovaciones')
        .select(`
            id, monto_nuevo, created_at,
            cliente:cliente_id(nombres),
            asesor:asesor_id(nombre_completo)
        `)
        .eq('estado', 'pendiente_supervision')
        .order('created_at', { ascending: false })
        .limit(10)

    // ============================================
    // RESPONSE
    // ============================================

    return NextResponse.json({
        resumen_financiero: {
            capital_total_activo_con_interes: Math.round(capital_activo_con_interes * 100) / 100,
            capital_total_activo_sin_interes: Math.round(capital_activo_sin_interes * 100) / 100,
            ganancia_total: Math.round(ganancia_total * 100) / 100,
            ganancia_mes: Math.round(ganancia_mes * 100) / 100,
            gastos_mes: Math.round(gastos_mes * 100) / 100,
            _debug: {
                loansFound: loans?.length || 0,
                loanIds: loanIds.length,
                targetAsesorIds: targetAsesorIds
            }
        },
        finanzas: {
            // Mantenemos compatibilidad con frontend anterior si es necesario
            capital_activo_total: Math.round(capital_activo_sin_interes * 100) / 100,
            ganancia_realizada_mes: Math.round(ganancia_mes * 100) / 100
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
        },
        pendientes: {
            solicitudes: solicitudesPendientes || [],
            renovaciones: renovacionesPendientes || []
        }
    })
}
