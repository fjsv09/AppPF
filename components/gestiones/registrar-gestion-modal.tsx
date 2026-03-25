"use client"

import { useState, useTransition, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { 
    Phone, MessageSquare, MapPin, Navigation, Navigation2, 
    Loader2, AlertTriangle, X, Send, ClipboardList 
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Button as UIButton } from "@/components/ui/button"

const TIPO_GESTION_OPCIONES = ['Llamada', 'WhatsApp', 'Visita'] as const
type TipoGestion = typeof TIPO_GESTION_OPCIONES[number]

const RESULTADO_OPCIONES: Record<TipoGestion, string[]> = {
    Llamada: ['Promesa de Pago', 'No Contesta', 'Mensaje Dejado', 'Pagó', 'Negativa de Pago'],
    Visita: ['Contacto Exitoso', 'No Ubicado', 'Promesa de Pago', 'Negativa de Pago'],
    WhatsApp: ['Mensaje Enviado', 'Visto sin Respuesta', 'Promesa de Pago', 'No Entregado'],
}

const TIPO_ICON: Record<string, any> = {
    Llamada: Phone,
    Visita: MapPin,
    WhatsApp: MessageSquare,
}

interface RegistrarGestionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prestamoId: string
    prestamos?: any[] // New: optional list for selector
    clienteNombre?: string
    clienteTelefono?: string
    onSuccess?: (nueva: any) => void
}

export function RegistrarGestionModal({
    open,
    onOpenChange,
    prestamoId: defaultPrestamoId,
    prestamos = [],
    clienteNombre = 'Cliente',
    clienteTelefono,
    onSuccess
}: RegistrarGestionModalProps) {
    const [isPending, startTransition] = useTransition()
    
    // Form state
    const [selectedPrestamoId, setSelectedPrestamoId] = useState(defaultPrestamoId)
    const [tipoGestion, setTipoGestion] = useState<TipoGestion>('Llamada')
    const [resultado, setResultado] = useState(RESULTADO_OPCIONES['Llamada'][0])
    const [notas, setNotas] = useState('')
    
    // GPS state
    const [coordenadas, setCoordenadas] = useState<string | null>(null)
    const [gpsLoading, setGpsLoading] = useState(false)
    const [gpsError, setGpsError] = useState<string | null>(null)

    // Reset when open/close or default changes
    useEffect(() => {
        if (open) {
            setSelectedPrestamoId(defaultPrestamoId)
            setTipoGestion('Llamada')
            setResultado(RESULTADO_OPCIONES['Llamada'][0])
            setNotas('')
            setCoordenadas(null)
            setGpsError(null)
        }
    }, [open, defaultPrestamoId])

    const handleChangeTipo = (tipo: TipoGestion) => {
        setTipoGestion(tipo)
        setResultado(RESULTADO_OPCIONES[tipo][0])
        if (tipo !== 'Visita') {
            setCoordenadas(null)
            setGpsError(null)
        }
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
                setGpsLoading(true) // Actually we reset it later? In ClientGestiones it was setGpsLoading(false)
                setGpsLoading(false)
                toast.success('Ubicación capturada correctly')
            },
            (err) => {
                setGpsError('No se pudo obtener la ubicación. Verifica los permisos.')
                setGpsLoading(false)
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    async function handleGuardar() {
        if (!resultado) return
        if (tipoGestion === 'Visita' && !coordenadas) {
            toast.error('Captura tu ubicación GPS antes de registrar una visita')
            return
        }

        startTransition(async () => {
            const res = await fetch('/api/gestiones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prestamo_id: selectedPrestamoId,
                    tipo_gestion: tipoGestion,
                    resultado,
                    notas,
                    coordenadas
                })
            })

            if (res.ok) {
                const nueva = await res.json()
                onSuccess?.(nueva)
                onOpenChange(false)
                toast.success('Gestión registrada correctamente')
            } else {
                const err = await res.json()
                toast.error(err.error || 'Error al guardar la gestión')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-md p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 py-5 border-b border-slate-800 bg-slate-900/50">
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        Registrar Gestión
                    </DialogTitle>
                    <p className="text-xs text-slate-500 mt-1 pl-9 truncate">
                        Cliente: <span className="text-slate-300">{clienteNombre}</span>
                    </p>
                </DialogHeader>

                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                    {/* Loan Selector (if multiple relevant) */}
                    {(() => {
                        const relevantLoans = prestamos.filter(l => 
                            l.estado === 'activo' || 
                            (['vencido', 'moroso', 'cpp'].includes(l.estado_mora?.toLowerCase()) && 
                             l.estado !== 'refinanciado' && 
                             l.estado !== 'finalizado')
                        )
                        
                        if (relevantLoans.length <= 1) return null

                        return (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asociar a Préstamo</label>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {relevantLoans.map((loan) => (
                                    <button
                                        key={loan.id}
                                        type="button"
                                        onClick={() => setSelectedPrestamoId(loan.id)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg border text-[11px] transition-all flex items-center justify-between",
                                            selectedPrestamoId === loan.id
                                                ? "bg-blue-600/20 border-blue-500/40 text-blue-200 font-medium"
                                                : "bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                        )}
                                    >
                                        <span>${loan.monto} ({loan.estado})</span>
                                        {loan.estado_mora && <span className="uppercase text-[9px] px-1.5 rounded bg-slate-800">{loan.estado_mora}</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )
                    })()}

                    {/* Tipo / Vía */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vía de Contacto</label>
                        <div className="grid grid-cols-3 gap-2">
                            {TIPO_GESTION_OPCIONES.map((tipo) => {
                                const TIcon = TIPO_ICON[tipo]
                                const isActive = tipoGestion === tipo
                                return (
                                    <button
                                        key={tipo}
                                        type="button"
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

                    {/* Acciones Directas */}
                    {(tipoGestion === 'Llamada' || tipoGestion === 'WhatsApp') && clienteTelefono && (
                        <div className="space-y-2 animate-in slide-in-from-top duration-300">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                {tipoGestion === 'Llamada' ? <Phone className="w-3 h-3 text-blue-400" /> : <MessageSquare className="w-3 h-3 text-emerald-400" />}
                                Acción Directa
                            </label>
                            
                            {tipoGestion === 'Llamada' ? (
                                <UIButton
                                    asChild
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white h-11 gap-2 text-sm font-semibold shadow-lg shadow-blue-900/40"
                                >
                                    <a href={`tel:${clienteTelefono}`}>
                                        <Phone className="w-4 h-4" />
                                        Llamar al Cliente
                                    </a>
                                </UIButton>
                            ) : (
                                <UIButton
                                    asChild
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 gap-2 text-sm font-semibold shadow-lg shadow-emerald-900/40"
                                >
                                    <a 
                                        href={`https://wa.me/${clienteTelefono.replace(/\D/g, '') || ''}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        Enviar WhatsApp
                                    </a>
                                </UIButton>
                            )}
                            <p className="text-[10px] text-slate-600 text-center">
                                {tipoGestion === 'Llamada' ? 'Al terminar la llamada, registra el resultado abajo' : 'Al enviar el mensaje, registra el resultado abajo'}
                            </p>
                        </div>
                    )}

                    {/* GPS Verification for Visits */}
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
                                    <button type="button" onClick={() => setCoordenadas(null)} className="text-slate-500 hover:text-slate-300">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <UIButton
                                        type="button"
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
                                    </UIButton>
                                    {gpsError && (
                                        <p className="text-xs text-red-400 flex items-start gap-1.5 p-2 bg-red-950/20 rounded-lg border border-red-900/30">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            {gpsError}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Resultado Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resultado de la Gestión</label>
                        <div className="grid grid-cols-1 gap-1.5">
                            {RESULTADO_OPCIONES[tipoGestion].map((res) => (
                                <button
                                    key={res}
                                    type="button"
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
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notas <span className="text-slate-600 normal-case font-normal">(opcional)</span></label>
                        <textarea
                            value={notas}
                            onChange={e => setNotas(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-xl p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                            placeholder="Ej: Hablé con el titular..."
                        />
                    </div>
                </div>

                <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-slate-900">
                    <UIButton
                        variant="outline"
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="flex-1 bg-transparent border-slate-700 text-slate-400"
                    >
                        <X className="w-3.5 h-3.5 mr-2" />
                        Cancelar
                    </UIButton>
                    <UIButton
                        type="button"
                        onClick={handleGuardar}
                        disabled={isPending || !resultado || (tipoGestion === 'Visita' && !coordenadas)}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                    >
                        {isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        ) : (
                            <Send className="w-3.5 h-3.5 mr-2" />
                        )}
                        Guardar Gestión
                    </UIButton>
                </div>
            </DialogContent>
        </Dialog>
    )
}
