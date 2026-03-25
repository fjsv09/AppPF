"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
    MapPin, Navigation, Navigation2, User, AlertTriangle,
    CheckCircle2, Loader2, Send, X, ClipboardList, ExternalLink,
    Phone, MessageSquare, DollarSign
} from "lucide-react"
import { QuickPayModal } from "../prestamos/quick-pay-modal"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const RESULTADO_OPCIONES = ['Contacto Exitoso', 'No Ubicado', 'Promesa de Pago', 'Negativa de Pago']

interface Visita {
    id: string
    prestamo_id: string
    asesor_id: string
    estado: 'pendiente' | 'completada'
    notas: string | null
    created_at: string
    cliente_gps?: string | null
    asesor?: { nombre_completo: string } | null
    prestamo?: {
        monto: number
        cliente_id?: string
        cliente?: { nombres: string; dni: string; id: string; telefono: string } | null
    } | null
}

interface VisitasListProps {
    visitas: Visita[]
    userId: string
}

export function VisitasList({ visitas, userId }: VisitasListProps) {
    const [visitaActiva, setVisitaActiva] = useState<Visita | null>(null)
    const [modalOpen, setModalOpen] = useState(false)

    // State del modal completar gestión
    const [tipoGestion, setTipoGestion] = useState<'Llamada' | 'Visita' | 'WhatsApp'>('Llamada')
    const [resultado, setResultado] = useState('Contacto Exitoso')
    const [notas, setNotas] = useState('')
    const [coordenadas, setCoordenadas] = useState<string | null>(null)
    const [gpsLoading, setGpsLoading] = useState(false)
    const [gpsError, setGpsError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const [visitasState, setVisitasState] = useState<Visita[]>(visitas)

    // Quick Pay
    const [quickPayOpen, setQuickPayOpen] = useState(false)
    const [selectedLoanIdForPay, setSelectedLoanIdForPay] = useState<string | null>(null)

    function handleAbrirCompletar(visita: Visita) {
        setVisitaActiva(visita)
        setTipoGestion('Llamada')
        setResultado('Contacto Exitoso')
        setNotas('')
        setCoordenadas(null)
        setGpsError(null)
        setModalOpen(true)
    }

    function handleCerrar() {
        setModalOpen(false)
        setVisitaActiva(null)
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
                toast.success('Ubicación capturada ✓')
            },
            () => {
                setGpsError('No se pudo obtener la ubicación. Verifica los permisos del navegador.')
                setGpsLoading(false)
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    async function handleCompletarGestion() {
        if (!visitaActiva) return
        if (tipoGestion === 'Visita' && !coordenadas) {
            toast.error('Las coordenadas GPS son obligatorias para visitas')
            return
        }

        startTransition(async () => {
            // 1. Marcar la tarea como completada
            const resTarea = await fetch(`/api/tareas/${visitaActiva.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'completada' })
            })

            // 2. Registrar la gestión
            const resGestion = await fetch('/api/gestiones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prestamo_id: visitaActiva.prestamo_id,
                    tipo_gestion: tipoGestion,
                    resultado,
                    notas,
                    coordenadas: tipoGestion === 'Visita' ? coordenadas : null,
                    silencioso: true
                })
            })

            if (resGestion.ok) {
                setVisitasState(prev =>
                    prev.map(v => v.id === visitaActiva.id ? { ...v, estado: 'completada' } : v)
                )
                handleCerrar()
                toast.success('Gestión completada y registrada correctamente')
            } else {
                const err = await resGestion.json()
                toast.error(err.error || 'Error al registrar la gestión')
            }
        })
    }

    const pendientes = visitasState.filter(v => v.estado === 'pendiente')
    const completadas = visitasState.filter(v => v.estado === 'completada')

    if (visitasState.length === 0) {
        return (
            <div className="text-center py-16 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
                <div className="w-14 h-14 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                    <ClipboardList className="w-7 h-7 text-slate-600" />
                </div>
                <p className="text-slate-400 font-medium">Sin gestiones asignadas</p>
                <p className="text-slate-600 text-sm mt-1">El administrador puede asignarte gestiones desde el préstamo</p>
            </div>
        )
    }

    return (
        <>
            {/* Pendientes */}
            {pendientes.length > 0 && (
                <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Pendientes ({pendientes.length})
                    </p>
                    {pendientes.map(visita => {
                        const cliente = visita.prestamo?.cliente
                        const mapsQuery = cliente ? encodeURIComponent(cliente.nombres) : ''
                        return (
                            <div key={visita.id} className="bg-gradient-to-r from-blue-950/30 to-slate-900/60 border border-blue-700/30 rounded-2xl p-4 shadow-lg">
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-800/30 border border-blue-700/30 flex items-center justify-center shrink-0">
                                            <ClipboardList className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">
                                                {cliente?.nombres || 'Cliente'}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-mono">
                                                DNI: {cliente?.dni || '—'} · Tel: {cliente?.telefono || '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] shrink-0 animate-pulse">
                                        PENDIENTE
                                    </Badge>
                                </div>

                                {/* Instrucciones del admin */}
                                {visita.notas && (
                                    <div className="mb-3 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
                                        <span className="text-slate-600 font-bold uppercase text-[10px]">Instrucciones: </span>
                                        {visita.notas}
                                    </div>
                                )}

                                {/* Acciones */}
                        <div className="flex gap-2 items-center">
                            {/* Link a Google Maps con GPS real del cliente o por nombre */}
                            {(() => {
                                const gpsUrl = visita.cliente_gps
                                    ? `https://www.google.com/maps?q=${visita.cliente_gps}`
                                    : cliente
                                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.nombres)}`
                                        : null
                                return gpsUrl ? (
                                    <a
                                        href={gpsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors px-3 py-1.5 rounded-lg bg-blue-900/20 border border-blue-800/30 hover:border-blue-700/50"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        {visita.cliente_gps ? '📍 Ver Ubicación GPS' : 'Ver en Maps'}
                                    </a>
                                ) : null
                            })()}
                                     {userId === visita.asesor_id && (
                                        <div className="flex-1">
                                            <Button
                                                onClick={() => handleAbrirCompletar(visita)}
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white h-9 text-xs font-semibold gap-1.5"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                                Registrar Gestión
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-2 text-[10px] text-slate-600 flex items-center gap-1">
                                    <ClipboardList className="w-3 h-3" />
                                    Asignada {format(new Date(visita.created_at), "dd MMM · HH:mm", { locale: es })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Completadas */}
            {completadas.length > 0 && (
                <div className="space-y-3 mt-6">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Completadas ({completadas.length})
                    </p>
                    {completadas.map(visita => {
                        const cliente = visita.prestamo?.cliente
                        return (
                            <div key={visita.id} className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-4 opacity-70">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-900/20 border border-emerald-800/30 flex items-center justify-center shrink-0">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">
                                                {cliente?.nombres || 'Cliente'}
                                            </p>
                                            <p className="text-[10px] text-slate-600">
                                                Completada {format(new Date(visita.created_at), "dd MMM · HH:mm", { locale: es })}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                                        COMPLETADA
                                    </Badge>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Modal Completar Gestión ── */}
            <Dialog open={modalOpen} onOpenChange={(o) => !o && handleCerrar()}>
                <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-md p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-6 py-5 border-b border-slate-800 bg-slate-900/50">
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                                <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            Registrar Gestión
                        </DialogTitle>
                        {visitaActiva?.prestamo?.cliente && (
                            <p className="text-xs text-slate-500 mt-1 pl-9">
                                Cliente: <span className="text-slate-300">{visitaActiva.prestamo.cliente.nombres}</span>
                            </p>
                        )}
                    </DialogHeader>

                    <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

                        {/* Tipo de Gestión */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vía de contacto</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['Llamada', 'WhatsApp', 'Visita'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setTipoGestion(t)}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                            tipoGestion === t
                                                ? "bg-blue-600/20 border-blue-500/40 text-blue-200"
                                                : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                                        )}
                                    >
                                        {t === 'Llamada' && <Phone className="w-4 h-4" />}
                                        {t === 'WhatsApp' && <MessageSquare className="w-4 h-4" />}
                                        {t === 'Visita' && <MapPin className="w-4 h-4" />}
                                        <span className="text-[10px] font-bold uppercase">{t}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Acciones Directas — Solo para Llamada o WhatsApp */}
                        {(tipoGestion === 'Llamada' || tipoGestion === 'WhatsApp') && visitaActiva?.prestamo?.cliente?.telefono && (
                            <div className="space-y-2 animate-in slide-in-from-top duration-300">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    {tipoGestion === 'Llamada' ? <Phone className="w-3 h-3 text-blue-400" /> : <MessageSquare className="w-3 h-3 text-emerald-400" />}
                                    Acción Directa
                                </label>
                                
                                {tipoGestion === 'Llamada' ? (
                                    <Button
                                        asChild
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white h-11 gap-2 text-sm font-semibold"
                                    >
                                        <a href={`tel:${visitaActiva.prestamo.cliente.telefono}`}>
                                            <Phone className="w-4 h-4" />
                                            Llamar al Cliente
                                        </a>
                                    </Button>
                                ) : (
                                    <Button
                                        asChild
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 gap-2 text-sm font-semibold"
                                    >
                                        <a 
                                            href={`https://wa.me/${visitaActiva.prestamo.cliente.telefono.replace(/\D/g, '')}`} 
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

                        {/* GPS — Solo para Visita */}
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
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Obteniendo ubicación...</>
                                            ) : (
                                                <><Navigation className="w-4 h-4" /> 📍 Capturar mi Ubicación GPS</>
                                            )}
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
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resultado</label>
                            <div className="grid grid-cols-1 gap-1.5">
                                {RESULTADO_OPCIONES.map((res) => (
                                    <button
                                        key={res}
                                        onClick={() => setResultado(res)}
                                        className={cn(
                                            "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all",
                                            resultado === res
                                                ? "bg-blue-600/20 border-blue-500/40 text-blue-200 font-medium"
                                                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                                        )}
                                    >
                                        {res}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Notas */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Notas <span className="text-slate-600 normal-case font-normal">(opcional)</span>
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
                            onClick={handleCerrar}
                            className="flex-1 bg-transparent border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                            <X className="w-3.5 h-3.5 mr-2" /> Cancelar
                        </Button>
                        <Button
                            onClick={handleCompletarGestion}
                            disabled={isPending || (tipoGestion === 'Visita' && !coordenadas) || !resultado}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
                        >
                            {isPending
                                ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                : <Send className="w-3.5 h-3.5 mr-2" />
                            }
                            Completar Gestión
                        </Button>
                    </div>

                </DialogContent>
            </Dialog>
            {/* Quick Pay Modal */}
            <QuickPayModal 
                open={quickPayOpen}
                onOpenChange={setQuickPayOpen}
                prestamoId={selectedLoanIdForPay || undefined}
                userRol="asesor"
                onSuccess={() => {
                   // router.refresh() if needed
                }}
            />
        </>
    )
}
