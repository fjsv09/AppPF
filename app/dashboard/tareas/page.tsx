import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { CheckCircle, ShieldCheck, Camera, MapPin, ClipboardList } from 'lucide-react'
import { TareasList } from '@/components/tareas/tareas-list'
import { VisitasList } from '@/components/tareas/visitas-list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'

export default async function TareasHistoryPage({ 
    searchParams 
}: { 
    searchParams: Promise<{ tab?: string }> 
}) {
    const { tab } = await searchParams
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol, id')
        .eq('id', user.id)
        .single()
    if (!perfil) redirect('/login')

    const selectStr = `
        *,
        asesor:asesor_id(nombre_completo),
        prestamo:prestamo_id(
            monto,
            cliente_id,
            cliente:cliente_id(nombres, dni, id, telefono)
        )
    `

    let tareasEvidencia: any[] = []
    let tareasAuditoria: any[] = []
    let tareasVisita: any[] = []

    if (perfil.rol === 'asesor') {
        const { data: tareas } = await supabaseAdmin
            .from('tareas_evidencia')
            .select(selectStr)
            .eq('asesor_id', user.id)
            .order('created_at', { ascending: false })

        tareasEvidencia = tareas?.filter(t => !t.tipo.includes('auditoria_dirigida') && t.tipo !== 'visita_asignada' && t.tipo !== 'gestion_asignada') || []
        tareasAuditoria = tareas?.filter(t => t.tipo.includes('auditoria_dirigida')) || []
        tareasVisita    = tareas?.filter(t => t.tipo === 'visita_asignada' || t.tipo === 'gestion_asignada') || []

    } else if (perfil.rol === 'supervisor') {
        const { data: equipo } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user.id)
        const equipoIds = equipo?.map(e => e.id) || []

        const { data: tareasNormales } = await supabaseAdmin
            .from('tareas_evidencia')
            .select(selectStr)
            .in('asesor_id', [...equipoIds, user.id])
            .not('tipo', 'eq', 'auditoria_dirigida')
            .not('tipo', 'in', ['visita_asignada', 'gestion_asignada'])
            .order('created_at', { ascending: false })
        tareasEvidencia = tareasNormales || []

        const { data: visitasSup } = await supabaseAdmin
            .from('tareas_evidencia')
            .select(selectStr)
            .in('asesor_id', [...equipoIds, user.id])
            .in('tipo', ['visita_asignada', 'gestion_asignada'])
            .order('created_at', { ascending: false })
        tareasVisita = visitasSup || []

        const { data: prestamosEquipo } = await supabaseAdmin
            .from('prestamos')
            .select('id')
            .in('created_by', [...equipoIds, user.id])
            .eq('estado', 'activo')
        const prestamoIds = prestamosEquipo?.map(p => p.id) || []

        const { data: auditsDirect } = await supabaseAdmin
            .from('tareas_evidencia')
            .select(selectStr)
            .eq('asesor_id', user.id)
            .eq('tipo', 'auditoria_dirigida')
            .order('created_at', { ascending: false })

        let auditsEquipo: any[] = []
        if (prestamoIds.length > 0) {
            const { data: auditsEq } = await supabaseAdmin
                .from('tareas_evidencia')
                .select(selectStr)
                .in('prestamo_id', prestamoIds)
                .eq('tipo', 'auditoria_dirigida')
                .order('created_at', { ascending: false })
            auditsEquipo = auditsEq || []
        }

        const allAuditorias = [...(auditsDirect || []), ...auditsEquipo]
        const seen = new Set<string>()
        tareasAuditoria = allAuditorias.filter(t => {
            if (seen.has(t.id)) return false
            seen.add(t.id)
            return true
        })

    } else {
        // Admin: ve todo
        const { data: tareas } = await supabaseAdmin
            .from('tareas_evidencia')
            .select(selectStr)
            .order('created_at', { ascending: false })

        tareasEvidencia = tareas?.filter(t => !t.tipo.includes('auditoria_dirigida') && t.tipo !== 'visita_asignada' && t.tipo !== 'gestion_asignada') || []
        tareasAuditoria = tareas?.filter(t => t.tipo.includes('auditoria_dirigida')) || []
        tareasVisita    = tareas?.filter(t => t.tipo === 'visita_asignada' || t.tipo === 'gestion_asignada') || []
    }

    const pendientesEvidencia  = tareasEvidencia.filter(t => t.estado === 'pendiente')
    const completadasEvidencia = tareasEvidencia.filter(t => t.estado === 'completada')
    const pendientesAuditoria  = tareasAuditoria.filter(t => t.estado === 'pendiente')
    const pendientesVisita     = tareasVisita.filter(t => t.estado === 'pendiente')

    // Enriquecer visitas con coordenadas GPS del cliente (desde solicitudes)
    if (tareasVisita.length > 0) {
        const clienteIds = [...new Set(
            tareasVisita.map(t => t.prestamo?.cliente_id || t.prestamo?.cliente?.id).filter(Boolean)
        )]
        if (clienteIds.length > 0) {
            const { data: solicitudesGps } = await supabaseAdmin
                .from('solicitudes')
                .select('cliente_id, gps_coordenadas')
                .in('cliente_id', clienteIds)
                .not('gps_coordenadas', 'is', null)
                .order('created_at', { ascending: false })

            // Mapa cliente_id → primera coordenada encontrada
            const gpsMap: Record<string, string> = {}
            for (const sol of (solicitudesGps || [])) {
                if (sol.cliente_id && sol.gps_coordenadas && !gpsMap[sol.cliente_id]) {
                    gpsMap[sol.cliente_id] = sol.gps_coordenadas
                }
            }

            tareasVisita = tareasVisita.map(t => ({
                ...t,
                cliente_gps: gpsMap[t.prestamo?.cliente_id || t.prestamo?.cliente?.id] || null
            }))
        }
    }


    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-xl md:text-3xl font-bold tracking-tight text-white/90">Historial de Tareas</h1>
                    </div>
                    <p className="text-slate-400 text-sm md:text-base mt-2">Revisa y completa tus tareas pendientes.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-amber-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Camera className="w-16 h-16 text-amber-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Fotos Pendientes</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{pendientesEvidencia.length}</h2>
                </div>
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CheckCircle className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Fotos Completadas</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{completadasEvidencia.length}</h2>
                </div>
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-900/30 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <ShieldCheck className="w-16 h-16 text-emerald-500" />
                    </div>
                    <p className="text-emerald-500/50 font-bold text-[10px] uppercase tracking-wider mb-1">Por Auditar</p>
                    <h2 className="text-xl md:text-3xl font-bold text-emerald-50">{pendientesAuditoria.length}</h2>
                </div>
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-blue-900/30 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <ClipboardList className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="text-blue-500/50 font-bold text-[10px] uppercase tracking-wider mb-1">Gestiones Pendientes</p>
                    <h2 className="text-xl md:text-3xl font-bold text-blue-100">{pendientesVisita.length}</h2>
                </div>
            </div>

            <Tabs defaultValue={tab && ['evidencia', 'auditoria', 'gestiones'].includes(tab) ? tab : (pendientesVisita.length > 0 ? 'gestiones' : 'evidencia')} className="w-full">
                <div className="overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
                    <TabsList className={cn(
                        "bg-slate-900/50 border border-slate-800 p-0.5 w-full grid md:flex md:w-fit",
                        (perfil.rol === 'admin' || perfil.rol === 'supervisor') ? "grid-cols-3" : "grid-cols-2"
                    )}>
                        <TabsTrigger
                            value="evidencia"
                            className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white"
                        >
                            <Camera className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" />
                            Evidencias
                        </TabsTrigger>

                        {(perfil.rol === 'supervisor' || perfil.rol === 'admin' || tareasAuditoria.length > 0) && (
                            <TabsTrigger
                                value="auditoria"
                                className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white"
                            >
                                <ShieldCheck className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" />
                                Auditorías
                                {pendientesAuditoria.length > 0 && (
                                    <span className="ml-2 bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0 rounded-full border border-emerald-500/30">
                                        {pendientesAuditoria.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        )}

                        {(tareasVisita.length > 0 || perfil.rol === 'admin') && (
                            <TabsTrigger
                                value="gestiones"
                                className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white"
                            >
                                <ClipboardList className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" />
                                Gestiones Asignadas
                                {pendientesVisita.length > 0 && (
                                    <span className="ml-2 bg-blue-500/20 text-blue-300 text-[9px] px-1.5 py-0 rounded-full border border-blue-500/30 animate-pulse">
                                        {pendientesVisita.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        )}
                    </TabsList>
                </div>

                <TabsContent value="evidencia" className="mt-0">
                    <TareasList initialTareas={tareasEvidencia} userId={user.id} userRol={perfil.rol} />
                </TabsContent>

                <TabsContent value="auditoria" className="mt-0">
                    <TareasList initialTareas={tareasAuditoria} userId={user.id} userRol={perfil.rol} />
                </TabsContent>

                <TabsContent value="gestiones" className="mt-0">
                    <VisitasList visitas={tareasVisita} userId={user.id} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
