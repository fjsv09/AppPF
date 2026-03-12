"use client"

import { useState, useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClipboardList, User, MapPin, Loader2, X, Send, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Perfil {
    id: string
    nombre_completo: string
    rol: string
}

interface AsignarVisitaModalProps {
    prestamoId: string
    clienteNombre: string
    open: boolean
    onClose: () => void
    onAsignada: (tarea: any) => void
}

export function AsignarVisitaModal({ prestamoId, clienteNombre, open, onClose, onAsignada }: AsignarVisitaModalProps) {
    const [perfiles, setPerfiles] = useState<Perfil[]>([])
    const [asignadoA, setAsignadoA] = useState('')
    const [instrucciones, setInstrucciones] = useState('')
    const [loadingPerfiles, setLoadingPerfiles] = useState(true)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (!open) return
        async function fetchPerfiles() {
            setLoadingPerfiles(true)
            const res = await fetch(`/api/gestiones/asignables?prestamo_id=${prestamoId}`)
            if (res.ok) {
                const data = await res.json()
                setPerfiles(data)
                if (data.length > 0) setAsignadoA(data[0].id)
            }
            setLoadingPerfiles(false)
        }
        fetchPerfiles()
    }, [open])

    function handleClose() {
        setAsignadoA('')
        setInstrucciones('')
        onClose()
    }

    async function handleAsignar() {
        if (!asignadoA) return
        startTransition(async () => {
            const res = await fetch('/api/gestiones/asignar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prestamo_id: prestamoId,
                    asignado_a: asignadoA,
                    instrucciones
                })
            })

            if (res.ok) {
                const data = await res.json()
                onAsignada(data)
                handleClose()
                toast.success('Tarea de gestión asignada correctamente')
            } else {
                const err = await res.json()
                toast.error(err.error || 'Error al asignar la tarea')
            }
        })
    }

    const perfilSeleccionado = perfiles.find(p => p.id === asignadoA)

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-md p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 py-5 border-b border-slate-800 bg-slate-900/50">
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <div className="w-7 h-7 rounded-lg bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
                            <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        Asignar Gestión
                    </DialogTitle>
                    <p className="text-xs text-slate-500 mt-1 pl-9">Cliente: <span className="text-slate-300">{clienteNombre}</span></p>
                </DialogHeader>

                <div className="p-6 space-y-5">
                    {/* Info */}
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-950/20 border border-blue-900/30">
                        <ClipboardList className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-300/80 leading-relaxed">
                            Asigna una tarea de seguimiento. El asesor/supervisor podrá completarla mediante <strong>Llamada, WhatsApp o Visita</strong>. Si elige Visita, se requerirá GPS.
                        </p>
                    </div>

                    {/* Asignar a */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            Asignar a
                        </label>
                        {loadingPerfiles ? (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                <span className="text-sm text-slate-500">Cargando personal...</span>
                            </div>
                        ) : perfiles.length === 0 ? (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                                <AlertCircle className="w-4 h-4 text-slate-500" />
                                <span className="text-sm text-slate-500">No hay asesores o supervisores disponibles</span>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {perfiles.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setAsignadoA(p.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
                                            asignadoA === p.id
                                                ? "bg-blue-600/20 border-blue-500/40"
                                                : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                                            p.rol === 'supervisor' ? "bg-purple-900/50 text-purple-300" : "bg-blue-900/50 text-blue-300"
                                        )}>
                                            {p.nombre_completo.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className={cn("text-sm font-medium", asignadoA === p.id ? "text-blue-200" : "text-slate-300")}>
                                                {p.nombre_completo}
                                            </p>
                                            <p className="text-[10px] text-slate-500 capitalize">{p.rol}</p>
                                        </div>
                                        {asignadoA === p.id && (
                                            <div className="ml-auto w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Instrucciones */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Instrucciones <span className="text-slate-600 normal-case font-normal">(opcional)</span>
                        </label>
                        <textarea
                            value={instrucciones}
                            onChange={e => setInstrucciones(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-xl p-3 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder:text-slate-600"
                            placeholder="Ej: Cobrar cuota vencida, verificar local moroso..."
                        />
                    </div>
                </div>

                <div className="px-6 pb-6 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        className="flex-1 bg-transparent border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <X className="w-3.5 h-3.5 mr-2" />
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleAsignar}
                        disabled={isPending || !asignadoA}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
                    >
                        {isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                        ) : (
                            <Send className="w-3.5 h-3.5 mr-2" />
                        )}
                        Asignar Gestión
                    </Button>

                </div>
            </DialogContent>
        </Dialog>
    )
}
