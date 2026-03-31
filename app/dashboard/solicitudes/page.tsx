import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { SolicitudesList } from '@/components/solicitudes/solicitudes-list'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Plus, FileText, Clock, CheckCircle, XCircle, AlertCircle, Eye, Users, Calendar, DollarSign, Lock } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
    title: 'Solicitudes'
}

const estadoConfig: Record<string, { label: string, color: string, icon: any }> = {
    'pendiente_supervision': { label: 'Pendiente Supervisión', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
    'en_correccion': { label: 'En Corrección', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: AlertCircle },
    'pre_aprobado': { label: 'Pre-Aprobado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Eye },
    'aprobado': { label: 'Aprobado', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
    'rechazado': { label: 'Rechazado', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export default async function SolicitudesPage() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol, supervisor_id')
        .eq('id', user?.id)
        .single()

    // Fetch solicitudes según rol
    let query = supabaseAdmin
        .from('solicitudes')
        .select(`
            *,
            cliente:cliente_id(id, nombres, dni),
            asesor:asesor_id(id, nombre_completo)
        `)
        .order('created_at', { ascending: false })

    if (perfil?.rol === 'asesor') {
        query = query.eq('asesor_id', user?.id)
    } else if (perfil?.rol === 'supervisor') {
        // Supervisor ve solicitudes de sus asesores
        const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user?.id)
        const asesorIds = asesores?.map(a => a.id) || []
        asesorIds.push(user?.id || '')
        query = query.in('asesor_id', asesorIds)
    }

    const { data: solicitudes } = await query

    // Fetch schedule config
    const { data: scheduleConfigs } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta', 'horario_fin_turno_1'])
    
    const systemSchedule = (scheduleConfigs || []).reduce((acc: any, curr) => {
        acc[curr.clave] = curr.valor
        return acc
    }, {
        horario_apertura: '10:00',
        horario_cierre: '19:00',
        horario_fin_turno_1: '13:30',
        desbloqueo_hasta: '2000-01-01T00:00:00Z'
    })

    const now = new Date()
    const formatter = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })
    const currentHourString = formatter.format(now)
    
    // Centralized Access Check
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const access = await checkSystemAccess(supabaseAdmin, user?.id || '', perfil?.rol || 'asesor', 'solicitud')
    
    // [NUEVO] Obtener información de bloqueos de deuda
    let blockInfo = null
    if (perfil?.rol === 'asesor' && user?.id) {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id)
    }

    let canCreateDueToTime = access.allowed || perfil?.rol === 'admin'
    const blockReason = access.reason || 'Acceso restringido'

    // Agrupar por estado para mostrar tabs
    const pendientes = solicitudes?.filter(s => s.estado_solicitud === 'pendiente_supervision') || []
    const enCorreccion = solicitudes?.filter(s => s.estado_solicitud === 'en_correccion') || []
    const preAprobados = solicitudes?.filter(s => s.estado_solicitud === 'pre_aprobado') || []
    const finalizados = solicitudes?.filter(s => ['aprobado', 'rechazado'].includes(s.estado_solicitud)) || []

    return (
        <div className="page-container">
            <DashboardAlerts 
                userId={user?.id || ''} 
                blockInfo={blockInfo} 
                accessInfo={access} 
            />
            
            {/* Header with Action */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Solicitud de Prospectos y Préstamos</h1>
                            <p className="page-subtitle">Gestiona las solicitudes de préstamos y nuevos prospectos</p>
                        </div>
                    </div>
                </div>
                {perfil?.rol === 'asesor' && (
                    <div className="flex flex-col items-end gap-3">
                        <Link href={canCreateDueToTime ? "/dashboard/solicitudes/nueva" : "#"}>
                            <Button 
                                disabled={!canCreateDueToTime}
                                className={cn(
                                    "h-12 px-6 rounded-xl font-bold transition-all duration-300",
                                    canCreateDueToTime 
                                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/20 hover:scale-105 active:scale-95 border border-purple-400/20" 
                                        : "bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed grayscale"
                                )}
                            >
                                {canCreateDueToTime ? <Plus className="mr-2 h-5 w-5" /> : <Lock className="mr-2 h-4 w-4" />}
                                {canCreateDueToTime ? 'Nueva Solicitud' : 'Bloqueado'}
                            </Button>
                        </Link>
                    </div>
                )}
            </div>

            {/* Hero Stats */}
            <div className="kpi-grid md:grid-cols-4">
                {/* Card 1: Pendientes */}
                <div className="kpi-card group hover:border-yellow-500/30">
                    <div className="kpi-card-icon">
                        <Clock className="w-16 h-16 text-yellow-500" />
                    </div>
                    <p className="kpi-label">Pendientes</p>
                    <h2 className="kpi-value">{pendientes.length}</h2>
                    <div className="mt-2 text-yellow-400 flex items-center gap-1">
                        <span className="kpi-badge bg-yellow-950/50 text-yellow-400 border border-yellow-900/50">REVISIÓN</span>
                    </div>
                </div>

                {/* Card 2: Pre-Aprobadas */}
                <div className="kpi-card group hover:border-blue-500/30">
                    <div className="kpi-card-icon">
                        <Eye className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="kpi-label">Pre-Aprobadas</p>
                    <h2 className="kpi-value">{preAprobados.length}</h2>
                    <div className="mt-2 text-blue-400 flex items-center gap-1">
                        <span className="kpi-badge bg-blue-950/50 text-blue-400 border border-blue-900/50">POR APROBAR</span>
                    </div>
                </div>

                {/* Card 3: En Corrección */}
                <div className="kpi-card group hover:border-orange-500/30">
                    <div className="kpi-card-icon">
                        <AlertCircle className="w-16 h-16 text-orange-500" />
                    </div>
                    <p className="kpi-label">En Corrección</p>
                    <h2 className="kpi-value">{enCorreccion.length}</h2>
                    <div className="mt-2 text-orange-400 flex items-center gap-1">
                        <span className="kpi-badge bg-orange-950/50 text-orange-400 border border-orange-900/50">ATENCIÓN</span>
                    </div>
                </div>

                {/* Card 4: Finalizadas */}
                <div className="kpi-card group hover:border-slate-500/30">
                    <div className="kpi-card-icon">
                        <CheckCircle className="w-16 h-16 text-slate-500" />
                    </div>
                    <p className="kpi-label">Finalizadas</p>
                    <h2 className="kpi-value">{finalizados.length}</h2>
                    <div className="mt-2 text-slate-400 flex items-center gap-1">
                        <span className="kpi-badge bg-slate-800 text-slate-400 border border-slate-700">COMPLETADO</span>
                    </div>
                </div>
            </div>

            {/* Contenedor del Listado y Filtros */}
            <SolicitudesList initialSolicitudes={solicitudes || []} perfil={perfil} />
        </div>
    )
}
