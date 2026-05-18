import { esDiaHabil, isClientStrictActive, calculateMoraBancaria } from '@/lib/financial-logic'

export async function calculateMetasForUser(supabaseAdmin: any, userId: string, forceEvaluation = false) {
    const hoyPeruStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const today = new Date(hoyPeruStr + 'T12:00:00')
    const mesActualStr = hoyPeruStr.slice(0, 7)

    // 1. Obtener metas activas
    const { data: metasData } = await supabaseAdmin
        .from('metas_asesores')
        .select('*')
        .eq('asesor_id', userId)
        .eq('activo', true)

    if (!metasData || metasData.length === 0) {
        return { stats: null, bonusesToPay: [] }
    }

    // 2. Obtener Historial de Bonos Pagados para controlar no pagar doble
    const { data: todosBonosMes } = await supabaseAdmin
        .from('bonos_pagados')
        .select('*')
        .eq('asesor_id', userId)
        .gte('fecha', `${mesActualStr}-01`)

    const pagadosHoy = todosBonosMes?.filter((p: any) => p.fecha === hoyPeruStr && p.estado === 'aprobado').map((p: any) => p.meta_id) || []
    
    const day = today.getDay()
    const diffLunes = today.getDate() - day + (day === 0 ? -6 : 1)
    const lunesActual = new Date(today.getTime())
    lunesActual.setDate(diffLunes)
    const lunesActualStr = lunesActual.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    
    const pagadosSemana = todosBonosMes?.filter((p: any) => p.fecha >= lunesActualStr && p.estado === 'aprobado').map((p: any) => p.meta_id) || []
    const pagadosQuincena = todosBonosMes?.filter((p: any) => {
        if (p.estado !== 'aprobado') return false;
        const isSecondHalf = parseInt(hoyPeruStr.split('-')[2]) > 15;
        const bDate = parseInt(p.fecha.split('-')[2]);
        return (isSecondHalf && bDate > 15) || (!isSecondHalf && bDate <= 15);
    }).map((p: any) => p.meta_id) || []
    const pagadosMes = todosBonosMes?.filter((p: any) => p.estado === 'aprobado').map((p: any) => p.meta_id) || []
    
    const pendientesORechazados = todosBonosMes?.filter((p: any) => {
        if (!['pendiente', 'rechazado'].includes(p.estado)) return false;
        const meta = metasData?.find((m: any) => m.id === p.meta_id);
        if (!meta) return false;
        
        if (meta.periodo === 'diario') return p.fecha === hoyPeruStr;
        if (meta.periodo === 'semanal') return p.fecha >= lunesActualStr;
        if (meta.periodo === 'quincenal') {
            const isSecondHalf = parseInt(hoyPeruStr.split('-')[2]) > 15;
            const bDate = parseInt(p.fecha.split('-')[2]);
            return (isSecondHalf && bDate > 15) || (!isSecondHalf && bDate <= 15);
        }
        return true;
    }) || []

    const pPendientesId = pendientesORechazados.map((p: any) => p.meta_id)

    // 3. Feriados
    const { data: fers } = await supabaseAdmin.from('feriados').select('fecha')
    const feriadosSet = new Set<string>((fers || []).map((f: any) => {
        if (typeof f.fecha === 'string') return f.fecha.split('T')[0]
        if (f.fecha instanceof Date) return f.fecha.toISOString().split('T')[0]
        return String(f.fecha)
    }))

    // 4. Cálculos Financieros
    const asesorIds = [userId] // Limitado al asesor actual que cierra

    const { data: clientesAsesor } = await supabaseAdmin
        .from('clientes')
        .select('id, bloqueado_renovacion, created_at')
        .in('asesor_id', asesorIds)

    let porcentajeCalculado = 0
    let totalRecaudadoHoyEfectivo = 0

    if (clientesAsesor && clientesAsesor.length > 0) {
        const clienteIds = clientesAsesor.map((c: any) => c.id)
        const { data: prestamos } = await supabaseAdmin
            .from('prestamos')
            .select('id')
            .in('cliente_id', clienteIds)
            .eq('estado', 'activo')

        if (prestamos && prestamos.length > 0) {
            const prestamoIds = prestamos.map((p: any) => p.id)
            const { data: cuotasHoy } = await supabaseAdmin
                .from('cronograma_cuotas')
                .select('id, monto_cuota, monto_pagado')
                .in('prestamo_id', prestamoIds)
                .eq('fecha_vencimiento', hoyPeruStr)

            if (cuotasHoy && cuotasHoy.length > 0) {
                const cuotaIds = cuotasHoy.map((c: any) => c.id)
                const totalProgramado = cuotasHoy.reduce((acc: number, c: any) => acc + Number(c.monto_cuota), 0)
                const { data: todosLosPagos } = await supabaseAdmin
                    .from('pagos')
                    .select('cuota_id, monto_pagado, fecha_pago, estado_verificacion')
                    .in('cuota_id', cuotaIds)
                    .neq('estado_verificacion', 'rechazado')

                const startOfDay = new Date(`${hoyPeruStr}T00:00:00-05:00`).getTime()
                const endOfDay = new Date(`${hoyPeruStr}T23:59:59-05:00`).getTime()
                const pagosPorCuota: Record<string, { hoy: number, antes: number, acumulado: number }> = {}
                cuotasHoy.forEach((c: any) => pagosPorCuota[c.id] = { hoy: 0, antes: 0, acumulado: 0 })

                todosLosPagos?.forEach((p: any) => {
                    if (!pagosPorCuota[p.cuota_id]) return
                    
                    // Solo sumamos al acumulado lo que no esté rechazado (pendiente se suma al acumulado de la DB pero aquí lo controlamos)
                    // Sin embargo, para consistencia total, calculamos el acumulado real desde transacciones filtradas
                    if (p.estado_verificacion === 'rechazado') return
                    
                    const timePago = new Date(p.fecha_pago).getTime()
                    const monto = Number(p.monto_pagado)
                    
                    // Acumulado (Para saber cuánto se ha pagado en total de forma segura)
                    // Si es pendiente (digital), NO lo sumamos al acumulado del KPI real
                    if (p.estado_verificacion !== 'pendiente') {
                        pagosPorCuota[p.cuota_id].acumulado += monto
                        
                        if (timePago >= startOfDay && timePago <= endOfDay) {
                            pagosPorCuota[p.cuota_id].hoy += monto
                        } else if (timePago < startOfDay) {
                            pagosPorCuota[p.cuota_id].antes += monto
                        }
                    }
                })

                let metaEfectivaHoy = 0
                cuotasHoy.forEach((c: any) => {
                    const metaCuota = Number(c.monto_cuota)
                    const pagos = pagosPorCuota[c.id]
                    
                    // Usamos el acumulado calculado por nosotros para evitar contaminantes de 'pendiente' en la DB
                    const totalPagadoAcumulado = pagos.acumulado
                    const pagadoAntes = pagos.antes
                    
                    const pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes)
                    if (pendienteAlInicio <= 0.01) return
                    
                    metaEfectivaHoy += pendienteAlInicio
                    const recaudoHoyEfectivo = Math.min(pagos.hoy, pendienteAlInicio)
                    totalRecaudadoHoyEfectivo += recaudoHoyEfectivo
                })

                porcentajeCalculado = metaEfectivaHoy > 0
                    ? Math.min(100, (totalRecaudadoHoyEfectivo / metaEfectivaHoy) * 100)
                    : (totalProgramado > 0 ? 100 : 0)
            }
        }
    }

    // IDs de préstamos producto de refinanciamiento (misma lógica que el panel de préstamos)
    const { data: renovacionesRef } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')

    const prestamoIdsProductoRefinanciamiento = (renovacionesRef || [])
        .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
        .map((r: any) => r.prestamo_nuevo_id as string)
        .filter(Boolean)

    const { data: allRecentLoans } = await supabaseAdmin
        .from('prestamos')
        .select(`
            id, cliente_id, monto, interes, created_at, estado, created_by,
            es_paralelo, estado_mora, observacion_supervisor,
            clientes!inner (asesor_id, bloqueado_renovacion),
            cronograma_cuotas (id, fecha_vencimiento, monto_cuota, monto_pagado, estado)
        `)
        .eq('clientes.asesor_id', userId)
        .in('estado', ['activo', 'desembolsado', 'vigente', 'aprobado', 'finalizado'])

    // Solicitudes aprobadas del mes para colocación (fuente de verdad para Nuevos Clientes y Colocación x Cliente)
    const inicioMesPeru = `${mesActualStr}-01T00:00:00-05:00`
    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const finMesPeru = nextMonthDate.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) + 'T00:00:00-05:00'

    const { data: solicitudesAprobadas } = await supabaseAdmin
        .from('solicitudes')
        .select('id, cliente_id, monto_solicitado, fecha_aprobacion, origen')
        .eq('asesor_id', userId)
        .eq('estado_solicitud', 'aprobado')
        .gte('fecha_aprobacion', inicioMesPeru)
        .lt('fecha_aprobacion', finMesPeru)

    const solicitudesFiltradas = (solicitudesAprobadas || []).filter((s: any) =>
        s.origen !== 'migracion' && s.origen !== 'edicion_cliente'
    )

    // Cartera de clientes — usando isClientStrictActive (fuente de verdad del panel de préstamos)
    // Enriquecemos cada préstamo con el saldo calculado desde cronograma_cuotas
    // para que isClientStrictActive pueda aplicar el filtro de saldo pendiente > 0.01
    const loansWithSaldo = allRecentLoans?.map((p: any) => ({
        ...p,
        metrics: {
            saldoPendiente: Math.max(0,
                Number(p.monto) * (1 + Number(p.interes) / 100) -
                (p.cronograma_cuotas || []).reduce((acc: number, c: any) => acc + Number(c.monto_pagado || 0), 0)
            )
        }
    }))

    let clientesActivosNoBloqueados = 0
    let totalFinalClients = 0

    const clientesMapReten = new Map<string, any[]>()
    loansWithSaldo?.forEach((p: any) => {
        const cId = p.cliente_id
        if (!cId) return
        if (!clientesMapReten.has(cId)) clientesMapReten.set(cId, [])
        clientesMapReten.get(cId)!.push(p)
    })
    clientesMapReten.forEach((loans) => {
        if (loans.some((p: any) => p.estado === 'activo')) totalFinalClients++
        if (isClientStrictActive(loans[0]?.clientes, loans, prestamoIdsProductoRefinanciamiento)) {
            clientesActivosNoBloqueados++
        }
    })

    const getPeriodStartDate = (period: 'semanal' | 'mensual') => {
        const now = new Date(today)
        const start = new Date(now)
        if (period === 'semanal') {
            const day = now.getDay()
            const diff = now.getDate() - day + (day === 0 ? -6 : 1)
            start.setDate(diff)
        } else {
            start.setDate(1)
        }
        start.setHours(0,0,0,0)
        return start
    }

    // Todos los pagos aprobados del mes de los préstamos del asesor,
    // independientemente de quién registró el pago (asesor, supervisor o admin).
    // Usamos join nested igual que el panel de Transacciones, sin filtrar por estado del préstamo.
    const startOfPeriod = getPeriodStartDate('mensual')
    const { data: pagosPeriodoRaw } = await supabaseAdmin
        .from('pagos')
        .select('monto_pagado, created_at, cronograma_cuotas!inner(prestamos!inner(clientes!inner(asesor_id)))')
        .eq('cronograma_cuotas.prestamos.clientes.asesor_id', userId)
        .gte('created_at', startOfPeriod.toISOString())
        .eq('estado_verificacion', 'aprobado')

    const pagosPeriodo = pagosPeriodoRaw || []

    const totalRecaudadoReal = pagosPeriodo.reduce((acc: number, p: any) => acc + Number(p.monto_pagado || 0), 0)

    const getRecaudacionForPeriod = (periodo: string): number => {
        const isSecondHalf = parseInt(hoyPeruStr.split('-')[2]) > 15
        return pagosPeriodo
            .filter((p: any) => {
                const fechaPago = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
                if (periodo === 'diario') return fechaPago === hoyPeruStr
                if (periodo === 'semanal') return fechaPago >= lunesActualStr
                if (periodo === 'quincenal') {
                    const bDate = parseInt(fechaPago.split('-')[2])
                    return (isSecondHalf && bDate > 15) || (!isSecondHalf && bDate <= 15)
                }
                return true // mensual: todos los del mes
            })
            .reduce((acc: number, p: any) => acc + Number(p.monto_pagado || 0), 0)
    }

    let netosComisionablesCount = 0
    let capitalNetoComisionable = 0
    let promedioColocacion = 0

    let huecoCalculado = 0
    const metaReten = metasData?.find((m: any) => m.meta_retencion_clientes > 0)
    if (metaReten) {
        huecoCalculado = Math.max(0, metaReten.meta_retencion_clientes - clientesActivosNoBloqueados)
    }

    if (solicitudesFiltradas.length > 0) {
        const clientesUnicosNuevos = new Set()
        const solicitudesUnicas = solicitudesFiltradas.filter((s: any) => {
            if (clientesUnicosNuevos.has(s.cliente_id)) return false
            clientesUnicosNuevos.add(s.cliente_id)
            return true
        })

        let gapToCover = huecoCalculado
        solicitudesUnicas.forEach((s: any) => {
            if (gapToCover > 0) {
                gapToCover--
            } else {
                capitalNetoComisionable += Number(s.monto_solicitado || 0)
                netosComisionablesCount++
            }
        })

        const montoTotalBruto = solicitudesFiltradas.reduce((acc: number, s: any) => acc + Number(s.monto_solicitado || 0), 0)
        promedioColocacion = solicitudesFiltradas.length > 0 ? montoTotalBruto / solicitudesFiltradas.length : 0
    }

    // Calculo Morosidad Bancaria (misma fuente que Panel de Préstamos)
    const { tasaMorosidadCapital, capitalVencido, capitalOriginal } = calculateMoraBancaria(allRecentLoans || [], hoyPeruStr)
    const morosidadCalculada = tasaMorosidadCapital
    const totalCapitalVencido = capitalVencido
    const totalCapitalOriginal = capitalOriginal
    const metaColoc = metasData?.find((m: any) => m.meta_colocacion_clientes)
    const statsResult = {
        porcentaje_cobro: Math.round(porcentajeCalculado),
        morosidad_actual: morosidadCalculada,
        capital_vencido: totalCapitalVencido,
        capital_original: totalCapitalOriginal,
        clientes_en_cartera: clientesActivosNoBloqueados,
        clientes_colocados_mes: netosComisionablesCount,
        nuevos_clientes: netosComisionablesCount,
        promedio_colocacion: Math.round(promedioColocacion),
        capital_colocado: solicitudesFiltradas.reduce((acc: number, s: any) => acc + Number(s.monto_solicitado || 0), 0),
        capital_neto_comisionable: capitalNetoComisionable,
        recaudacion_total: totalRecaudadoReal,
        clientes_finales_bloqueados: totalFinalClients - clientesActivosNoBloqueados,
        hueco_calculado: huecoCalculado,
        monto_minimo_colocacion: metaColoc?.monto_minimo_prestamo || 500
    }

    // 5. EVALUACIÓN Y GATILLO DE BONOS
    const findPreviousWorkingDay = (d: Date) => {
        let temp = new Date(d)
        while (temp.getDay() === 0 || feriadosSet.has(temp.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))) {
            temp.setDate(temp.getDate() - 1)
        }
        return temp
    }

    // A. Cierre Mensual (Último día hábil del mes)
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const workingLastDay = findPreviousWorkingDay(lastDayOfMonth)
    const isLastWorkingDay = today.getDate() === workingLastDay.getDate()

    // B. Cierre Quincenal (Día 15 o Fin de mes, ajustado a hábil previo)
    const midMonth = new Date(today.getFullYear(), today.getMonth(), 15)
    const workingMidMonth = findPreviousWorkingDay(midMonth)
    const isQuincenaDay = (today.getDate() === workingMidMonth.getDate()) || isLastWorkingDay
    
    // C. Cierre Semanal (Sábado, ajustado a hábil previo -viernes- si es feriado)
    const saturdayThisWeek = new Date(today)
    const diffToSat = (6 - today.getDay())
    saturdayThisWeek.setDate(today.getDate() + diffToSat)
    const workingSaturday = findPreviousWorkingDay(saturdayThisWeek)
    const isWeeklyClosureDay = today.getDate() === workingSaturday.getDate()

    const isWorkingDay = esDiaHabil(hoyPeruStr, feriadosSet)

    interface BonusResult {
        meta_id: string;
        monto: number;
        motivo: string;
        fecha: string;
        nombre_meta: string;
    }
    const bonusesToPay: BonusResult[] = []

    // Si NO es un día hábil laboral y no estamos forzando, no calculamos bonos
    if (!isWorkingDay && !forceEvaluation) {
        return { stats: statsResult, bonusesToPay }
    }

    for (const meta of metasData) {
        // Validación de periodo de cierre
        if (!forceEvaluation) {
            if (meta.periodo === 'mensual' && !isLastWorkingDay) continue;
            if (meta.periodo === 'quincenal' && !isQuincenaDay) continue;
            if (meta.periodo === 'semanal' && !isWeeklyClosureDay) continue;
            
            if (meta.periodo === 'diario' && pagadosHoy.includes(meta.id)) continue;
            if (meta.periodo === 'semanal' && pagadosSemana.includes(meta.id)) continue;
            if (meta.periodo === 'quincenal' && pagadosQuincena.includes(meta.id)) continue;
            if (meta.periodo === 'mensual' && pagadosMes.includes(meta.id)) continue;
        }

        // Si ya hay algo en evaluación o rechazado, mejor saltear para no duplicar
        if (pPendientesId.includes(meta.id)) continue;

        let cumplida = false
        let montoBonoFinal = meta.bono_monto || 0
        let nombreMotivo = 'KPI'

        if (meta.meta_cobro !== null && meta.meta_cobro !== undefined) {
            if (statsResult.porcentaje_cobro >= meta.meta_cobro && statsResult.porcentaje_cobro > 0) {
                cumplida = true
                nombreMotivo = 'Cobranza'
            }
        } 
        else if (meta.meta_cantidad_clientes !== null && meta.meta_cantidad_clientes !== undefined) {
            if (statsResult.nuevos_clientes > 0 && meta.meta_cantidad_clientes > 0) {
                cumplida = true
                montoBonoFinal = Math.round((meta.bono_monto / meta.meta_cantidad_clientes) * statsResult.nuevos_clientes)
                nombreMotivo = 'Clientes Nuevos'
            }
        }
        else if (meta.meta_morosidad_max !== null && meta.meta_morosidad_max !== undefined) {
            if (statsResult.morosidad_actual <= meta.meta_morosidad_max && statsResult.porcentaje_cobro > 0) {
                cumplida = true
                nombreMotivo = 'Morosidad'
            }
        }
        else if (meta.escalones_mora) {
            const escalones = typeof meta.escalones_mora === 'string' ? JSON.parse(meta.escalones_mora) : meta.escalones_mora
            const sortedEsc = [...escalones].sort((a: any, b: any) => parseFloat(a.mora) - parseFloat(b.mora))
            
            const escalonCumplido = sortedEsc.find((esc: any) => statsResult.morosidad_actual <= parseFloat(esc.mora))
            if (escalonCumplido && statsResult.porcentaje_cobro > 0) {
                cumplida = true
                montoBonoFinal = parseFloat(escalonCumplido.bono)
                nombreMotivo = `Morosidad Escalon`
            }
        }
        else if (meta.meta_retencion_clientes !== null && meta.meta_retencion_clientes !== undefined) {
            if (statsResult.clientes_en_cartera >= meta.meta_retencion_clientes && statsResult.porcentaje_cobro > 0) {
                cumplida = true
                nombreMotivo = 'Retencion'
            }
        } 
        else if (meta.meta_recaudacion_total !== null && meta.meta_recaudacion_total !== undefined && meta.meta_recaudacion_total > 0) {
            const recaudacionPeriodo = getRecaudacionForPeriod(meta.periodo)
            if (recaudacionPeriodo >= meta.meta_recaudacion_total) {
                cumplida = true
                nombreMotivo = 'Recaudación Total'
            }
        }
        else if (meta.meta_colocacion_clientes) {
            const montoMin = meta.monto_minimo_prestamo || 500
            const bloquesCapital = Math.floor(statsResult.capital_neto_comisionable / montoMin)
            const clientesAPagar = Math.min(statsResult.clientes_colocados_mes, bloquesCapital)
            
            if (clientesAPagar > 0) {
                cumplida = true
                montoBonoFinal = (meta.bono_por_cliente || 0) * clientesAPagar
                nombreMotivo = 'Colocacion x Cliente'
            }
        }

        if (cumplida && montoBonoFinal > 0) {
            bonusesToPay.push({
                meta_id: meta.id,
                monto: montoBonoFinal,
                motivo: nombreMotivo,
                fecha: hoyPeruStr,
                nombre_meta: nombreMotivo
            })
        }
    }

    return { stats: statsResult, bonusesToPay }
}
