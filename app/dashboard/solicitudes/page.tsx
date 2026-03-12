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

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
        .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
    
    const systemSchedule = (scheduleConfigs || []).reduce((acc: any, curr) => {
        acc[curr.clave] = curr.valor
        return acc
    }, {
        horario_apertura: '07:00',
        horario_cierre: '20:00',
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
    const canCreateDueToTime = (currentHourString >= (systemSchedule.horario_apertura || '07:00') && currentHourString < (systemSchedule.horario_cierre || '20:00')) || (new Date(systemSchedule.desbloqueo_hasta) > now) || perfil?.rol === 'admin'

    // Agrupar por estado para mostrar tabs
    const pendientes = solicitudes?.filter(s => s.estado_solicitud === 'pendiente_supervision') || []
    const enCorreccion = solicitudes?.filter(s => s.estado_solicitud === 'en_correccion') || []
    const preAprobados = solicitudes?.filter(s => s.estado_solicitud === 'pre_aprobado') || []
    const finalizados = solicitudes?.filter(s => ['aprobado', 'rechazado'].includes(s.estado_solicitud)) || []

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header with Action */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">Solicitud de Prospectos y Préstamos</h1>
                    </div>
                    <p className="text-slate-400 mt-2 md:mt-1">Gestiona las solicitudes de préstamos y nuevos prospectos</p>
                </div>
                {perfil?.rol === 'asesor' && (
                    <Link href={canCreateDueToTime ? "/dashboard/solicitudes/nueva" : "#"}>
                        <Button 
                            disabled={!canCreateDueToTime}
                            size="lg" 
                            className={cn(
                                "shadow-lg text-white font-semibold px-6 py-6 h-auto text-lg transition-all rounded-xl",
                                canCreateDueToTime 
                                    ? "bg-purple-600 hover:bg-purple-500 shadow-purple-900/20 hover:scale-105" 
                                    : "bg-slate-700 opacity-60 cursor-not-allowed"
                            )}
                        >
                            {canCreateDueToTime ? <Plus className="mr-2 h-5 w-5" /> : <Lock className="mr-2 h-5 w-5" />}
                            {canCreateDueToTime ? 'Nueva Solicitud' : 'Cerrado'}
                        </Button>
                    </Link>
                )}
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                {/* Card 1: Pendientes */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Clock className="w-16 h-16 text-yellow-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Pendientes</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{pendientes.length}</h2>
                    <div className="mt-2 text-yellow-400 flex items-center gap-1">
                        <span className="bg-yellow-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-yellow-900/50">REVISIÓN</span>
                    </div>
                </div>

                {/* Card 2: Pre-Aprobadas */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Eye className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Pre-Aprobadas</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{preAprobados.length}</h2>
                    <div className="mt-2 text-blue-400 flex items-center gap-1">
                        <span className="bg-blue-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-900/50">POR APROBAR</span>
                    </div>
                </div>

                {/* Card 3: En Corrección */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-orange-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <AlertCircle className="w-16 h-16 text-orange-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">En Corrección</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{enCorreccion.length}</h2>
                    <div className="mt-2 text-orange-400 flex items-center gap-1">
                        <span className="bg-orange-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-orange-900/50">ATENCIÓN</span>
                    </div>
                </div>

                {/* Card 4: Finalizadas */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CheckCircle className="w-16 h-16 text-slate-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Finalizadas</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{finalizados.length}</h2>
                    <div className="mt-2 text-slate-400 flex items-center gap-1">
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">COMPLETADO</span>
                    </div>
                </div>
            </div>

            {/* Contenedor del Listado y Filtros */}
            <SolicitudesList initialSolicitudes={solicitudes || []} perfil={perfil} />
        </div>
    )
}
