import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { CheckCircle, ShieldCheck, Camera, MapPin, ClipboardList } from 'lucide-react'
import { TareasList } from '@/components/tareas/tareas-list'
import { VisitasList } from '@/components/tareas/visitas-list'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TareasTabs } from '@/components/tareas/tareas-tabs'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Historial de Tareas'
}

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

    // 1. Obtener préstamos que ya pagaron hoy
    const todayStrFetch = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const { data: pagosHoy } = await supabaseAdmin
        .from('pagos')
        .select('cuota_id, cronograma_cuotas(prestamo_id)')
        .gte('created_at', `${todayStrFetch}T00:00:00Z`)
    
    const prestamosPagadosHoy = new Set((pagosHoy || []).map(p => (p.cronograma_cuotas as any)?.prestamo_id).filter(Boolean))

    const pendientesEvidencia  = tareasEvidencia.filter(t => t.estado === 'pendiente')
    const completadasEvidencia = tareasEvidencia.filter(t => t.estado === 'completada')
    const pendientesAuditoria  = tareasAuditoria.filter(t => t.estado === 'pendiente')
    
    // Filtrar visitas pendientes: solo las que NO han pagado hoy
    const pendientesVisita     = tareasVisita.filter(t => 
        t.estado === 'pendiente' && 
        !prestamosPagadosHoy.has(t.prestamo_id)
    )

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

    // --- ENRIQUECIMIENTO DE RESULTADOS DE GESTIÓN ---
    const completadasVisita = tareasVisita.filter(t => t.estado === 'completada')
    if (completadasVisita.length > 0) {
        const prestamoIds = [...new Set(completadasVisita.map(t => t.prestamo_id))]
        
        // Buscamos gestiones recientes de estos préstamos
        const { data: gestionesResultados } = await supabaseAdmin
            .from('gestiones')
            .select('prestamo_id, resultado, notas, created_at, usuario_id, tipo_gestion')
            .in('prestamo_id', prestamoIds)
            .order('created_at', { ascending: false })

        if (gestionesResultados && gestionesResultados.length > 0) {
            tareasVisita = tareasVisita.map(task => {
                if (task.estado !== 'completada') return task

                // Encontrar la gestión que coincida con el asesor y que sea posterior a la creación de la tarea
                // O simplemente la más reciente del asesor para ese préstamo
                const g = gestionesResultados.find(res => 
                    res.prestamo_id === task.prestamo_id && 
                    res.usuario_id === task.asesor_id &&
                    new Date(res.created_at) >= new Date(task.created_at)
                )

                if (g) {
                    return {
                        ...task,
                        gestion_resultado: g.resultado,
                        gestion_notas: g.notas,
                        gestion_tipo: g.tipo_gestion
                    }
                }
                return task
            })
        }
    }


    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Historial de Tareas</h1>
                            <p className="page-subtitle">Revisa y completa tus tareas pendientes.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="kpi-grid lg:grid-cols-4">
                <div className="kpi-card group hover:border-amber-500/30">
                    <div className="kpi-card-icon">
                        <Camera className="w-16 h-16 text-amber-500" />
                    </div>
                    <p className="kpi-label">Fotos Pendientes</p>
                    <h2 className="kpi-value">{pendientesEvidencia.length}</h2>
                </div>
                <div className="kpi-card group hover:border-blue-500/30">
                    <div className="kpi-card-icon">
                        <CheckCircle className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="kpi-label">Fotos Completadas</p>
                    <h2 className="kpi-value">{completadasEvidencia.length}</h2>
                </div>
                <div className="kpi-card group hover:border-emerald-500/30">
                    <div className="kpi-card-icon">
                        <ShieldCheck className="w-16 h-16 text-emerald-500" />
                    </div>
                    <p className="kpi-label">Por Auditar</p>
                    <h2 className="kpi-value">{pendientesAuditoria.length}</h2>
                </div>
                <div className="kpi-card group hover:border-blue-500/30">
                    <div className="kpi-card-icon">
                        <ClipboardList className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="kpi-label">Gestiones Pendientes</p>
                    <h2 className="kpi-value">{pendientesVisita.length}</h2>
                </div>
            </div>

            <Suspense fallback={<div className="h-96 w-full animate-pulse bg-slate-900/50 rounded-2xl border border-slate-800" />}>
                <TareasTabs defaultTab={tab && ['evidencia', 'auditoria', 'gestiones'].includes(tab) ? tab : 'evidencia'} className="w-full">
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
            </TareasTabs>
            </Suspense>
        </div>
    )
}
