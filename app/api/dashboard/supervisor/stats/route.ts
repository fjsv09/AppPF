import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getTodayPeru, calculateLoanMetrics } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
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
        const { searchParams } = new URL(request.url)
        const filterAsesorId = searchParams.get('asesorId')
        const filterSupervisorId = searchParams.get('supervisorId')

        // 2. Obtener equipo completo (para el selector) - CORREGIDO: removido foto_url
        let equipoQuery = supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo')
            .eq('rol', 'asesor')

        if (perfil.rol === 'supervisor') {
            equipoQuery = equipoQuery.eq('supervisor_id', user.id)
        } else if (perfil.rol === 'admin' && filterSupervisorId) {
            equipoQuery = equipoQuery.eq('supervisor_id', filterSupervisorId)
        }

        const { data: equipoCompleto, error: equipoError } = await equipoQuery
        if (equipoError) throw new Error('Error al obtener equipo: ' + equipoError.message)

        let targetAsesorIds = equipoCompleto?.map(a => a.id) || []
        if (filterAsesorId) targetAsesorIds = [filterAsesorId]

        let supervisoresDisplay: Array<{ id: string, nombre: string }> = []
        if (perfil.rol === 'admin') {
            const { data: sups } = await supabaseAdmin.from('perfiles').select('id, nombre_completo').eq('rol', 'supervisor')
            supervisoresDisplay = sups?.map((s: any) => ({ id: s.id, nombre: s.nombre_completo })) || []
        }

        const asesorIds = targetAsesorIds
        if (asesorIds.length === 0) {
            return NextResponse.json({ 
                teamSummary: { totalAsesores: 0, totalClientes: 0, totalCapitalActivo: 0, moraGlobal: 0, eficienciaHoy: 0, metaHoyMonto: 0, metaHoyPagado: 0, metaHoyPrestamosTotal: 0, metaHoyPrestamosPagados: 0, renovacionesMes: 0, clientesNuevosMes: 0, clientesBloqueados: 0, refinanciamientosMes: 0, totalRenovables: 0, totalInactivos: 0, totalAlertaCritica: 0, totalAdvertencia: 0, totalVencidos: 0, totalClientesConDeudaActiva: 0 },
                asesores: [], 
                supervisores: supervisoresDisplay,
                pendientes: { solicitudes: [], renovaciones: [] }
            })
        }

        // 3. Obtener préstamos activos
        const allAdvisorsIds = equipoCompleto?.map(a => a.id) || []
        const { data: clientes } = await supabaseAdmin.from('clientes').select('id, asesor_id').in('asesor_id', allAdvisorsIds)
        const clienteIds = clientes?.map(c => c.id) || []
        const clientToAsesorMap = new Map(clientes?.map(c => [c.id, c.asesor_id]))

        const { data: prestamosRaw } = await supabaseAdmin.from('prestamos')
            .select('*')
            .in('cliente_id', clienteIds)
            .eq('estado', 'activo')

        const loanIds = prestamosRaw?.map(p => p.id) || []
        const { data: allCuotasRaw } = await supabaseAdmin.from('cronograma_cuotas')
            .select('*, pagos(*)')
            .in('prestamo_id', loanIds)

        prestamosRaw?.forEach(p => {
            p.cronograma_cuotas = allCuotasRaw?.filter(c => c.prestamo_id === p.id) || []
        })

        // 4. Configuración
        const { data: configSistema } = await supabaseAdmin.from('configuracion_sistema').select('clave, valor')
        const config = {
            renovacionMinPagado: parseInt(configSistema?.find(c => c.clave === 'renovacion_min_pagado')?.valor || '60'),
            umbralCpp: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_cuotas')?.valor || '4'),
            umbralMoroso: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_cuotas')?.valor || '7'),
            umbralCppOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_otros')?.valor || '1'),
            umbralMorosoOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_otros')?.valor || '2')
        }

        // 5. Cálculos
        const statsByAsesor = new Map<string, any>()
        equipoCompleto?.forEach((a: any) => {
            statsByAsesor.set(a.id, { id: a.id, nombre: a.nombre_completo, capitalActivo: 0, originalCapitalTotal: 0, moraMonto: 0, cuotasHoyTotal: 0, cuotasHoyPagado: 0, clientesActivos: new Set() })
        })

        let totalOriginalCapitalGlobal = 0, totalMoraGlobalMonto = 0, totalMetaHoyMonto = 0, totalMetaHoyPagado = 0, totalEfcMetaEquipo = 0, totalEfcPagadoEquipo = 0, totalCapitalEnRiesgoGlobal = 0
        let prestamosHoyTotalContado = new Set<string>(), prestamosHoyPagadosContado = new Set<string>()

        const isToday = (date: string) => {
            if (!date) return false;
            try { return new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === today; } catch (e) { return false; }
        };

        prestamosRaw?.forEach(p => {
            const asesorId = clientToAsesorMap.get(p.cliente_id)
            if (!asesorId || !statsByAsesor.has(asesorId)) return
            const asesorData = statsByAsesor.get(asesorId)
            asesorData.clientesActivos.add(p.cliente_id)

            const metrics = calculateLoanMetrics(p, today, config)
            const isTargeted = targetAsesorIds.includes(asesorId)
            const montoCapitalOriginal = parseFloat(p.monto) || 0
            asesorData.originalCapitalTotal += montoCapitalOriginal
            if (isTargeted) totalOriginalCapitalGlobal += montoCapitalOriginal

            // Mora Capital Original Proporcional
            const capitalVencido = (p.cronograma_cuotas || []).filter((c: any) => c.fecha_vencimiento <= today).reduce((sum: number, c: any) => {
                const numCuotas = (p.cronograma_cuotas || []).length || 1
                const capPorCuota = (parseFloat(p.monto) || 0) / numCuotas
                const mCuota = parseFloat(c.monto_cuota) || 0, mPagado = parseFloat(c.monto_pagado) || 0, pendiente = Math.max(0, mCuota - mPagado), proporcionPendiente = mCuota > 0 ? pendiente / mCuota : 1
                return sum + (capPorCuota * proporcionPendiente)
            }, 0)

            asesorData.moraMonto += capitalVencido
            if (isTargeted) totalMoraGlobalMonto += capitalVencido
            asesorData.capitalActivo += metrics.deudaExigibleTotal 
            if (isTargeted) totalCapitalEnRiesgoGlobal += metrics.deudaExigibleTotal

            if (metrics.cuotaDiaProgramada > 0 && isTargeted) {
                prestamosHoyTotalContado.add(p.id)
                totalMetaHoyMonto += metrics.cuotaDiaProgramada
                totalMetaHoyPagado += metrics.cobradoRutaHoy
                if (metrics.cobradoRutaHoy >= metrics.cuotaDiaProgramada - 0.1) prestamosHoyPagadosContado.add(p.id)
            }

            p.cronograma_cuotas?.forEach((c: any) => {
                if (c.fecha_vencimiento <= today) {
                    const pagosDeEstaCuotaHoy = (c.pagos || []).filter((pay: any) => isToday(pay.created_at)).reduce((s: number, pay: any) => s + (Number(pay.monto_pagado) || 0), 0)
                    const metaCuota = Number(c.monto_cuota), pagadoAntes = Math.max(0, Number(c.monto_pagado || 0) - pagosDeEstaCuotaHoy), pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes)
                    if (pendienteAlInicio > 0.01) {
                        asesorData.cuotasHoyTotal += pendienteAlInicio; asesorData.cuotasHoyPagado += Math.min(pagosDeEstaCuotaHoy, pendienteAlInicio)
                        if (isTargeted) { totalEfcMetaEquipo += pendienteAlInicio; totalEfcPagadoEquipo += Math.min(pagosDeEstaCuotaHoy, pendienteAlInicio) }
                    }
                }
            })
        })

        // Métricas Finales
        let totalRenovables = 0, totalAlertaCritica = 0, totalAdvertencia = 0, totalVencidos = 0;
        const clientesConActivo = new Set();
        prestamosRaw?.forEach(p => {
            const metrics = calculateLoanMetrics(p, today, config);
            if (metrics.esRenovable) totalRenovables++;
            const cronograma = p.cronograma_cuotas || [];
            const sortedCronograma = [...cronograma].sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());
            const fechaUltimaCuota = sortedCronograma.length > 0 ? sortedCronograma[sortedCronograma.length - 1].fecha_vencimiento : null;
            if (fechaUltimaCuota && fechaUltimaCuota < today && metrics.cuotasAtrasadas > 0 && metrics.saldoPendiente > 0.5) totalVencidos++;
            else { if (metrics.isCritico) totalAlertaCritica++; else if (metrics.isMora) totalAdvertencia++; }
            if (p.estado === 'activo') clientesConActivo.add(p.cliente_id);
        });

        // Pendientes
        const { data: solicitudes } = await supabaseAdmin.from('solicitudes').select(`id, monto_solicitado, created_at, cliente:cliente_id(nombres), asesor:asesor_id(nombre_completo)`).in('asesor_id', asesorIds).eq('estado_solicitud', 'pendiente_supervision').limit(5)
        const { data: renovaciones } = await supabaseAdmin.from('renovaciones').select(`id, monto_nuevo, created_at, cliente:cliente_id(nombres), asesor:asesor_id(nombre_completo)`).in('asesor_id', asesorIds).eq('estado', 'pendiente_supervision').limit(5)

        const asesoresList = Array.from(statsByAsesor.values()).map(a => ({
            ...a,
            clientesActivos: a.clientesActivos.size,
            eficienciaHoy: a.cuotasHoyTotal > 0 ? (a.cuotasHoyPagado / a.cuotasHoyTotal) * 100 : 0
        }))

        return NextResponse.json({
            teamSummary: {
                totalAsesores: equipoCompleto?.length || 0,
                totalClientes: clienteIds.length,
                totalCapitalActivo: Math.round(totalCapitalEnRiesgoGlobal),
                moraGlobal: totalOriginalCapitalGlobal > 0 ? (totalMoraGlobalMonto / totalOriginalCapitalGlobal) * 100 : 0,
                moraMontoGlobal: totalMoraGlobalMonto,
                eficienciaHoy: totalEfcMetaEquipo > 0 ? (totalEfcPagadoEquipo / totalEfcMetaEquipo) * 100 : 0,
                eficienciaMonto: totalEfcMetaEquipo,
                eficienciaPagado: totalEfcPagadoEquipo,
                metaHoyMonto: totalMetaHoyMonto,
                metaHoyPagado: totalMetaHoyPagado,
                metaHoyPrestamosTotal: prestamosHoyTotalContado.size,
                metaHoyPrestamosPagados: prestamosHoyPagadosContado.size,
                totalRenovables,
                totalInactivos: clienteIds.filter(cid => !clientesConActivo.has(cid)).length,
                totalAlertaCritica,
                totalAdvertencia,
                totalVencidos,
                totalClientesConDeudaActiva: clientesConActivo.size
            },
            asesores: asesoresList,
            supervisores: supervisoresDisplay,
            pendientes: {
                solicitudes: solicitudes || [],
                renovaciones: renovaciones || []
            }
        })
    } catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Error interno', details: error.message }, { status: 500 })
    }
}
