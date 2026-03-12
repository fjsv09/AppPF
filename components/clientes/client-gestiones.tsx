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

const TIPO_GESTION_OPCIONES = ['Llamada', 'WhatsApp', 'Visita']
const RESULTADO_OPCIONES: Record<string, string[]> = {
    Llamada: ['Promesa de Pago', 'No Contesta', 'Mensaje Dejado', 'Pagó', 'Negativa de Pago'],
    Visita: ['Contacto Exitoso', 'No Ubicado', 'Promesa de Pago', 'Negativa de Pago'],
    WhatsApp: ['Mensaje Enviado', 'Visto sin Respuesta', 'Promesa de Pago', 'No Entregado'],
}

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
    const [isPending, startTransition] = useTransition()

    // Form state
    const [tipoGestion, setTipoGestion] = useState('Llamada')
    const [resultado, setResultado] = useState('Promesa de Pago')
    const [notas, setNotas] = useState('')

    // GPS state
    const [coordenadas, setCoordenadas] = useState<string | null>(null)
    const [gpsLoading, setGpsLoading] = useState(false)
    const [gpsError, setGpsError] = useState<string | null>(null)

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

    function handleChangeTipo(tipo: string) {
        setTipoGestion(tipo)
        setResultado(RESULTADO_OPCIONES[tipo][0])
        // Limpiar GPS si cambia de Visita
        if (tipo !== 'Visita') {
            setCoordenadas(null)
            setGpsError(null)
        }
    }

    function handleCloseModal() {
        setModalOpen(false)
        setNotas('')
        setTipoGestion('Llamada')
        setResultado(RESULTADO_OPCIONES['Llamada'][0])
        setCoordenadas(null)
        setGpsError(null)
    }

    async function captureGPS() {
        if (!navigator.geolocation) {
            setGpsError('Tu dispositivo no soporta geolocalización')
            return
        }
        setGpsLoading(true)
        setGpsError(null)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`
                setCoordenadas(coords)
                setGpsLoading(false)
                toast.success('Ubicación capturada correctamente')
            },
            (err) => {
                setGpsError('No se pudo obtener la ubicación. Verifica los permisos de tu dispositivo.')
                setGpsLoading(false)
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    async function handleGuardar() {
        if (!resultado) return
        // Visita requiere coordenadas
        if (tipoGestion === 'Visita' && !coordenadas) {
            toast.error('Debes capturar tu ubicación GPS antes de registrar una visita')
            return
        }

        startTransition(async () => {
            const res = await fetch('/api/gestiones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prestamo_id: prestamoId,
                    tipo_gestion: tipoGestion,
                    resultado,
                    notas,
                    coordenadas
                })
            })

            if (res.ok) {
                const nueva = await res.json()
                setGestiones(prev => [nueva, ...prev])
                handleCloseModal()
                toast.success('Gestión registrada correctamente')
            } else {
                const err = await res.json()
                toast.error(err.error || 'Error al guardar la gestión')
            }
        })
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

            {/* ── Modal Nueva Gestión ── */}
            <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
                <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-md p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-6 py-5 border-b border-slate-800 bg-slate-900/50">
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            Registrar Gestión
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                        {/* Tipo */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vía de Contacto</label>
                            <div className="grid grid-cols-3 gap-2">
                                {TIPO_GESTION_OPCIONES.map((tipo) => {
                                    const TIcon = TIPO_ICON[tipo]
                                    const isActive = tipoGestion === tipo
                                    return (
                                        <button
                                            key={tipo}
                                            onClick={() => handleChangeTipo(tipo)}
                                            className={cn(
                                                "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all",
                                                isActive
                                                    ? "bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                                                    : "bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                                            )}
                                        >
                                            <TIcon className="w-4 h-4" />
                                            <span className="text-[11px] font-bold uppercase tracking-tight">{tipo}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Acciones Directas — Solo para Llamada o WhatsApp */}
                        {(tipoGestion === 'Llamada' || tipoGestion === 'WhatsApp') && prestamoId && (
                            <div className="space-y-2 animate-in slide-in-from-top duration-300">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    {tipoGestion === 'Llamada' ? <Phone className="w-3 h-3 text-blue-400" /> : <MessageSquare className="w-3 h-3 text-emerald-400" />}
                                    Acción Directa
                                </label>
                                
                                {tipoGestion === 'Llamada' ? (
                                    <Button
                                        asChild
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white h-11 gap-2 text-sm font-semibold shadow-lg shadow-blue-900/40"
                                    >
                                        <a href={`tel:${gestiones?.[0]?.usuario?.nombre_completo === 'tel' ? '' : (prestamoId as any).telefono || ''}`}>
                                            <Phone className="w-4 h-4" />
                                            Llamar al Cliente
                                        </a>
                                    </Button>
                                ) : (
                                    <Button
                                        asChild
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 gap-2 text-sm font-semibold shadow-lg shadow-emerald-900/40"
                                    >
                                        <a 
                                            href={`https://wa.me/${(prestamoId as any).telefono?.replace(/\D/g, '') || ''}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                        >
                                            <MessageSquare className="w-4 h-4" />
                                            Enviar WhatsApp
                                        </a>
                                    </Button>
                                )}
                                <p className="text-[10px] text-slate-600 text-center">
                                    {tipoGestion === 'Llamada' ? 'Al terminar la llamada, registra el resultado abajo' : 'Al enviar el mensaje, registra el resultado abajo'}
                                </p>
                            </div>
                        )}

                        {/* GPS — solo si es Visita */}
                        {tipoGestion === 'Visita' && (
                            <div className="space-y-2 animate-in slide-in-from-top duration-300">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Navigation className="w-3 h-3 text-blue-400" />
                                    Verificación GPS
                                    <span className="text-red-400 text-xs">* Obligatorio</span>
                                </label>
                                {coordenadas ? (
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/30 border border-emerald-700/40">
                                        <Navigation2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-semibold text-emerald-400">Ubicación capturada ✓</p>
                                            <p className="text-[10px] font-mono text-emerald-600 mt-0.5">{coordenadas}</p>
                                        </div>
                                        <button onClick={() => setCoordenadas(null)} className="text-slate-500 hover:text-slate-300">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Button
                                            onClick={captureGPS}
                                            disabled={gpsLoading}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white h-11 gap-2 text-sm font-semibold"
                                        >
                                            {gpsLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Navigation className="w-4 h-4" />
                                            )}
                                            {gpsLoading ? 'Obteniendo ubicación...' : '📍 Capturar mi Ubicación GPS'}
                                        </Button>
                                        {gpsError && (
                                            <p className="text-xs text-red-400 flex items-start gap-1.5 p-2 bg-red-950/20 rounded-lg border border-red-900/30">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                {gpsError}
                                            </p>
                                        )}
                                        <p className="text-[10px] text-slate-600 text-center">
                                            Debes estar en la ubicación del cliente para capturar la ubicación
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Resultado */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resultado de la Gestión</label>
                            <div className="grid grid-cols-1 gap-1.5">
                                {(RESULTADO_OPCIONES[tipoGestion] || []).map((res) => {
                                    const isActive = resultado === res
                                    return (
                                        <button
                                            key={res}
                                            onClick={() => setResultado(res)}
                                            className={cn(
                                                "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all",
                                                isActive
                                                    ? "bg-blue-600/20 border-blue-500/40 text-blue-200 font-medium"
                                                    : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                                            )}
                                        >
                                            {res}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Notas */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Notas de Seguimiento <span className="text-slate-600 normal-case font-normal">(opcional)</span>
                            </label>
                            <textarea
                                value={notas}
                                onChange={e => setNotas(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-xl p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-600"
                                placeholder="Ej: Hablé con el titular, prometió pagar mañana..."
                            />
                        </div>
                    </div>

                    <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-slate-900">
                        <Button
                            variant="outline"
                            onClick={handleCloseModal}
                            className="flex-1 bg-transparent border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                            <X className="w-3.5 h-3.5 mr-2" />
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleGuardar}
                            disabled={isPending || !resultado || (tipoGestion === 'Visita' && !coordenadas)}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
                        >
                            {isPending ? (
                                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                            ) : (
                                <Send className="w-3.5 h-3.5 mr-2" />
                            )}
                            Guardar Gestión
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

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
        </div>
    )
}
