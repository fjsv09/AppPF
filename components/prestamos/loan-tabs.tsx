'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CronogramaClient } from "./cronograma-client"
import { PaymentHistory } from "./payment-history"
import { ClientGestiones } from "@/components/clientes/client-gestiones"
import { CalendarDays, History, MessageSquare, Camera, AlertCircle, ShieldCheck, Loader2, MapPin, Activity } from "lucide-react"
import { ScoreIndicator, ScoreBreakdown } from "@/components/ui/score-indicator"
import { ImageLightbox } from "@/components/ui/image-lightbox"
import { UploadEvidenceButton } from "@/components/dashboard/upload-evidence-button"
import { DailyCollectorLog } from "./daily-collector-log"
import { useSearchParams, useRouter } from "next/navigation"
import { useState, useEffect, useCallback, useTransition } from "react"

interface LoanTabsProps {
    prestamo: any
    cronograma: any[]
    pagos: any[]
    userRole?: 'admin' | 'supervisor' | 'asesor'
    cliente?: any
    tareaEvidencia?: any
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        desbloqueo_hasta: string
    }
    isBlockedByCuadre?: boolean
    blockReasonCierre?: string
    systemAccess?: any
    cuadresHoy?: any[]
    loanScore?: any
}

import { VisitadosList } from "./visitados-list"

export function LoanTabs({ 
    prestamo, 
    cronograma, 
    pagos, 
    userRole = 'asesor', 
    cliente, 
    tareaEvidencia,
    systemSchedule,
    isBlockedByCuadre,
    blockReasonCierre,
    systemAccess,
    cuadresHoy = [],
    loanScore
}: LoanTabsProps) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const tabParam = searchParams.get('tab')
    
    // Validar el tab de la URL o usar el default
    const isAdmin = userRole === 'admin'
    const isAdvisor = userRole === 'asesor'
    const allowedTabs = ["historial", "salud", "evidencia", "gestiones"]
    
    // Solo admin puede ver/gestionar cronograma
    if (isAdmin) {
        allowedTabs.push("cronograma")
    }
    
    // Otros roles (supervisor/admin) ven visitas, asesor no.
    if (!isAdvisor) {
        allowedTabs.push("visitas")
    }
    
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState(() => {
        if (tabParam && allowedTabs.includes(tabParam)) {
            return tabParam
        }
        return "historial"
    })
    
    // Sincronizar estado si la URL cambia (ej: por botones de navegación)
    useEffect(() => {
        if (tabParam && allowedTabs.includes(tabParam) && tabParam !== activeTab) {
            setActiveTab(tabParam)
        } else if (tabParam && !allowedTabs.includes(tabParam)) {
            setActiveTab("historial")
            // Opcional: router.replace(...) para limpiar la URL
        }
    }, [tabParam, activeTab, allowedTabs])

    const handleTabChange = useCallback((value: string) => {
        setActiveTab(value) // Feedback inmediato en el label
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('tab', value)
            router.replace(`?${params.toString()}`, { scroll: false })
        })
    }, [searchParams, router])

    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
            <div className={`overflow-x-auto pb-1 scrollbar-none scroll-smooth w-full min-w-0 transition-opacity duration-300 ${isPending ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <TabsList className="bg-slate-900/50 border border-slate-800 p-0.5 flex items-center w-max min-w-full md:min-w-0 md:w-fit gap-1 relative overflow-hidden">
                    {/* Indicador de carga sutil */}
                    {isPending && (
                        <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
                    )}
                    <TabsTrigger value="historial" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                        <History className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Historial
                    </TabsTrigger>
                    <TabsTrigger value="salud" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                        <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Salud
                    </TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="cronograma" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                            <CalendarDays className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Cronograma
                        </TabsTrigger>
                    )}
                    {!isAdvisor && (
                        <TabsTrigger value="visitas" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                            <MapPin className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Visitas
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="evidencia" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <Camera className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Evidencia
                    </TabsTrigger>
                    <TabsTrigger value="gestiones" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <MessageSquare className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Gestiones
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="salud" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 animate-in fade-in duration-300">
                {loanScore ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm md:col-span-1">
                            <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                <CardTitle className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-emerald-400" />
                                    Salud del Préstamo
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 flex flex-col items-center justify-center">
                                <ScoreIndicator score={loanScore.score} size="lg" className="mb-2" />
                                <div className="flex gap-4 mt-4">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-slate-500 uppercase font-black">Puntualidad</span>
                                        <span className="text-xs font-bold text-emerald-400">+{loanScore.increases}</span>
                                    </div>
                                    <div className="flex flex-col items-center border-l border-white/5 pl-4">
                                        <span className="text-[9px] text-slate-500 uppercase font-black">Penalizaciones</span>
                                        <span className="text-xs font-bold text-rose-400">-{loanScore.penalties}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm md:col-span-2">
                            <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                <CardTitle className="text-white text-xs font-black uppercase tracking-widest">
                                    Desglose de Puntos
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <ScoreBreakdown loanScore={loanScore} />
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <div className="text-center py-20 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
                        <Loader2 className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-4" />
                        <p className="text-slate-400 text-sm">Calculando salud del préstamo...</p>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="historial" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 overflow-x-hidden min-h-[300px]">
                {isPending ? (
                    <div className="flex items-center justify-center py-20 bg-slate-900/10 border border-slate-800/50 rounded-2xl animate-in fade-in duration-300">
                        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                    </div>
                ) : (
                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                        <CardContent className="p-3 md:p-6 space-y-8">
                            <DailyCollectorLog 
                                cronograma={cronograma} 
                                pagos={pagos} 
                                cuadresHoy={cuadresHoy}
                                prestamo={prestamo} 
                                cliente={cliente}
                                userRole={userRole}
                                systemSchedule={systemSchedule}
                                isBlockedByCuadre={isBlockedByCuadre}
                                blockReasonCierre={blockReasonCierre}
                                systemAccess={systemAccess}
                            />
                            

                        </CardContent>
                    </Card>
                )}
            </TabsContent>
            {isAdmin && (
                <TabsContent value="cronograma" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 overflow-x-hidden min-h-[300px]">
                    {isPending ? (
                        <div className="flex items-center justify-center py-20 bg-slate-900/10 border border-slate-800/50 rounded-2xl animate-in fade-in duration-300">
                            <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                        </div>
                    ) : (
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                            <CardContent className="p-3 md:p-6">
                                <CronogramaClient 
                                    prestamo={prestamo} 
                                    cronograma={cronograma} 
                                    userRol={userRole}
                                    systemSchedule={systemSchedule}
                                    isBlockedByCuadre={isBlockedByCuadre}
                                    blockReasonCierre={blockReasonCierre}
                                    systemAccess={systemAccess}
                                    pagos={pagos}
                                />
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            )}

            {!isAdvisor && (
                <TabsContent value="visitas" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 overflow-x-hidden min-h-[300px]">
                    {isPending ? (
                        <div className="flex items-center justify-center py-20 bg-slate-900/10 border border-slate-800/50 rounded-2xl animate-in fade-in duration-300">
                            <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                        </div>
                    ) : (
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                            <CardContent className="p-0">
                                <VisitadosList prestamoId={prestamo.id} userRole={userRole} />
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            )}

            <TabsContent value="evidencia" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 overflow-x-hidden min-h-[300px]">
                {isPending ? (
                    <div className="flex items-center justify-center py-20 bg-slate-900/10 border border-slate-800/50 rounded-2xl animate-in fade-in duration-300">
                        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                    </div>
                ) : (
                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                        <CardContent className="p-4 md:p-5">
                        {!tareaEvidencia ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                                <Camera className="w-10 h-10 mb-3 opacity-20" />
                                <p className="text-sm">No hay registro de evidencia para este préstamo.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div>
                                        <h3 className="text-base font-bold text-white/90">Registro de Evidencia</h3>
                                        <p className="text-slate-500 text-[11px] leading-tight">Validación visual de desembolso y documentos.</p>
                                    </div>
                                    <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider ${
                                        tareaEvidencia.estado === 'completada' 
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    }`}>
                                        {tareaEvidencia.estado === 'completada' ? 'COMPLETADA' : 'PENDIENTE'}
                                    </div>
                                </div>

                                 {tareaEvidencia.estado === 'completada' ? (
                                    <div className="flex flex-col md:flex-row gap-3 items-start">
                                        {tareaEvidencia.evidencia_url && !tareaEvidencia.evidencia_url.startsWith('[AUDITORÍA') ? (
                                            <div className="w-full md:w-36 aspect-video md:aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40 relative group shrink-0 shadow-lg">
                                                <ImageLightbox 
                                                    src={tareaEvidencia.evidencia_url}
                                                    alt="Evidencia del préstamo"
                                                    thumbnail={
                                                        <>
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img 
                                                                src={tareaEvidencia.evidencia_url} 
                                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                                                alt="Miniatura evidencia" 
                                                            />
                                                        </>
                                                    }
                                                />
                                            </div>
                                        ) : tareaEvidencia.evidencia_url?.startsWith('[AUDITORÍA') ? (
                                            <div className="w-full md:w-36 aspect-video md:aspect-square rounded-lg border border-emerald-500/20 flex flex-col items-center justify-center bg-emerald-500/5 shrink-0">
                                                <ShieldCheck className="w-8 h-8 text-emerald-500 mb-2" />
                                                <p className="text-emerald-400 text-[9px] font-bold uppercase tracking-wider">Auditada OK</p>
                                            </div>
                                        ) : (
                                            <div className="w-full md:w-36 aspect-video md:aspect-square rounded-lg border border-dashed border-white/10 flex items-center justify-center bg-white/5 shrink-0">
                                                <p className="text-slate-500 text-[10px]">Sin foto</p>
                                            </div>
                                        )}
                                        
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                                            <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-black mb-0.5">Completada por</p>
                                                <p className="text-white/90 text-[13px] font-bold leading-none">{tareaEvidencia.asesor?.nombre_completo || 'Asesor'}</p>
                                            </div>
                                            <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                                                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-black mb-0.5">Fecha y Hora</p>
                                                <p className="text-white/90 text-[13px] font-bold leading-none">
                                                    {tareaEvidencia.completada_en ? new Date(tareaEvidencia.completada_en).toLocaleString() : '-'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 bg-amber-500/5 rounded-xl border border-dashed border-amber-500/20 space-y-4">
                                        <div className="p-3 bg-amber-500/20 rounded-full">
                                            <AlertCircle className="w-8 h-8 text-amber-500" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-amber-200 font-medium font-outfit uppercase tracking-wider">Evidencia requerida</p>
                                            <p className="text-slate-400 text-sm mt-1 max-w-xs px-4">Esta tarea de evidencia técnica aún no ha sido completada por el asesor.</p>
                                        </div>
                                        <div className="pt-2">
                                            <UploadEvidenceButton 
                                                tareaId={tareaEvidencia.id}
                                                clienteNombre={cliente?.nombres || prestamo.clientes?.nombres || 'Cliente'}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
                )}
            </TabsContent>

            <TabsContent value="gestiones" id="gestiones-tab" className="focus-visible:outline-none focus-visible:ring-0 mt-0 overflow-x-hidden min-h-[300px]">
                {isPending ? (
                    <div className="flex items-center justify-center py-20 bg-slate-900/10 border border-slate-800/50 rounded-2xl animate-in fade-in duration-300">
                        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                    </div>
                ) : (
                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                        <CardContent className="p-0">
                            <ClientGestiones
                                loans={[prestamo]}
                                clienteId={prestamo.cliente_id}
                                clienteNombre={cliente?.nombres || prestamo.clientes?.nombres || 'Cliente'}
                                userRol={userRole}
                            />
                        </CardContent>
                    </Card>
                )}
            </TabsContent>
        </Tabs>
    )
}
