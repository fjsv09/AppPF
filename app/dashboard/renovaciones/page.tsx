import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { RenovacionesSolicitudes } from '@/components/renovaciones/renovaciones-solicitudes'

import { Clock, Eye, AlertCircle, CheckCircle } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Solicitudes de Renovación'
}

export default async function RenovacionesPage(props: { searchParams: Promise<{ q?: string, estado?: string, sort?: string, order?: string, page?: string }> }) {
    const searchParams = await props.searchParams;
    const queryTerm = searchParams.q || ''
    const statusFilter = searchParams.estado || 'todos'
    const sortField = (searchParams.sort as 'created_at' | 'fecha_inicio' | 'fecha_aprobacion') || 'created_at'
    const sortOrder = (searchParams.order as 'desc' | 'asc') || 'desc'
    const currentPage = Number(searchParams.page) || 1
    const ITEMS_PER_PAGE = 10

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Obtener perfil
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol, supervisor_id')
        .eq('id', user.id)
        .single()

    if (!perfil) redirect('/login')

    // Preparar IDs para filtros de rol
    let restrictedAsesorIds: string[] = []
    if (perfil.rol === 'supervisor') {
        const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user.id)
        restrictedAsesorIds = asesores?.map(a => a.id) || []
        restrictedAsesorIds.push(user.id)
    }

    // Helper para aplicar filtros de seguridad
    const applySecurityFilters = (q: any) => {
        if (perfil.rol === 'asesor') {
            return q.eq('asesor_id', user.id)
        } else if (perfil.rol === 'supervisor') {
            return q.in('asesor_id', restrictedAsesorIds)
        }
        return q
    }

    // Consulta principal
    let mainQuery = supabaseAdmin
        .from('solicitudes_renovacion')
        .select(`
            *,
            cliente:cliente_id!inner(id, nombres, dni),
            prestamo:prestamo_id(id, monto, estado, estado_mora, frecuencia),
            asesor:asesor_id(id, nombre_completo),
            supervisor:supervisor_id(id, nombre_completo)
        `, { count: 'exact' })

    mainQuery = applySecurityFilters(mainQuery)

    if (queryTerm) {
        mainQuery = mainQuery.or(`nombres.ilike.%${queryTerm}%,dni.ilike.%${queryTerm}%`, { foreignTable: 'cliente' })
    }
    
    if (statusFilter !== 'todos') {
        mainQuery = mainQuery.eq('estado_solicitud', statusFilter)
    }

    const { data: solicitudes, count: totalRecords } = await mainQuery
        .order(sortField, { ascending: sortOrder === 'asc' })
        .range((currentPage - 1) * ITEMS_PER_PAGE, (currentPage * ITEMS_PER_PAGE) - 1)

    // Consultas para KPIs (independientes de la búsqueda)
    const getKpiCount = async (estados: string | string[]) => {
        let q = supabaseAdmin.from('solicitudes_renovacion').select('id', { count: 'exact', head: true })
        q = applySecurityFilters(q)
        if (Array.isArray(estados)) {
            q = q.in('estado_solicitud', estados)
        } else {
            q = q.eq('estado_solicitud', estados)
        }
        const { count } = await q
        return count || 0
    }

    const [pendientes, preAprobados, enCorreccion, finalizadas] = await Promise.all([
        getKpiCount('pendiente_supervision'),
        getKpiCount('pre_aprobado'),
        getKpiCount('en_correccion'),
        getKpiCount(['aprobado', 'rechazado'])
    ])

    // Lógica de Acceso y Bloqueos
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'renovacion')
    
    let blockInfo = null
    if (perfil.rol === 'asesor') {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id)
    }

    return (
        <div className="page-container">
            <DashboardAlerts 
                userId={user.id} 
                blockInfo={blockInfo} 
                accessInfo={access} 
            />

            {/* Header */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Solicitud de Renovación</h1>
                            <p className="page-subtitle">
                                {perfil.rol === 'asesor' && 'Tus solicitudes de renovación de préstamos'}
                                {perfil.rol === 'supervisor' && 'Solicitudes pendientes de pre-aprobación'}
                                {perfil.rol === 'admin' && 'Todas las solicitudes de renovación'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="kpi-grid md:grid-cols-4">
                <div className="kpi-card group hover:border-yellow-500/30">
                    <div className="kpi-card-icon">
                        <Clock className="w-16 h-16 text-yellow-500" />
                    </div>
                    <p className="kpi-label">Pendientes</p>
                    <h2 className="kpi-value">{pendientes}</h2>
                    <div className="mt-2 text-yellow-400 flex items-center gap-1">
                        <span className="kpi-badge bg-yellow-950/50 text-yellow-400 border border-yellow-900/50">REVISIÓN</span>
                    </div>
                </div>

                <div className="kpi-card group hover:border-blue-500/30">
                    <div className="kpi-card-icon">
                        <Eye className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="kpi-label">Pre-Aprobadas</p>
                    <h2 className="kpi-value">{preAprobados}</h2>
                    <div className="mt-2 text-blue-400 flex items-center gap-1">
                        <span className="kpi-badge bg-blue-950/50 text-blue-400 border border-blue-900/50">POR APROBAR</span>
                    </div>
                </div>

                <div className="kpi-card group hover:border-orange-500/30">
                    <div className="kpi-card-icon">
                        <AlertCircle className="w-16 h-16 text-orange-500" />
                    </div>
                    <p className="kpi-label">En Corrección</p>
                    <h2 className="kpi-value">{enCorreccion}</h2>
                    <div className="mt-2 text-orange-400 flex items-center gap-1">
                        <span className="kpi-badge bg-orange-950/50 text-orange-400 border border-orange-900/50">ATENCIÓN</span>
                    </div>
                </div>

                <div className="kpi-card group hover:border-slate-500/30">
                    <div className="kpi-card-icon">
                        <CheckCircle className="w-16 h-16 text-slate-500" />
                    </div>
                    <p className="kpi-label">Finalizadas</p>
                    <h2 className="kpi-value">{finalizadas}</h2>
                    <div className="mt-2 text-slate-400 flex items-center gap-1">
                        <span className="kpi-badge bg-slate-800 text-slate-400 border border-slate-700">COMPLETADO</span>
                    </div>
                </div>
            </div>

            {/* Contenido */}
            <RenovacionesSolicitudes 
                solicitudes={solicitudes || []} 
                userRole={perfil.rol}
                userId={user.id}
                totalRecords={totalRecords || 0}
                currentPage={currentPage}
                pageSize={ITEMS_PER_PAGE}
            />
        </div>
    )
}
