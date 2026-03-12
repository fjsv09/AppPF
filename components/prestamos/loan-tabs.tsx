'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { CronogramaClient } from "./cronograma-client"
import { PaymentHistory } from "./payment-history"
import { ClientGestiones } from "@/components/clientes/client-gestiones"
import { CalendarDays, History, MessageSquare, Camera, AlertCircle, ShieldCheck } from "lucide-react"
import { ImageLightbox } from "@/components/ui/image-lightbox"
import { UploadEvidenceButton } from "@/components/dashboard/upload-evidence-button"
import { useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"

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
}

export function LoanTabs({ 
    prestamo, 
    cronograma, 
    pagos, 
    userRole = 'asesor', 
    cliente, 
    tareaEvidencia,
    systemSchedule 
}: LoanTabsProps) {
    const searchParams = useSearchParams()
    const tabParam = searchParams.get('tab')
    const [activeTab, setActiveTab] = useState("cronograma")

    useEffect(() => {
        if (tabParam && ["cronograma", "historial", "evidencia", "gestiones"].includes(tabParam)) {
            setActiveTab(tabParam)
        }
    }, [tabParam])

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <div className="overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
                <TabsList className="bg-slate-900/50 border border-slate-800 p-0.5 w-full grid grid-cols-4 md:flex md:w-fit">
                    <TabsTrigger value="cronograma" className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <CalendarDays className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Cronograma
                    </TabsTrigger>
                    <TabsTrigger value="historial" className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <History className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Historial
                    </TabsTrigger>
                    <TabsTrigger value="evidencia" className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <Camera className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Evidencia
                    </TabsTrigger>
                    <TabsTrigger value="gestiones" className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <MessageSquare className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Gestiones
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="cronograma" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
                <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                    <CardContent className="p-3 md:p-6">
                        <CronogramaClient 
                            prestamo={prestamo} 
                            cronograma={cronograma} 
                            userRol={userRole} 
                            systemSchedule={systemSchedule}
                        />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="historial" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
                <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                    <CardContent className="p-3 md:p-6">
                        <PaymentHistory pagos={pagos} prestamo={prestamo} cliente={cliente || prestamo.clientes} cronograma={cronograma} userRole={userRole} />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="evidencia" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0">
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
                                                        <img 
                                                            src={tareaEvidencia.evidencia_url} 
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                                            alt="Miniatura evidencia" 
                                                        />
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
            </TabsContent>

            <TabsContent value="gestiones" id="gestiones-tab" className="focus-visible:outline-none focus-visible:ring-0 mt-0">
                <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                    <CardContent className="p-0">
                        <ClientGestiones
                            prestamoId={prestamo.id}
                            clienteNombre={cliente?.nombres || prestamo.clientes?.nombres || 'Cliente'}
                            userRol={userRole}
                        />
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    )
}
