
import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { DollarSign, TrendingUp } from 'lucide-react'
import { PaymentModal } from '@/components/pagos/payment-modal'
import { RecentPaymentsList } from '@/components/pagos/recent-payments-list'
import { BackButton } from '@/components/ui/back-button'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
    title: 'Transacciones y Cobros'
}

export default async function PagosPage(props: { searchParams: Promise<{ fecha?: string, p_page?: string, q?: string, asesor?: string, supervisor?: string, fecha_cuota?: string, turno?: string, metodo?: string }> }) {
    const searchParams = await props.searchParams;
    const fechaParam = searchParams.fecha;
    const query = searchParams.q;
    const asesorFilter = searchParams.asesor;
    const supervisorFilter = searchParams.supervisor;
    const turnoFilter = searchParams.turno; // Turno 1 / Turno 2
    const metodoFilter = searchParams.metodo;

    const paymentPage = Number(searchParams.p_page) || 1
    const ITEMS_PER_PAGE = 30 // Increased for better turn analysis

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

    const userRol = (perfil?.rol || 'asesor') as 'admin' | 'supervisor' | 'asesor'
    const userId = user?.id || ''

    // [NUEVO] Lógica de Acceso al Sistema
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const access = await checkSystemAccess(supabaseAdmin, userId, userRol, 'pago')

    let blockInfo = null
    if (userRol === 'asesor') {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, userId)
    }

    // Fetch all perfiles for filters
    const { data: perfiles } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol, supervisor_id')
        .in('rol', ['supervisor', 'asesor'])
        .order('nombre_completo')

    // Build pagos query with role-based filtering and pagination
    let pagosQuery = supabaseAdmin
        .from('pagos')
        .select(`
            *,
            cronograma_cuotas!inner (
                numero_cuota,
                fecha_vencimiento,
                prestamos!inner (
                    clientes!inner (nombres, asesor_id)
                )
            ),
            perfiles!registrado_por ( nombre_completo )
        `, { count: 'exact' })
        .not('registrado_por', 'is', null)

    if (userRol === 'asesor') {
        // Asesor: Solo ve lo que él mismo registró
        pagosQuery = pagosQuery.eq('registrado_por', userId)
    } else if (userRol === 'supervisor') {
        // Supervisor: Ve lo que él mismo registró + lo que registraron sus asesores
        const teamAsesorIds = perfiles?.filter(p => p.supervisor_id === userId).map(p => p.id) || []
        const relevantRegistradores = [userId, ...teamAsesorIds]
        
        if (asesorFilter && relevantRegistradores.includes(asesorFilter)) {
            pagosQuery = pagosQuery.eq('registrado_por', asesorFilter)
        } else {
            pagosQuery = pagosQuery.in('registrado_por', relevantRegistradores)
        }
    } else if (userRol === 'admin') {
        if (supervisorFilter) {
            const supervisorTeamIds = perfiles?.filter(p => p.supervisor_id === supervisorFilter).map(p => p.id) || []
            // Admin filtering by supervisor: show payments by supervisor + their team
            const relevantForSupervisor = [supervisorFilter, ...supervisorTeamIds]
            pagosQuery = pagosQuery.in('registrado_por', relevantForSupervisor)
        }
        if (asesorFilter) {
            pagosQuery = pagosQuery.eq('registrado_por', asesorFilter)
        }
    }

    if (query) {
        pagosQuery = pagosQuery.ilike('cronograma_cuotas.prestamos.clientes.nombres', `%${query}%`)
    }

    if (fechaParam) {
        // Filter by the day of payment
        pagosQuery = pagosQuery.gte('fecha_pago', `${fechaParam}T00:00:00`)
            .lte('fecha_pago', `${fechaParam}T23:59:59`)
    }



    if (metodoFilter && metodoFilter !== 'all') {
        pagosQuery = pagosQuery.eq('metodo_pago', metodoFilter)
    }

    const { data: pagos, count: totalPagos, error: pagosError } = await pagosQuery
        .order('fecha_pago', { ascending: false })
        .order('id', { ascending: false })
        .range((paymentPage - 1) * ITEMS_PER_PAGE, (paymentPage * ITEMS_PER_PAGE) - 1)

    // -------------------------------------------------------------------------
    // [NUEVO] TURN SEGMENTATION LOGIC
    // -------------------------------------------------------------------------
    // We fetch the first 'parcial_mañana' of today for each relevant advisor
    const today = new Date()
    today.setHours(0,0,0,0)
    const todayStr = today.toISOString().split('T')[0]

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
    const pagosWithTurns = pagos?.map(p => {
        const advisorId = p.registrado_por
        const cutoff = cutoffMap[advisorId]
        
        let turno = 'Turno 1' // Default: START in Turno 1 (AM)
        
        if (cutoff) {
            // Once a cutoff (Cierre Mañana) exists, payments AFTER it are Turno 2 (PM)
            if (new Date(p.fecha_pago) > new Date(cutoff)) {
                turno = 'Turno 2'
            }
        }
        
        return { ...p, turno_calculado: turno }
    }) || []

    if (pagosError) {
        console.error('Error fetching pagos:', pagosError.message)
    }

    // -------------------------------------------------------------------------
    // 3. STATS CALCULATION (FILTERED)
    // -------------------------------------------------------------------------
    
    // We run a separate query for totals to respect filters but ignore pagination
    let statsQuery = supabaseAdmin
        .from('pagos')
        .select('monto_pagado, fecha_pago, registrado_por, cronograma_cuotas!inner(prestamos!inner(clientes!inner(nombres)))')
        .not('registrado_por', 'is', null)

    // Apply the same filters as the main list
    if (userRol !== 'admin') {
        if (userRol === 'asesor') {
            statsQuery = statsQuery.eq('registrado_por', userId)
        } else if (userRol === 'supervisor') {
            const teamAsesorIds = perfiles?.filter(p => p.supervisor_id === userId).map(p => p.id) || []
            const relevantRegistradores = [userId, ...teamAsesorIds]
            statsQuery = statsQuery.in('registrado_por', relevantRegistradores)
        }
        if (asesorFilter) {
            statsQuery = statsQuery.eq('registrado_por', asesorFilter)
        }
    } else {
        if (supervisorFilter) {
            const supervisorTeamIds = perfiles?.filter(p => p.supervisor_id === supervisorFilter).map(p => p.id) || []
            const relevantForSupervisor = [supervisorFilter, ...supervisorTeamIds]
            statsQuery = statsQuery.in('registrado_por', relevantForSupervisor)
        }
        if (asesorFilter) {
            statsQuery = statsQuery.eq('registrado_por', asesorFilter)
        }
    }

    if (query) {
        statsQuery = statsQuery.ilike('cronograma_cuotas.prestamos.clientes.nombres', `%${query}%`)
    }

    if (fechaParam) {
        statsQuery = statsQuery.gte('fecha_pago', `${fechaParam}T00:00:00`)
            .lte('fecha_pago', `${fechaParam}T23:59:59`)
    }

    const { data: statsData } = await statsQuery.not('registrado_por', 'is', null)


    
    // Apply Turn logic to Stats too
    const filteredStats = statsData?.filter(s => {
        if (!turnoFilter) return true
        const cutoff = cutoffMap[s.registrado_por]
        let turno = 'Turno 2'
        if (cutoff && new Date(s.fecha_pago) <= new Date(cutoff)) turno = 'Turno 1'
        return turno === (turnoFilter === '1' ? 'Turno 1' : 'Turno 2')
    }) || []

    const totalFiltrado = filteredStats.reduce((acc: number, curr: any) => acc + (curr.monto_pagado || 0), 0) || 0

    // Today's total for the filtered context
    const now = new Date()
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    
    const totalCobradoHoy = filteredStats.filter((p: any) => {
        return p.fecha_pago.startsWith(todayISO)
    }).reduce((acc: number, curr: any) => acc + (curr.monto_pagado || 0), 0) || 0

    // Filter main list by turn if selected
    const finalPagos = turnoFilter 
        ? pagosWithTurns.filter(p => p.turno_calculado === (turnoFilter === '1' ? 'Turno 1' : 'Turno 2'))
        : pagosWithTurns

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
                <PaymentModal userRol={userRol} />

            </div>

            {/* Daily Stats Grid */}
            <div className="kpi-grid md:grid-cols-2">
                <div className="kpi-card group hover:border-emerald-500/30 flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
                        <DollarSign className="w-7 h-7 text-emerald-500" />
                    </div>
                    <div>
                        <p className="kpi-label">Cobrado Hoy</p>
                        <h3 className="kpi-value">${totalCobradoHoy.toLocaleString()}</h3>
                    </div>
                </div>

                <div className="kpi-card group hover:border-blue-500/30 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                        <TrendingUp className="w-7 h-7 text-blue-500" />
                    </div>
                    <div>
                        <p className="kpi-label">Total en Búsqueda</p>
                        <h3 className="kpi-value">${totalFiltrado.toLocaleString()}</h3>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <RecentPaymentsList
                pagos={finalPagos}
                totalRecords={totalPagos || 0}
                currentPage={paymentPage}
                pageSize={ITEMS_PER_PAGE}
                perfiles={perfiles || []}
                userRol={userRol}
                userId={userId}
            />
        </div>
    )
}
