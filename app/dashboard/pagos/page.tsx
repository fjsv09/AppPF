
import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { DollarSign, TrendingUp } from 'lucide-react'
import { RecentPaymentsList } from '@/components/pagos/recent-payments-list'
import { BackButton } from '@/components/ui/back-button'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'
import { getTodayPeru } from '@/lib/financial-logic'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
    title: 'Transacciones y Cobros'
}

export default async function PagosPage(props: { searchParams: Promise<{ fecha?: string, fecha_inicio?: string, fecha_fin?: string, p_page?: string, q?: string, asesor?: string, supervisor?: string, fecha_cuota?: string, turno?: string, metodo?: string, pago_por?: string, tipo?: string }> }) {
    const searchParams = await props.searchParams;
    const fechaParam = searchParams.fecha;
    const fechaInicioParam = searchParams.fecha_inicio;
    const fechaFinParam = searchParams.fecha_fin;
    const query = searchParams.q;
    const asesorFilter = searchParams.asesor;
    const supervisorFilter = searchParams.supervisor;
    const turnoFilter = searchParams.turno; // Turno 1 / Turno 2
    const metodoFilter = searchParams.metodo;
    const pagoPorFilter = searchParams.pago_por;

    const MAX_RECORDS = 500

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get current user and role
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol, supervisor_id')
        .eq('id', user?.id)
        .single()

    const userRol = (perfil?.rol || 'asesor') as 'admin' | 'supervisor' | 'asesor' | 'secretaria'
    const userId = user?.id || ''

    // [NUEVO] Lógica de Acceso al Sistema
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const access = await checkSystemAccess(supabaseAdmin, userId, userRol, 'pago')

    let blockInfo = null
    if (userRol === 'asesor') {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, userId)
    }

    // [NUEVO] Lógica de Tipo de Transacción (después de definir userRol)
    const tipoFilter = (searchParams.tipo || 'cobros') as 'cobros' | 'renovaciones';
    const isAdmin = userRol === 'admin';
    const activeTipo = isAdmin ? tipoFilter : 'cobros';

    // Fetch all perfiles for filters
    const { data: perfiles } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol, supervisor_id')
        .in('rol', ['admin', 'supervisor', 'asesor', 'secretaria'])
        .order('nombre_completo')

    // Build pagos query with role-based filtering and pagination
    let pagosQuery = supabaseAdmin
        .from('pagos')
        .select(`
            *,
            cronograma_cuotas!inner (
                numero_cuota,
                fecha_vencimiento,
                prestamo_id,
                prestamos!inner (
                    id,
                    clientes!inner (nombres, asesor_id)
                )
            ),
            perfiles:registrado_por ( nombre_completo, rol )
        `, { count: 'exact' })
        .not('registrado_por', 'is', null)
        .neq('estado_verificacion', 'rechazado')
    
    if (activeTipo === 'cobros') {
        pagosQuery = pagosQuery.eq('es_autopago_renovacion', false)
    } else {
        pagosQuery = pagosQuery.eq('es_autopago_renovacion', true)
    }

    const NO_MATCH_UUID = '00000000-0000-0000-0000-000000000000'

    if (userRol === 'asesor') {
        // Asesor: Ve todos los pagos de préstamos de sus clientes (incluyendo los hechos por admin/supervisor)
        pagosQuery = pagosQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', userId)
    } else if (userRol === 'supervisor') {
        // Supervisor: Solo ve pagos de clientes a cargo de asesores de su equipo
        const teamAsesorIds = perfiles?.filter(p => p.supervisor_id === userId).map(p => p.id) || []

        if (asesorFilter && teamAsesorIds.includes(asesorFilter)) {
            pagosQuery = pagosQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', asesorFilter)
        } else {
            pagosQuery = pagosQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', teamAsesorIds.length > 0 ? teamAsesorIds : [NO_MATCH_UUID])
        }
    } else if (userRol === 'admin') {
        if (supervisorFilter) {
            const supervisorTeamIds = perfiles?.filter(p => p.supervisor_id === supervisorFilter).map(p => p.id) || []
            pagosQuery = pagosQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', supervisorTeamIds.length > 0 ? supervisorTeamIds : [NO_MATCH_UUID])
        }
        if (asesorFilter) {
            pagosQuery = pagosQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', asesorFilter)
        }
    }

    // [NUEVO] Filtro por Origen del Pago (Pago Por)
    if (pagoPorFilter && pagoPorFilter !== 'all') {
        if (pagoPorFilter === 'asesor') {
            pagosQuery = pagosQuery.eq('perfiles.rol', 'asesor')
        } else if (pagoPorFilter === 'admin') {
            pagosQuery = pagosQuery.in('perfiles.rol', ['admin', 'supervisor', 'secretaria'])
        } else {
            // Filtro por usuario específico
            pagosQuery = pagosQuery.eq('registrado_por', pagoPorFilter)
        }
    }

    if (query) {
        pagosQuery = pagosQuery.ilike('cronograma_cuotas.prestamos.clientes.nombres', `%${query}%`)
    }

    if (fechaInicioParam && fechaFinParam && userRol === 'admin') {
        pagosQuery = pagosQuery.gte('fecha_pago', `${fechaInicioParam}T00:00:00`)
            .lte('fecha_pago', `${fechaFinParam}T23:59:59`)
    } else if (fechaParam) {
        pagosQuery = pagosQuery.gte('fecha_pago', `${fechaParam}T00:00:00`)
            .lte('fecha_pago', `${fechaParam}T23:59:59`)
    } else {
        // [NUEVO] Por defecto, si no hay filtro, mostrar solo el día de hoy 
        // para evitar que se mezclen días anteriores en la vista inicial
        const todayPeru = getTodayPeru()
        pagosQuery = pagosQuery.gte('fecha_pago', `${todayPeru}T00:00:00`)
            .lte('fecha_pago', `${todayPeru}T23:59:59`)
    }

    // [NUEVO] Restricciones temporales por rol
    if (userRol === 'asesor' || userRol === 'supervisor') {
        const limitDays = userRol === 'asesor' ? 7 : 30
        const limitDate = new Date()
        limitDate.setDate(limitDate.getDate() - limitDays)
        const limitDateStr = limitDate.toISOString().split('T')[0]
        pagosQuery = pagosQuery.gte('fecha_pago', `${limitDateStr}T00:00:00`)
    }


    if (metodoFilter && metodoFilter !== 'all') {
        pagosQuery = pagosQuery.eq('metodo_pago', metodoFilter)
    }

    // -------------------------------------------------------------------------
    // [NUEVO] TURN SEGMENTATION LOGIC
    // -------------------------------------------------------------------------
    // We fetch the first 'parcial_mañana' of today for each relevant advisor
    const todayStr = getTodayPeru()

    const { data: morningCuadres } = await supabaseAdmin
        .from('cuadres_diarios')
        .select('asesor_id, created_at')
        .eq('fecha', todayStr)
        .eq('tipo_cuadre', 'parcial_mañana')
        .in('estado', ['pendiente', 'aprobado'])
        .order('created_at', { ascending: true })

    // Map to find morning cut-off times by advisor
    const cutoffMap: Record<string, string> = {}
    morningCuadres?.forEach(c => {
        if (!cutoffMap[c.asesor_id]) cutoffMap[c.asesor_id] = c.created_at
    })

    // Assign turns to payments
    const calculateTurno = (fechaPago: string, advisorId: string) => {
        const cutoff = cutoffMap[advisorId]
        let turno = 'Turno 1' // Default: START in Turno 1 (AM)

        if (cutoff) {
            // Once a cutoff (Cierre Mañana) exists, payments AFTER it are Turno 2 (PM)
            if (new Date(fechaPago) > new Date(cutoff)) {
                turno = 'Turno 2'
            }
        }

        return turno
    }

    // -------------------------------------------------------------------------
    // TURNO FILTER FIX: When turno filter is active, we must fetch ALL matching
    // records first, apply the turno filter, then paginate manually. Otherwise
    // the turno filter runs AFTER Supabase pagination and can return 0 results.
    // -------------------------------------------------------------------------
    const isTurnoActive = turnoFilter && turnoFilter !== 'all'

    let pagos: any[] | null = null
    let totalPagos: number | null = 0
    let pagosError: any = null

    if (isTurnoActive) {
        // Fetch all records (up to 1000) so we can filter by turno, then paginate
        const { data, error } = await pagosQuery
            .order('fecha_pago', { ascending: false })
            .order('id', { ascending: false })
            .limit(1000)

        pagosError = error
        
        // Apply turno filter to ALL fetched records
        const allWithTurns = data?.map(p => {
            const clienteAsesorId = (p as any).cronograma_cuotas?.prestamos?.clientes?.asesor_id
            const advisorId = clienteAsesorId || p.registrado_por
            const turno = calculateTurno(p.fecha_pago, advisorId)
            return { ...p, turno_calculado: turno }
        }) || []

        const filtered = allWithTurns.filter(p => p.turno_calculado === turnoFilter)
        totalPagos = filtered.length

        // Manual pagination
        pagos = filtered.slice(0, MAX_RECORDS)
    } else {
        // No turno filter: fetch up to MAX_RECORDS
        const { data, count, error } = await pagosQuery
            .order('fecha_pago', { ascending: false })
            .order('id', { ascending: false })
            .limit(MAX_RECORDS)

        pagos = data
        totalPagos = count
        pagosError = error
    }

    // Add turno to paginated results (for records that don't have it yet)
    const pagosWithTurns = (pagos || []).map(p => {
        if ((p as any).turno_calculado) return p
        const clienteAsesorId = (p as any).cronograma_cuotas?.prestamos?.clientes?.asesor_id
        const advisorId = clienteAsesorId || p.registrado_por
        const turno = calculateTurno(p.fecha_pago, advisorId)
        return { ...p, turno_calculado: turno }
    })

    if (pagosError) {
        console.error('Error fetching pagos:', pagosError.message)
    }

    // -------------------------------------------------------------------------
    // 3. STATS CALCULATION (FILTERED)
    // -------------------------------------------------------------------------
    
    // We run a separate query for totals to respect filters but ignore pagination
    let statsQuery = supabaseAdmin
        .from('pagos')
        .select('monto_pagado, interes_cobrado, fecha_pago, registrado_por, es_autopago_renovacion, perfiles:registrado_por(rol), cronograma_cuotas!inner(prestamos!inner(clientes!inner(nombres, asesor_id)))')
        .neq('estado_verificacion', 'rechazado')
    
    if (activeTipo === 'cobros') {
        statsQuery = statsQuery.eq('es_autopago_renovacion', false)
    } else {
        statsQuery = statsQuery.eq('es_autopago_renovacion', true)
    }

    // Apply the same filters as the main list
    if (userRol !== 'admin') {
        if (userRol === 'asesor') {
            // Asesor: Stats de todos los pagos de sus clientes (incluyendo los hechos por admin/supervisor)
            statsQuery = statsQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', userId)
        } else if (userRol === 'supervisor') {
            const teamAsesorIds = perfiles?.filter(p => p.supervisor_id === userId).map(p => p.id) || []
            if (asesorFilter && teamAsesorIds.includes(asesorFilter)) {
                statsQuery = statsQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', asesorFilter)
            } else {
                statsQuery = statsQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', teamAsesorIds.length > 0 ? teamAsesorIds : [NO_MATCH_UUID])
            }
        }
    } else {
        if (supervisorFilter) {
            const supervisorTeamIds = perfiles?.filter(p => p.supervisor_id === supervisorFilter).map(p => p.id) || []
            statsQuery = statsQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', supervisorTeamIds.length > 0 ? supervisorTeamIds : [NO_MATCH_UUID])
        }
        if (asesorFilter) {
            statsQuery = statsQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', asesorFilter)
        }
    }

    if (pagoPorFilter && pagoPorFilter !== 'all') {
        if (pagoPorFilter === 'asesor') {
            statsQuery = statsQuery.eq('perfiles.rol', 'asesor')
        } else if (pagoPorFilter === 'admin') {
            statsQuery = statsQuery.in('perfiles.rol', ['admin', 'supervisor', 'secretaria'])
        } else {
            statsQuery = statsQuery.eq('registrado_por', pagoPorFilter)
        }
    }

    if (query) {
        statsQuery = statsQuery.ilike('cronograma_cuotas.prestamos.clientes.nombres', `%${query}%`)
    }

    if (metodoFilter && metodoFilter !== 'all') {
        statsQuery = statsQuery.eq('metodo_pago', metodoFilter)
    }

    if (fechaInicioParam && fechaFinParam && userRol === 'admin') {
        statsQuery = statsQuery.gte('fecha_pago', `${fechaInicioParam}T00:00:00`)
            .lte('fecha_pago', `${fechaFinParam}T23:59:59`)
    } else if (fechaParam) {
        statsQuery = statsQuery.gte('fecha_pago', `${fechaParam}T00:00:00`)
            .lte('fecha_pago', `${fechaParam}T23:59:59`)
    } else {
        // [NUEVO] Sincronizado con la lista: si no hay filtro, estadísticas de HOY
        const todayPeru = getTodayPeru()
        statsQuery = statsQuery.gte('fecha_pago', `${todayPeru}T00:00:00`)
            .lte('fecha_pago', `${todayPeru}T23:59:59`)
    }

    // [NUEVO] Restricciones temporales por rol en estadísticas
    if (userRol === 'asesor' || userRol === 'supervisor') {
        const limitDays = userRol === 'asesor' ? 7 : 30
        const limitDate = new Date()
        limitDate.setDate(limitDate.getDate() - limitDays)
        const limitDateStr = limitDate.toISOString().split('T')[0]
        statsQuery = statsQuery.gte('fecha_pago', `${limitDateStr}T00:00:00`)
    }

    const { data: statsData } = await statsQuery

    // Apply Turn logic to Stats too
    const filteredStats = statsData?.filter(s => {
        if (!turnoFilter) return true
        // Use client asesor_id for cutoff lookup when available
        const clienteAsesorId = (s as any).cronograma_cuotas?.prestamos?.clientes?.asesor_id
        const advisorId = clienteAsesorId || s.registrado_por
        const turno = calculateTurno(s.fecha_pago, advisorId)
        return turno === turnoFilter
    }) || []

    const totalFiltrado = filteredStats.reduce((acc: number, curr: any) => {
        return acc + (parseFloat(curr.monto_pagado?.toString() || '0'))
    }, 0) || 0

    const totalGananciaFiltrado = filteredStats.reduce((acc: number, curr: any) => {
        return acc + (parseFloat(curr.interes_cobrado?.toString() || '0'))
    }, 0) || 0

    // Today's total for the filtered context
    const todayISO = getTodayPeru()
    
    const totalCobradoHoy = filteredStats.filter((p: any) => {
        return p.fecha_pago.startsWith(todayISO)
    }).reduce((acc: number, curr: any) => acc + (parseFloat(curr.monto_pagado?.toString() || '0')), 0) || 0

    const totalGananciaHoy = filteredStats.filter((p: any) => {
        return p.fecha_pago.startsWith(todayISO)
    }).reduce((acc: number, curr: any) => acc + (parseFloat(curr.interes_cobrado?.toString() || '0')), 0) || 0

    // finalPagos already has turno applied (either from turno-filtered path or regular path)
    const finalPagos = pagosWithTurns

    const hasFilters = Boolean(
        fechaParam || 
        fechaInicioParam ||
        fechaFinParam ||
        query || 
        asesorFilter || 
        supervisorFilter || 
        (turnoFilter && turnoFilter !== 'all') || 
        (metodoFilter && metodoFilter !== 'all') || 
        (pagoPorFilter && pagoPorFilter !== 'all') ||
        (activeTipo !== 'cobros')
    )

    return (
        <div className="page-container">
            <DashboardAlerts
                userId={userId}
                blockInfo={blockInfo}
                accessInfo={access}
            />
            {/* Header Section */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Transacciones</h1>
                            <p className="page-subtitle">Gestión de cobros y pagos</p>
                        </div>
                    </div>
                </div>

            </div>

            {/* Main Content */}
            <RecentPaymentsList
                pagos={finalPagos}
                totalRecords={totalPagos || 0}
                perfiles={perfiles || []}
                userRol={userRol}
                userId={userId}
                stats={{
                    totalCobradoHoy,
                    totalGananciaHoy,
                    totalFiltrado,
                    totalGananciaFiltrado,
                    hasFilters
                }}
                activeTipo={activeTipo}
            />
        </div>
    )
}
