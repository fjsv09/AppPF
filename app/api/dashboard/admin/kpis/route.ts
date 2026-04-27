import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { calculateLoanMetrics, getTodayPeru, calculateMoraBancaria } from '@/lib/financial-logic'

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

    if (filterAsesorId && filterAsesorId !== 'all' && filterAsesorId !== 'null' && filterAsesorId !== '') {
        targetAsesorIds = [filterAsesorId]
    } else if (filterSupervisorId && filterSupervisorId !== 'all' && filterSupervisorId !== 'null' && filterSupervisorId !== '') {
        const { data: team } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', filterSupervisorId)
            .eq('rol', 'asesor')
        targetAsesorIds = team?.map(a => a.id) || []
    }

    const today = getTodayPeru()
    const startOfMonthISO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01T00:00:00`

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
            es_paralelo,
            estado,
            estado_mora,
            cliente_id,
            cuotas,
            frecuencia,
            fecha_inicio,
            clientes!inner(asesor_id)
        `)
        .in('estado', ['activo', 'vencido', 'moroso', 'cpp', 'legal'])

    if (targetAsesorIds) {
        loansQuery.in('clientes.asesor_id', targetAsesorIds)
    }

    const { data: loansRaw, error: loansError } = await loansQuery
    if (loansError) console.error("Error en loansQuery:", loansError)
    
    // Map raw result to a cleaner format
    const loans = loansRaw?.map((l: any) => ({
        ...l,
        asesor_id: l.clientes?.asesor_id
    }))
    const loanIds = loans?.map(l => l.id) || []

    let capital_activo_sin_interes = 0
    let capital_activo_con_interes = 0
    let capital_original_total = 0
    let total_renovables = 0
    let totalVencidos = 0
    let totalAlertaCritica = 0
    let totalAdvertencia = 0
    
    // 1.5. Configuración del Sistema
    const { data: configSistema } = await supabaseAdmin.from('configuracion_sistema').select('clave, valor')
    const config = {
        renovacionMinPagado: parseInt(configSistema?.find(c => c.clave === 'renovacion_min_pagado')?.valor || '60'),
        umbralCpp: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_cuotas')?.valor || '4'),
        umbralMoroso: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_cuotas')?.valor || '7'),
        umbralCppOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_otros')?.valor || '1'),
        umbralMorosoOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_otros')?.valor || '2')
    }

    if (loanIds.length > 0) {
        // 2. Fetch installments for these loans
        const { data: allCuotas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('prestamo_id, monto_cuota, monto_pagado, estado, fecha_vencimiento')
            .in('prestamo_id', loanIds)
            // No filtramos por estado aquí porque calculateLoanMetrics necesita todo el cronograma
            // para calcular saldo pendiente correctamente

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
            // Inyectar cuotas en el objeto loan para calculateLoanMetrics
            p.cronograma_cuotas = cuotas

            const metrics = calculateLoanMetrics(p, today, config)
            if (metrics.esRenovable) total_renovables++

            // --- LÓGICA DE RIESGO (Sincronizada con Supervisor Dashboard) ---
            const crono = p.cronograma_cuotas || [];
            const sorted = [...crono].sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());
            const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].fecha_vencimiento : null;
            
            const isActuallyVencido = lastDate && lastDate < today && metrics.saldoPendiente > 1.0 && metrics.cuotasAtrasadas > 0;
            
            if (isActuallyVencido) {
                totalVencidos++;
            } else { 
                if (metrics.isCritico) totalAlertaCritica++; 
                else if (metrics.isMora) totalAdvertencia++; 
            }

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

    // Pagos y Cobros
    const pagosQuery = supabaseAdmin
        .from('pagos')
        .select(`
            id,
            interes_cobrado,
            monto_pagado,
            fecha_pago,
            es_autopago_renovacion,
            cronograma_cuotas!inner (
                prestamos!inner (
                    clientes!inner (
                        asesor_id
                    )
                )
            )
        `)
        .neq('estado_verificacion', 'rechazado')

    if (targetAsesorIds) {
        pagosQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', targetAsesorIds)
    }

    const { data: todosLosPagos, error: pagosError } = await pagosQuery
    if (pagosError) console.error("Error en pagosQuery:", pagosError)

    let ganancia_mes = 0
    let ganancia_total = 0
    let cobro_cuotas_mes = 0
    
    todosLosPagos?.forEach((p: any) => {
        const interes = parseFloat(p.interes_cobrado || 0)
        const montoTotal = parseFloat(p.monto_pagado || 0)
        ganancia_total += interes
        
        if (p.fecha_pago && p.fecha_pago >= startOfMonthISO) {
            ganancia_mes += interes
            // Solo sumar al cobro de cuotas si no es un autopago de renovación (que es virtual)
            // Y nos aseguramos de que sea cash (no autopago)
            if (p.es_autopago_renovacion !== true) {
                cobro_cuotas_mes += montoTotal
            }
        }
    })

    // Gastos del Mes y Salidas por Préstamos
    const gastosQuery = supabaseAdmin
        .from('movimientos_financieros')
        .select('monto, categoria_id, descripcion, registrado_por, cartera_id')
        .eq('tipo', 'egreso')
        .gte('created_at', startOfMonthISO)

    if (targetAsesorIds && targetAsesorIds.length > 0) {
        // Obtenemos carteras para filtrar los desembolsos de este asesor/equipo
        const { data: userCarteras } = await supabaseAdmin
            .from('carteras')
            .select('id')
            .in('asesor_id', targetAsesorIds)
        
        const carteraIds = userCarteras?.map(c => c.id) || []
        
        // Filtro: movimientos registrados por el asesor (gastos manuales) 
        // O movimientos vinculados a sus carteras (desembolsos de préstamos aprobados por admin)
        let orFilter = `registrado_por.in.(${targetAsesorIds.join(',')})`
        if (carteraIds.length > 0) {
            orFilter += `,cartera_id.in.(${carteraIds.join(',')})`
        }
        gastosQuery.or(orFilter)
    }

    const { data: gastosMesRaw } = await gastosQuery

    let gastos_mes = 0
    let salidas_prestamos_mes = 0
    
    gastosMesRaw?.forEach(g => {
        const monto = parseFloat(g.monto || 0)
        const desc = (g.descripcion || '').toLowerCase()
        
        if (g.categoria_id !== null) {
            // Gastos registrados por usuarios (tienen categoría)
            gastos_mes += monto
        } else {
            // Movimientos de sistema (sin categoría): Préstamos, Renovaciones, Nómina
            const isPayroll = desc.includes('nómina') || desc.includes('nomina') || desc.includes('sueldo') || desc.includes('adelanto')
            const isSettlement = desc.includes('cuadre') || desc.includes('liquidación') || desc.includes('liquidacion')
            
            if (!isPayroll && !isSettlement) {
                // Si no es nómina ni liquidación de cuadre, es un desembolso (Préstamo, Renovación, etc.)
                salidas_prestamos_mes += monto
            }
        }
    })

    // ============================================
    // BLOQUE 2: RIESGO
    // ============================================

    const moraBancaria = calculateMoraBancaria(loans || [], today);
    const tasa_morosidad_capital = moraBancaria.tasaMorosidadCapital;
    const capital_vencido = moraBancaria.capitalVencido;
    const clientes_en_mora = moraBancaria.countLoansInMora;

    // Clientes castigados
    const { count: clientes_castigados } = await supabaseAdmin
        .from('prestamos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'anulado') 

    // ============================================
    // BLOQUE 3: OPERATIVIDAD
    // ============================================

    // Renovaciones del mes (Sincronizado con filtros)
    let renovQuery = supabaseAdmin
        .from('renovaciones')
        .select(`
            saldo_pendiente_original,
            prestamo_nuevo:prestamo_nuevo_id!inner (
                monto,
                clientes!inner (asesor_id)
            )
        `, { count: 'exact' })
        .gte('fecha_renovacion', startOfMonthISO)

    if (targetAsesorIds) {
        renovQuery.in('prestamo_nuevo.clientes.asesor_id', targetAsesorIds)
    }

    const { data: renovacionesMes, count: renovaciones_cantidad } = await renovQuery

    let renovaciones_volumen = 0
    renovacionesMes?.forEach((r: any) => {
        renovaciones_volumen += parseFloat(r.prestamo_nuevo?.monto || 0)
    })

    // Total clientes ACTIVOS (Sincronizado con Cobranza Vigente)
    const { data: renovacionesRefinanciamiento } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
    
    const prestamoIdsProductoRefinanciamiento = new Set(
        (renovacionesRefinanciamiento || [])
            .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
            .map((r: any) => r.prestamo_nuevo_id as string)
            .filter(Boolean)
    )

    const clientesConActivoVigente = new Set()
    const clientesConDeudaCualquiera = new Set() // Para filtrar recaptables
    
    // Usamos 'loans' y 'cuotasByLoan' que ya tenemos cargados al inicio del API
    loans?.forEach(p => {
        const metrics = calculateLoanMetrics(p, today, config)
        
        const isMainLoan = !p.es_paralelo
        const isNotRefinancedProduct = !prestamoIdsProductoRefinanciamiento.has(p.id)
        const isNotVencido = p.estado_mora !== 'vencido'
        const hasBalance = metrics.saldoPendiente > 0.01

        if (p.estado === 'activo') {
            clientesConDeudaCualquiera.add(p.cliente_id)
        }

        if (p.estado === 'activo' && isMainLoan && isNotRefinancedProduct && isNotVencido && hasBalance) {
            clientesConActivoVigente.add(p.cliente_id)
        }
    })

    const total_clientes_activos = clientesConActivoVigente.size

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

    // Filtrar clientes que NO tienen ningún préstamo activo (usando el set que poblamos arriba)
    const recaptablesMap = new Map<string, any>()
    clientesFinalizados?.forEach((p: any) => {
        if (!clientesConDeudaCualquiera.has(p.cliente_id) && !recaptablesMap.has(p.cliente_id)) {
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
            salidas_prestamos_mes: Math.round(salidas_prestamos_mes * 100) / 100,
            cobro_cuotas_mes: Math.round(cobro_cuotas_mes * 100) / 100,
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
            clientes_castigados: clientes_castigados || 0,
            total_vencidos: totalVencidos,
            total_critica: totalAlertaCritica,
            total_advertencia: totalAdvertencia
        },
        operatividad: {
            renovaciones_mes: {
                cantidad: renovaciones_cantidad || 0,
                volumen: Math.round(renovaciones_volumen * 100) / 100
            },
            total_clientes_activos,
            total_renovables
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
