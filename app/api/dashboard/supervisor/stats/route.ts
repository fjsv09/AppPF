import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

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

    const today = new Date().toISOString().split('T')[0]
    
    // 2. Obtener asesores a cargo
    let asesoresQuery = supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, foto_url')
        .eq('rol', 'asesor')

    if (perfil.rol === 'supervisor') {
        asesoresQuery = asesoresQuery.eq('supervisor_id', user.id)
    }

    const { data: asesores } = await asesoresQuery
    const asesorIds = asesores?.map(a => a.id) || []

    if (asesorIds.length === 0) {
        return NextResponse.json({ 
            teamSummary: { totalAsesores: 0, totalClientes: 0, totalCapitalActivo: 0, moraGlobal: 0, eficienciaHoy: 0 },
            asesores: [],
            pendientes: { solicitudes: [], renovaciones: [] }
        })
    }

    // 3. Obtener préstamos activos de estos asesores
    // Primero necesitamos los clientes de estos asesores
    const { data: clientes } = await supabaseAdmin
        .from('clientes')
        .select('id, asesor_id')
        .in('asesor_id', asesorIds)
    
    const clienteIds = clientes?.map(c => c.id) || []
    const clientToAsesorMap = new Map(clientes?.map(c => [c.id, c.asesor_id]))

    const { data: prestamos } = await supabaseAdmin
        .from('prestamos')
        .select(`
            id, monto, cliente_id, interes,
            cronograma_cuotas (
                monto_cuota,
                monto_pagado,
                estado,
                fecha_vencimiento
            )
        `)
        .in('cliente_id', clienteIds)
        .eq('estado', 'activo')

    // 4. Calcular métricas por asesor y globales
    const statsByAsesor = new Map<string, any>()
    asesores?.forEach(a => {
        statsByAsesor.set(a.id, {
            id: a.id,
            nombre: a.nombre_completo,
            foto: a.foto_url,
            capitalActivo: 0,
            moraMonto: 0,
            cuotasHoyTotal: 0,
            cuotasHoyPagado: 0,
            clientesActivos: new Set()
        })
    })

    let totalCapitalGlobal = 0
    let totalMoraGlobal = 0
    let totalCuotasHoyMonto = 0
    let totalCuotasHoyPagado = 0

    prestamos?.forEach(p => {
        const asesorId = clientToAsesorMap.get(p.cliente_id)
        if (!asesorId || !statsByAsesor.has(asesorId)) return

        const asesorData = statsByAsesor.get(asesorId)
        asesorData.clientesActivos.add(p.cliente_id)

        const montoCapital = parseFloat(p.monto) || 0
        const cuotas = p.cronograma_cuotas || []
        const totalCuotasCount = cuotas.length
        const capitalPorCuota = totalCuotasCount > 0 ? montoCapital / totalCuotasCount : 0

        cuotas.forEach((c: any) => {
            const mCuota = parseFloat(c.monto_cuota) || 0
            const mPagado = parseFloat(c.monto_pagado) || 0
            const pendiente = mCuota - mPagado

            // Capital Activo (lo que falta cobrar de capital)
            if (c.estado !== 'pagado') {
                const proporcionPendiente = mCuota > 0 ? pendiente / mCuota : 1
                const capitalPendienteCuota = capitalPorCuota * proporcionPendiente
                asesorData.capitalActivo += capitalPendienteCuota
                totalCapitalGlobal += capitalPendienteCuota

                // Mora (si ya venció)
                if (c.fecha_vencimiento < today && pendiente > 0.1) {
                    asesorData.moraMonto += capitalPendienteCuota
                    totalMoraGlobal += capitalPendienteCuota
                }
            }

            // Eficiencia Hoy
            if (c.fecha_vencimiento === today) {
                asesorData.cuotasHoyTotal += mCuota
                asesorData.cuotasHoyPagado += mPagado
                totalCuotasHoyMonto += mCuota
                totalCuotasHoyPagado += mPagado
            }
        })
    })

    // 5. Pendientes (Solicitudes y Renovaciones)
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

    // 6. Formatear respuesta
    const asesoresList = Array.from(statsByAsesor.values()).map(a => ({
        ...a,
        clientesActivos: a.clientesActivos.size,
        eficienciaHoy: a.cuotasHoyTotal > 0 ? (a.cuotasHoyPagado / a.cuotasHoyTotal) * 100 : 0
    }))

    return NextResponse.json({
        teamSummary: {
            totalAsesores: asesorIds.length,
            totalClientes: Array.from(new Set(clientes?.map(c => c.id))).length,
            totalCapitalActivo: Math.round(totalCapitalGlobal),
            moraGlobal: totalCapitalGlobal > 0 ? (totalMoraGlobal / totalCapitalGlobal) * 100 : 0,
            eficienciaHoy: totalCuotasHoyMonto > 0 ? (totalCuotasHoyPagado / totalCuotasHoyMonto) * 100 : 0
        },
        asesores: asesoresList,
        pendientes: {
            solicitudes: solicitudes || [],
            renovaciones: renovaciones || []
        }
    })
}
