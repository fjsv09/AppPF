"use client"

import { ImageLightbox } from "@/components/ui/image-lightbox"
import { FileText, MapPin, DollarSign, Briefcase, Calendar, Info, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDate, formatMoney } from "@/utils/format"

interface ClientExpedienteProps {
    documentos: Record<string, string> | null
    solicitud?: {
        giro_negocio?: string
        fuentes_ingresos?: string
        ingresos_mensuales?: number
        motivo_prestamo?: string
        gps_coordenadas?: string
        monto_solicitado?: number
        interes?: number
        cuotas?: number
        modalidad?: string
        fecha_inicio_propuesta?: string
    } | null
}

const DOC_LABELS: Record<string, string> = {
    dni_frontal: 'DNI Frontal',
    dni_posterior: 'DNI Posterior',
    foto_cliente: 'Foto Cliente',
    frontis_casa: 'Fachada Casa',
    recibo_luz_agua: 'Recibo Servicios',
    negocio: 'Foto Negocio',
    documentos_negocio: 'Doc. Negocio',
    filtro_sentinel: 'Reporte Sentinel'
}

export function ClientExpediente({ documentos, solicitud }: ClientExpedienteProps) {
    const docs = Object.entries(documentos || {}).filter(([key, url]) => url && DOC_LABELS[key])

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Sección de Datos de la Solicitud Original */}
            {solicitud && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Detalles del Préstamo Original */}
                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm overflow-hidden">
                        <div className="p-4 bg-slate-950/40 border-b border-slate-800/60 flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-500/10 rounded-md">
                                <DollarSign className="w-4 h-4 text-emerald-400" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-200">Préstamo Solicitado Original</h3>
                        </div>
                        <CardContent className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Monto</p>
                                    <p className="text-lg font-black text-white">${formatMoney(solicitud.monto_solicitado)}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Interés</p>
                                    <p className="text-lg font-black text-emerald-400">{solicitud.interes}%</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Cuotas</p>
                                    <p className="text-sm font-bold text-slate-200">{solicitud.cuotas} {solicitud.modalidad === 'diario' ? 'días' : solicitud.modalidad === 'semanal' ? 'semanas' : 'cuotas'}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Modalidad</p>
                                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 capitalize font-bold">
                                        {solicitud.modalidad}
                                    </Badge>
                                </div>
                            </div>
                            
                            <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                    <span className="text-[11px] text-slate-400 font-medium">Fecha Propuesta:</span>
                                </div>
                                <span className="text-[11px] text-slate-200 font-mono">{solicitud.fecha_inicio_propuesta ? formatDate(solicitud.fecha_inicio_propuesta) : '-'}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Evaluación Comercial */}
                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm overflow-hidden">
                        <div className="p-4 bg-slate-950/40 border-b border-slate-800/60 flex items-center gap-2">
                            <div className="p-1.5 bg-blue-500/10 rounded-md">
                                <Briefcase className="w-4 h-4 text-blue-400" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-200">Evaluación Comercial</h3>
                        </div>
                        <CardContent className="p-5 space-y-4">
                            <div className="space-y-3">
                                {solicitud.giro_negocio && (
                                    <div className="flex items-start gap-3">
                                        <Info className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-0.5">Giro de Negocio</p>
                                            <p className="text-xs text-slate-200 leading-relaxed font-medium">{solicitud.giro_negocio}</p>
                                        </div>
                                    </div>
                                )}
                                {solicitud.ingresos_mensuales && (
                                    <div className="flex items-start gap-3">
                                        <Clock className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-0.5">Ingresos Mensuales</p>
                                            <p className="text-sm font-black text-emerald-400 font-mono">S/ {formatMoney(solicitud.ingresos_mensuales)}</p>
                                        </div>
                                    </div>
                                )}
                                {solicitud.motivo_prestamo && (
                                    <div className="flex items-start gap-3 pt-2 border-t border-slate-800/30">
                                        <div className="flex-1">
                                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Motivo del Préstamo</p>
                                            <p className="text-xs text-slate-400 italic leading-relaxed">&quot;{solicitud.motivo_prestamo}&quot;</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {solicitud.gps_coordenadas && (
                                <a 
                                    href={`https://www.google.com/maps/search/?api=1&query=${solicitud.gps_coordenadas}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-all group"
                                >
                                    <MapPin className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-xs font-bold text-blue-400">Ver Ubicación GPS Registrada</span>
                                </a>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Galería de Documentos */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Expediente Digitalizado</h3>
                    <div className="h-px flex-1 bg-slate-800/50 ml-2" />
                </div>

                {docs.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                        <FileText className="w-12 h-12 mb-3 opacity-10" />
                        <p className="text-sm font-medium">No hay documentos digitalizados para este cliente</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {docs.map(([key, url]) => (
                            <ImageLightbox 
                                key={key}
                                src={url as string} 
                                alt={DOC_LABELS[key]}
                                className="aspect-square bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative group cursor-pointer shadow-sm hover:shadow-xl hover:border-slate-600 transition-all duration-300"
                                thumbnail={(
                                    <div className="w-full h-full relative">
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={url as string} alt={DOC_LABELS[key]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                        </>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end pb-4">
                                            <p className="text-white text-[10px] font-black uppercase tracking-widest bg-blue-600 px-3 py-1 rounded-full shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform">
                                                {DOC_LABELS[key]}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
