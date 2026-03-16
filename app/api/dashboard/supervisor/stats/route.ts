import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getTodayPeru, calculateLoanMetrics } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // 1. Verificar usuario y rol
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol, id')
        .eq('id', user.id)
        .single()

    if (perfil?.rol !== 'supervisor' && perfil?.rol !== 'admin') {
        return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 })
    }

    const today = getTodayPeru()
    
    // 2. Obtener asesores a cargo
    let asesoresQuery = supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo')
        .eq('rol', 'asesor')

    if (perfil.rol === 'supervisor') {
        asesoresQuery = asesoresQuery.eq('supervisor_id', user.id)
    }

    const { data: asesores, error: asesoresError } = await asesoresQuery
    if (asesoresError) {
        console.error('Error fetching asesores:', asesoresError)
        return NextResponse.json({ error: 'Error al obtener equipo' }, { status: 500 })
    }

    const asesorIds = asesores?.map(a => a.id) || []

    if (asesorIds.length === 0) {
        return NextResponse.json({ 
            teamSummary: { totalAsesores: 0, totalClientes: 0, totalCapitalActivo: 0, moraGlobal: 0, eficienciaHoy: 0, metaHoyMonto: 0, metaHoyPagado: 0, metaHoyPrestamosTotal: 0, metaHoyPrestamosPagados: 0 },
            asesores: [],
            pendientes: { solicitudes: [], renovaciones: [] }
        })
    }

    // 3. Obtener préstamos activos de estos asesores
    const { data: clientes } = await supabaseAdmin
        .from('clientes')
        .select('id, asesor_id')
        .in('asesor_id', asesorIds)
    
    const clienteIds = clientes?.map(c => c.id) || []
    const clientToAsesorMap = new Map(clientes?.map(c => [c.id, c.asesor_id]))

    const { data: prestamosRaw } = await supabaseAdmin
        .from('prestamos')
        .select(`
            *,
            cronograma_cuotas (
                *,
                pagos (*)
            )
        `)
        .in('cliente_id', clienteIds)
        .eq('estado', 'activo')

    // 4. Obtener Configuración Sistema
    const { data: configSistema } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')

    const config = {
        renovacionMinPagado: parseInt(configSistema?.find(c => c.clave === 'renovacion_min_pagado')?.valor || '60'),
        umbralCpp: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_cuotas')?.valor || '4'),
        umbralMoroso: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_cuotas')?.valor || '7'),
        umbralCppOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_otros')?.valor || '1'),
        umbralMorosoOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_otros')?.valor || '2')
    }

    // 5. Calcular métricas por asesor y globales
    const statsByAsesor = new Map<string, any>()
    asesores?.forEach(a => {
        statsByAsesor.set(a.id, {
            id: a.id,
            nombre: a.nombre_completo,
            foto: null,
            capitalActivo: 0,
            originalCapitalTotal: 0,
            moraMonto: 0,
            cuotasHoyTotal: 0,
            cuotasHoyPagado: 0,
            clientesActivos: new Set()
        })
    })

    let totalOriginalCapitalGlobal = 0
    let totalMoraGlobalMonto = 0
    
    // Global KPIs (ONLY Today's installments - the "Today's Route")
    let totalMetaHoyMonto = 0
    let totalMetaHoyPagado = 0
    
    // Efficiency KPIs (Today + Arrears - for Advisor Performance)
    let totalEfcMetaEquipo = 0
    let totalEfcPagadoEquipo = 0
    let totalCapitalEnRiesgoGlobal = 0
    
    let prestamosHoyTotalContado = new Set<string>()
    let prestamosHoyPagadosContado = new Set<string>()

    // Helper for today verification
    const isToday = (date: string) => {
        if (!date) return false;
        try {
            return new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === today;
        } catch (e) { return false; }
    };

    prestamosRaw?.forEach(p => {
        const asesorId = clientToAsesorMap.get(p.cliente_id)
        if (!asesorId || !statsByAsesor.has(asesorId)) return

        const asesorData = statsByAsesor.get(asesorId)
        asesorData.clientesActivos.add(p.cliente_id)

        // Usar Lógica Centralizada
        const metrics = calculateLoanMetrics(p, today, config)

        const montoCapitalOriginal = parseFloat(p.monto) || 0
        asesorData.originalCapitalTotal += montoCapitalOriginal
        totalOriginalCapitalGlobal += montoCapitalOriginal

        // Mora Bancaria (Capital de cuotas vencidas <= HOY)
        const capitalVencido = (p.cronograma_cuotas || [])
            .filter((c: any) => c.fecha_vencimiento <= today)
            .reduce((sum: number, c: any) => {
                const montoCapitalOriginalFull = parseFloat(p.monto) || 0
                const numCuotas = (p.cronograma_cuotas || []).length || 1
                const capPorCuota = montoCapitalOriginalFull / numCuotas
                const mCuota = parseFloat(c.monto_cuota) || 0
                const mPagado = parseFloat(c.monto_pagado) || 0
                const pendiente = Math.max(0, mCuota - mPagado)
                const proporcionPendiente = mCuota > 0 ? pendiente / mCuota : 1
                return sum + (capPorCuota * proporcionPendiente)
            }, 0)

        asesorData.moraMonto += capitalVencido
        totalMoraGlobalMonto += capitalVencido

        asesorData.capitalActivo += metrics.deudaExigibleTotal 
        totalCapitalEnRiesgoGlobal += metrics.deudaExigibleTotal

        // 1. KPI GLOBAL (Meta Hoy - Solo lo que toca hoy)
        if (metrics.cuotaDiaProgramada > 0) {
            prestamosHoyTotalContado.add(p.id)
            totalMetaHoyMonto += metrics.cuotaDiaProgramada
            totalMetaHoyPagado += metrics.cobradoRutaHoy
            
            if (metrics.cobradoRutaHoy >= metrics.cuotaDiaProgramada - 0.1) {
                prestamosHoyPagadosContado.add(p.id)
            }
        }

        // 2. EFICIENCIA ASESOR (Cálculo Diferente: Hoy + Atrasadas)
        const cronograma = p.cronograma_cuotas || []
        cronograma.forEach((c: any) => {
            if (c.fecha_vencimiento <= today) {
                const pagosDeEstaCuotaHoy = (c.pagos || [])
                    .filter((pay: any) => isToday(pay.created_at))
                    .reduce((s: number, pay: any) => s + (Number(pay.monto_pagado) || 0), 0)
                
                const metaCuota = Number(c.monto_cuota)
                const totalPagadoAcumulado = Number(c.monto_pagado || 0)
                const pagadoAntes = Math.max(0, totalPagadoAcumulado - pagosDeEstaCuotaHoy)
                const pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes)
                
                if (pendienteAlInicio > 0.01) {
                    asesorData.cuotasHoyTotal += pendienteAlInicio
                    asesorData.cuotasHoyPagado += Math.min(pagosDeEstaCuotaHoy, pendienteAlInicio)
                    
                    totalEfcMetaEquipo += pendienteAlInicio
                    totalEfcPagadoEquipo += Math.min(pagosDeEstaCuotaHoy, pendienteAlInicio)
                }
            }
        })
    })

    // 6. Pendientes (Solicitudes y Renovaciones)
    const { data: solicitudes } = await supabaseAdmin
        .from('solicitudes')
        .select(`
            id, monto_solicitado, created_at,
            cliente:cliente_id(nombres),
            asesor:asesor_id(nombre_completo)
        `)
        .in('asesor_id', asesorIds)
        .eq('estado_solicitud', 'pendiente_supervision')
        .limit(5)

    const { data: renovaciones } = await supabaseAdmin
        .from('renovaciones')
        .select(`
            id, monto_nuevo, created_at,
            cliente:cliente_id(nombres),
            asesor:asesor_id(nombre_completo)
        `)
        .in('asesor_id', asesorIds)
        .eq('estado', 'pendiente_supervision')
        .limit(5)

    // 7. Formatear respuesta
    const asesoresList = Array.from(statsByAsesor.values()).map(a => ({
        ...a,
        clientesActivos: a.clientesActivos.size,
        eficienciaHoy: a.cuotasHoyTotal > 0 ? (a.cuotasHoyPagado / a.cuotasHoyTotal) * 100 : 0
    }))

    return NextResponse.json({
        teamSummary: {
            totalAsesores: asesorIds.length,
            totalClientes: Array.from(new Set(clientes?.map(c => c.id))).length,
            totalCapitalActivo: Math.round(totalCapitalEnRiesgoGlobal),
            moraGlobal: totalOriginalCapitalGlobal > 0 ? (totalMoraGlobalMonto / totalOriginalCapitalGlobal) * 100 : 0,
            eficienciaHoy: totalEfcMetaEquipo > 0 ? (totalEfcPagadoEquipo / totalEfcMetaEquipo) * 100 : 0,
            eficienciaMonto: totalEfcMetaEquipo,
            eficienciaPagado: totalEfcPagadoEquipo,
            metaHoyMonto: totalMetaHoyMonto,
            metaHoyPagado: totalMetaHoyPagado,
            metaHoyPrestamosTotal: prestamosHoyTotalContado.size,
            metaHoyPrestamosPagados: prestamosHoyPagadosContado.size
        },
        asesores: asesoresList,
        pendientes: {
            solicitudes: solicitudes || [],
            renovaciones: renovaciones || []
        }
    })
}
