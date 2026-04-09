import { esDiaHabil } from '@/lib/financial-logic'

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
    const feriadosSet = new Set<string>((fers || []).map((f: any) => f.fecha))

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
                    .select('cuota_id, monto_pagado, fecha_pago')
                    .in('cuota_id', cuotaIds)

                const startOfDay = new Date(`${hoyPeruStr}T00:00:00-05:00`).getTime()
                const endOfDay = new Date(`${hoyPeruStr}T23:59:59-05:00`).getTime()
                const pagosPorCuota: Record<string, { hoy: number, antes: number }> = {}
                cuotasHoy.forEach((c: any) => pagosPorCuota[c.id] = { hoy: 0, antes: 0 })

                todosLosPagos?.forEach((p: any) => {
                    if (!pagosPorCuota[p.cuota_id]) return
                    const timePago = new Date(p.fecha_pago).getTime()
                    if (timePago >= startOfDay && timePago <= endOfDay) {
                        pagosPorCuota[p.cuota_id].hoy += Number(p.monto_pagado)
                    } else if (timePago < startOfDay) {
                        pagosPorCuota[p.cuota_id].antes += Number(p.monto_pagado)
                    }
                })

                let metaEfectivaHoy = 0
                cuotasHoy.forEach((c: any) => {
                    const metaCuota = Number(c.monto_cuota)
                    const pagos = pagosPorCuota[c.id]
                    const totalPagadoAcumulado = Number(c.monto_pagado || 0)
                    const pagadoAntes = Math.max(0, totalPagadoAcumulado - pagos.hoy)
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

    // Cartera de clientes y morosidad
    let clientesActivosNoBloqueados = 0
    let totalFinalClients = 0

    if (clientesAsesor && clientesAsesor.length > 0) {
        const clienteIds = clientesAsesor.map((c: any) => c.id)
        const { data: prestamosActivos } = await supabaseAdmin
            .from('prestamos')
            .select('cliente_id')
            .in('cliente_id', clienteIds)
            .eq('estado', 'activo')

        const idsConPrestamoActivo = new Set(prestamosActivos?.map((p: any) => p.cliente_id) || [])
        const { data: detallesClientes } = await supabaseAdmin
            .from('clientes')
            .select('id, bloqueado_renovacion')
            .in('id', Array.from(idsConPrestamoActivo))

        totalFinalClients = idsConPrestamoActivo.size
        clientesActivosNoBloqueados = detallesClientes?.filter((c: any) => !c.bloqueado_renovacion).length || 0
    }

    const { data: allRecentLoans } = await supabaseAdmin
        .from('prestamos')
        .select(`
            id, cliente_id, monto, interes, created_at, estado, created_by,
            clientes!inner (asesor_id),
            cronograma_cuotas (id, fecha_vencimiento, monto_cuota, monto_pagado, estado)
        `)
        .eq('clientes.asesor_id', userId)
        .in('estado', ['activo', 'desembolsado', 'vigente', 'aprobado', 'finalizado'])

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

    const startOfPeriod = getPeriodStartDate('mensual')
    const { data: pagosPeriodo } = await supabaseAdmin
        .from('pagos')
        .select('monto_pagado, created_at')
        .eq('registrado_por', userId)
        .gte('created_at', startOfPeriod.toISOString())

    const totalRecaudadoReal = pagosPeriodo?.reduce((acc: number, p: any) => acc + Number(p.monto_pagado || 0), 0) || 0

    const prestamosNuevos = (allRecentLoans?.filter((p: any) => {
        const fecha = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
        return fecha.startsWith(mesActualStr)
    }) || [])

    let netosComisionablesCount = 0
    let capitalNetoComisionable = 0
    let promedioColocacion = 0

    let huecoCalculado = 0
    const metaReten = metasData?.find((m: any) => m.meta_retencion_clientes > 0)
    if (metaReten) {
        huecoCalculado = Math.max(0, metaReten.meta_retencion_clientes - clientesActivosNoBloqueados)
    }

    if (prestamosNuevos.length > 0) {
        const clientesUnicosNuevos = new Set()
        const prestamosNuevosFiltrados = prestamosNuevos.filter((p: any) => {
            if (clientesUnicosNuevos.has(p.cliente_id)) return false
            clientesUnicosNuevos.add(p.cliente_id)
            return true
        })

        let gapToCover = huecoCalculado
        prestamosNuevosFiltrados.forEach((p: any) => {
            if (gapToCover > 0) {
                gapToCover--
            } else {
                capitalNetoComisionable += Number(p.monto || 0)
                netosComisionablesCount++
            }
        })

        const montoTotalBruto = prestamosNuevos.reduce((acc: number, p: any) => acc + Number(p.monto || 0), 0)
        promedioColocacion = prestamosNuevos.length > 0 ? montoTotalBruto / prestamosNuevos.length : 0
    }

    // Calculo Morosidad Bancaria
    let totalCapitalOriginal = 0
    let totalCapitalVencido = 0
    
    allRecentLoans?.filter((p: any) => p.estado === 'activo').forEach((p: any) => {
        const montoCapital = parseFloat(p.monto) || 0
        totalCapitalOriginal += montoCapital
        
        const cuotas = p.cronograma_cuotas || []
        const numCuotas = cuotas.length || 1
        const capitalPorCuota = montoCapital / numCuotas
        
        cuotas.filter((c: any) => c.fecha_vencimiento <= hoyPeruStr && c.estado !== 'pagado').forEach((c: any) => {
            const montoCuota = parseFloat(c.monto_cuota) || 0
            const montoPagado = parseFloat(c.monto_pagado) || 0
            const pendiente = Math.max(0, montoCuota - montoPagado)
            
            if (pendiente > 0.01) {
                const proporcionPendiente = montoCuota > 0 ? pendiente / montoCuota : 1
                totalCapitalVencido += capitalPorCuota * proporcionPendiente
            }
        })
    })

    const morosidadCalculada = totalCapitalOriginal > 0 ? (totalCapitalVencido / totalCapitalOriginal) * 100 : 0
    const statsResult = {
        porcentaje_cobro: Math.round(porcentajeCalculado),
        morosidad_actual: morosidadCalculada,
        clientes_en_cartera: clientesActivosNoBloqueados,
        clientes_colocados_mes: netosComisionablesCount,
        nuevos_clientes: netosComisionablesCount,
        promedio_colocacion: Math.round(promedioColocacion),
        capital_colocado: prestamosNuevos.reduce((acc: number, p: any) => acc + Number(p.monto || 0), 0),
        recaudacion_total: totalRecaudadoReal,
        clientes_finales_bloqueados: totalFinalClients - clientesActivosNoBloqueados,
        hueco_calculado: huecoCalculado
    }

    // 5. EVALUACIÓN Y GATILLO DE BONOS
    const findPreviousWorkingDay = (d: Date) => {
        let temp = new Date(d)
        while (temp.getDay() === 0 || feriadosSet.has(temp.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))) {
            temp.setDate(temp.getDate() - 1)
        }
        return temp
    }

    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const workingLastDay = findPreviousWorkingDay(lastDayOfMonth)
    const isLastWorkingDay = today.getDate() === workingLastDay.getDate()

    const midMonth = new Date(today.getFullYear(), today.getMonth(), 15)
    const workingMidMonth = findPreviousWorkingDay(midMonth)
    const isQuincenaDay = (today.getDate() === workingMidMonth.getDate()) || isLastWorkingDay
    
    const isSaturday = today.getDay() === 6
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
            if (meta.periodo === 'semanal' && !isSaturday) continue;
            
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
            if (statsResult.nuevos_clientes >= meta.meta_cantidad_clientes && statsResult.nuevos_clientes > 0) {
                cumplida = true
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
        else if (meta.meta_colocacion_clientes) {
            const montoMin = meta.monto_minimo_prestamo || 500
            if (statsResult.promedio_colocacion >= montoMin && statsResult.clientes_colocados_mes > 0) {
                cumplida = true
                montoBonoFinal = (meta.bono_por_cliente || 0) * statsResult.clientes_colocados_mes
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
