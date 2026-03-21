"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
    Plus, Users, Phone, MapPin, MessageSquare, ShieldAlert,
    Loader2, AlertTriangle, CheckCircle2, Lock, X, Send,
    ClipboardList, Navigation, Navigation2
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { AsignarVisitaModal } from "@/components/gestiones/asignar-visita-modal"
import { RegistrarGestionModal } from "@/components/gestiones/registrar-gestion-modal"
const TIPO_ICON: Record<string, any> = {
    Llamada: Phone,
    Visita: MapPin,
    WhatsApp: MessageSquare,
    Auditoria: ShieldAlert,
}

const TIPO_COLOR: Record<string, string> = {
    Llamada: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Visita: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    WhatsApp: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Auditoria: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

const RESULTADO_COLOR: Record<string, string> = {
    'Promesa de Pago': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'Pagó': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'Contacto Exitoso': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Confirmado OK': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'Alerta Reportada': 'bg-red-500/20 text-red-400 border-red-500/30',
    'No Contesta': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    'Negativa de Pago': 'bg-red-500/20 text-red-400 border-red-500/30',
    'No Ubicado': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'Mensaje Enviado': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Visto sin Respuesta': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    'Mensaje Dejado': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    'No Entregado': 'bg-red-500/20 text-red-400 border-red-500/30',
}

interface Gestion {
    id: string
    tipo_gestion: string
    resultado: string
    notas: string | null
    coordenadas: string | null
    privado_supervisor: boolean
    created_at: string
    usuario: { nombre_completo: string; rol: string } | null
}

interface ClientGestionesProps {
    prestamoId: string
    clienteNombre?: string
    userRol: "admin" | "supervisor" | "asesor"
}

export function ClientGestiones({ prestamoId, clienteNombre = 'Cliente', userRol }: ClientGestionesProps) {
    const [gestiones, setGestiones] = useState<Gestion[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [asignarOpen, setAsignarOpen] = useState(false)

    const canCreate = userRol !== 'admin'
    const isAdmin = userRol === 'admin'

    useEffect(() => {
        if (!prestamoId) {
            setLoading(false)
            return
        }
        fetchGestiones()
    }, [prestamoId])

    async function fetchGestiones() {
        setLoading(true)
        const res = await fetch(`/api/gestiones?prestamo_id=${prestamoId}`)
        if (res.ok) {
            const data = await res.json()
            setGestiones(data)
        }
        setLoading(false)
    }

    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/20">
                <div>
                    <p className="text-xs md:text-sm font-bold text-white uppercase tracking-wider">Historial de Gestiones</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                        {gestiones.length} registro{gestiones.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-1.5">
                    {/* Admin: asignar visita */}
                    {isAdmin && (
                        <Button
                            onClick={() => setAsignarOpen(true)}
                            className="bg-amber-600/90 hover:bg-amber-500 text-white h-7 px-2.5 gap-1.5 text-[10px] font-bold uppercase tracking-tight"
                        >
                            <ClipboardList className="w-3 h-3" />
                            <span className="hidden sm:inline">Asignar</span>
                        </Button>
                    )}
                    {/* Todos los roles pueden registrar una gestión manual */}
                    <Button
                        onClick={() => setModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white h-7 px-2.5 gap-1.5 text-[10px] font-bold uppercase tracking-tight"
                    >
                        <Plus className="w-3 h-3" />
                        <span className="hidden sm:inline">Nueva</span>
                    </Button>
                </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 p-4 space-y-3">
                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
                    </div>
                ) : gestiones.length === 0 ? (
                    <div className="text-center py-12 px-6">
                        <div className="w-14 h-14 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center mx-auto mb-4 overflow-hidden relative">
                            <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
                            <MessageSquare className="w-7 h-7 text-slate-600 relative z-10" />
                        </div>
                        <h4 className="text-slate-300 font-bold text-sm mb-1 uppercase tracking-wide">Sin historial de gestión</h4>
                        <p className="text-slate-500 text-xs leading-relaxed max-w-[220px] mx-auto">
                            {!prestamoId 
                                ? 'Este cliente no registra préstamos activos o históricos para mostrar gestiones.' 
                                : 'Aún no se han registrado interacciones para este préstamo actual.'}
                        </p>
                    </div>
                ) : (
                    gestiones.map((gestion) => {
                        const isAuditoria = gestion.tipo_gestion === 'Auditoria'
                        const isVisita = gestion.tipo_gestion === 'Visita'
                        const isWhatsApp = gestion.tipo_gestion === 'WhatsApp'
                        const isLlamada = gestion.tipo_gestion === 'Llamada'
                        const isOK = gestion.resultado === 'Confirmado OK'
                        
                        const resultColor = RESULTADO_COLOR[gestion.resultado] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                        const tipoColor = TIPO_COLOR[gestion.tipo_gestion] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'

                        // Parse coordenadas para link de Google Maps
                        const mapsUrl = gestion.coordenadas
                            ? `https://www.google.com/maps?q=${gestion.coordenadas}`
                            : null

                        return (
                            <div
                                key={gestion.id}
                                className={cn(
                                    "relative pl-6 pb-3 border-l last:border-0 last:pb-0",
                                    isAuditoria ? "border-amber-900/40" : "border-slate-800/40"
                                )}
                            >
                                {/* Dot con ícono - Direct check instead of dynamic variable */}
                                <div className={cn(
                                    "absolute -left-[11px] top-0 w-5 h-5 rounded-full border border-slate-950 flex items-center justify-center shadow-lg",
                                    isAuditoria
                                        ? isOK ? "bg-emerald-900/60 border-emerald-700/40" : "bg-red-900/60 border-red-700/40"
                                        : isVisita ? "bg-purple-900/60 border-purple-700/40"
                                        : "bg-slate-800 border-slate-700"
                                )}>
                                    {isLlamada && <Phone className={cn("w-2.5 h-2.5", "text-blue-400")} />}
                                    {isWhatsApp && <MessageSquare className={cn("w-2.5 h-2.5", "text-emerald-400")} />}
                                    {isVisita && <MapPin className={cn("w-2.5 h-2.5", "text-purple-400")} />}
                                    {isAuditoria && <ShieldAlert className={cn("w-2.5 h-2.5", isOK ? "text-emerald-400" : "text-red-400")} />}
                                    {!isLlamada && !isWhatsApp && !isVisita && !isAuditoria && <Users className="w-2.5 h-2.5 text-slate-400" />}
                                </div>

                                {/* Card */}
                                <div className={cn(
                                    "rounded-lg border p-2.5",
                                    isAuditoria ? "bg-amber-950/5 border-amber-900/20"
                                    : isVisita ? "bg-purple-950/5 border-purple-900/20"
                                    : "bg-slate-900/30 border-slate-800/40"
                                )}>
                                    {/* Top row */}
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Badge variant="outline" className={cn("text-[9px] border px-1 h-4 font-bold uppercase tracking-tight", tipoColor)}>
                                                {gestion.tipo_gestion}
                                            </Badge>
                                            <Badge variant="outline" className={cn("text-[9px] border px-1 h-4 font-bold uppercase tracking-tight", resultColor)}>
                                                {isOK && <CheckCircle2 className="w-2 h-2 mr-1" />}
                                                {gestion.resultado}
                                            </Badge>
                                        </div>
                                        <span className="text-[9px] font-medium text-slate-500 whitespace-nowrap">
                                            {format(new Date(gestion.created_at), "dd MMM · HH:mm", { locale: es })}
                                        </span>
                                    </div>

                                    {/* Notas */}
                                    {gestion.notas && (
                                        <p className="text-[11px] text-slate-400 leading-snug italic mb-1.5 line-clamp-2 hover:line-clamp-none transition-all cursor-default">
                                            "{gestion.notas}"
                                        </p>
                                    )}

                                    {/* Footer Info */}
                                    <div className="flex items-center justify-between mt-auto">
                                        <div className="flex items-center gap-2">
                                            <div className="text-[9px] text-slate-600 font-medium flex items-center gap-1">
                                                <Users className="w-2.5 h-2.5" />
                                                <span>{gestion.usuario?.nombre_completo || 'Sistema'}</span>
                                                <span className="text-slate-700">· {gestion.usuario?.rol || 'asesor'}</span>
                                            </div>
                                            {isAuditoria && <Lock className="w-2.5 h-2.5 text-amber-900/40" />}
                                        </div>

                                        {mapsUrl && (
                                            <a
                                                href={mapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[9px] text-purple-500 hover:text-purple-400 font-bold uppercase tracking-tighter flex items-center gap-0.5"
                                            >
                                                <Navigation2 className="w-2.5 h-2.5" />
                                                Maps
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* ── Modal Asignar Visita (Admin) ── */}
            <AsignarVisitaModal
                prestamoId={prestamoId}
                clienteNombre={clienteNombre}
                open={asignarOpen}
                onClose={() => setAsignarOpen(false)}
                onAsignada={(tarea) => {
                    toast.success(`Tarea asignada a ${tarea.asesor?.nombre_completo || 'asesor'}`)
                }}
            />

            <RegistrarGestionModal 
                open={modalOpen}
                onOpenChange={setModalOpen}
                prestamoId={prestamoId}
                clienteNombre={clienteNombre}
                onSuccess={(nueva) => setGestiones(prev => [nueva, ...prev])}
            />
        </div>
    )
}
