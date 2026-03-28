'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, MapPin, Clock, Save, X } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from '@/lib/utils'

interface VisitActionButtonProps {
    cuotaId: string
    variant?: 'default' | 'outline' | 'ghost' | 'icon'
    className?: string
    showText?: boolean
    disabled?: boolean
}

export function VisitActionButton({ 
    cuotaId, 
    variant = 'outline', 
    className,
    showText = true,
    disabled = false
}: VisitActionButtonProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [visitaEnCurso, setVisitaEnCurso] = useState<any>(null)
    const [timer, setTimer] = useState(0)
    const [minTime, setMinTime] = useState(5) // Default 5 mins
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const router = useRouter()

    useEffect(() => {
        // Cargar config minTime
        fetch('/api/configuracion?clave=visita_tiempo_minimo')
            .then(res => res.json())
            .then(data => setMinTime(parseInt(data.valor) || 5))
            .catch(() => setMinTime(5))

        // Revisar si hay visita en el localstorage para esta cuota específica
        const saved = localStorage.getItem(`visita_${cuotaId}`)
        if (saved) {
            const data = JSON.parse(saved)
            setVisitaEnCurso(data)
            setOpen(true)
            const elapsed = Math.floor((Date.now() - new Date(data.fecha_inicio).getTime()) / 1000)
            setTimer(elapsed > 0 ? elapsed : 0)
        }
    }, [cuotaId])

    useEffect(() => {
        if (visitaEnCurso && open) {
            const start = new Date(visitaEnCurso.fecha_inicio).getTime();
            timerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - start) / 1000);
                setTimer(elapsed > 0 ? elapsed : 0);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [visitaEnCurso, open]);

    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

    const handleStart = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }
        
        setLoading(true)
        if (!navigator.geolocation) {
            toast.error('Tu dispositivo no soporta GPS')
            setLoading(false)
            return
        }

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords
            try {
                const res = await fetch('/api/visitas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        cuota_id: cuotaId, 
                        lat: latitude, 
                        lon: longitude 
                    })
                })
                const data = await res.json()
                if (!res.ok) {
                    if (data.error?.includes('visitas_terreno')) {
                        throw new Error('Error de sistema: La tabla de visitas no ha sido reconocida todavía por la base de datos. Por favor, contacta al administrador para recargar el esquema.')
                    }
                    throw new Error(data.error)
                }
                
                setVisitaEnCurso(data)
                localStorage.setItem(`visita_${cuotaId}`, JSON.stringify(data))
                setTimer(0)
                setOpen(true)
                setConfirmDialogOpen(false)
                toast.success('Visita Iniciada 📍')
            } catch (err: any) {
                toast.error(err.message)
            } finally {
                setLoading(false)
            }
        }, (err) => {
            console.error("GPS Error:", err)
            const msg = err.code === 3 ? "Tiempo agotado al capturar GPS (10s). Reintenta." : "Error al capturar GPS. Verifica permisos."
            toast.error(msg)
            setLoading(false)
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
    }

    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

    const handleCancel = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }

        setLoading(true)
        try {
            const res = await fetch(`/api/visitas/${visitaEnCurso.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    estado: 'cancelada'
                })
            })
            if (!res.ok) throw new Error('Error al cancelar')

            setVisitaEnCurso(null)
            localStorage.removeItem(`visita_${cuotaId}`)
            setOpen(false)
            setCancelDialogOpen(false)
            toast.info('Registro de visita cancelado')
            router.refresh()
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleEnd = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }

        setLoading(true)
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords
            try {
                const res = await fetch(`/api/visitas/${visitaEnCurso.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        lat: latitude, 
                        lon: longitude,
                        notas: '' 
                    })
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)

                toast.success(data.cumple_minimo ? 'Visita completada ✓' : 'Visita finalizada (No cumplió tiempo mínimo)')
                setVisitaEnCurso(null)
                localStorage.removeItem(`visita_${cuotaId}`)
                setOpen(false)
                router.refresh()
            } catch (err: any) {
                toast.error(err.message)
            } finally {
                setLoading(false)
            }
        }, (err) => {
            console.error("GPS End Error:", err)
            const msg = err.code === 3 ? "Tiempo agotado al capturar GPS final (10s). Reintenta." : "Error al capturar GPS final"
            toast.error(msg)
            setLoading(false)
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const isTimeMet = timer >= minTime * 60

    if (!visitaEnCurso) {
        const triggerButton = variant === 'icon' ? (
            <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDialogOpen(true); }}
                disabled={loading}
                className={cn("h-8 w-8 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-indigo-400 hover:bg-indigo-900/40", className)}
                title="Iniciar Visita"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            </Button>
        ) : (
            <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDialogOpen(true); }}
                disabled={loading || disabled}
                className={cn("h-7 px-3 text-[10px] md:text-xs rounded-lg border-indigo-500 text-indigo-400 hover:bg-indigo-950 font-bold", className)}
            >
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <MapPin className="w-3 h-3 mr-1" />}
                {showText && "Iniciar Visita"}
            </Button>
        )

        return (
            <>
                {triggerButton}
                <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                    <AlertDialogContent className="bg-slate-950 border-slate-800 text-white" onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-indigo-400" />
                                ¿Desea iniciar la visita ahora?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400">
                                Grabaremos tu ubicación GPS actual y se requiere una permanencia mínima de {minTime} minutos para validar el registro.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDialogOpen(false); }} className="bg-slate-900 border-slate-800 text-slate-400">
                                Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStart(); }}
                                className="bg-indigo-600 hover:bg-indigo-500 font-bold"
                            >
                                Sí, Iniciar Visita
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        )
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
                className={cn(
                    "rounded-lg font-bold animate-pulse h-8 w-auto px-2 min-w-[32px]",
                    "border-emerald-500 text-emerald-400 bg-emerald-950/30 hover:bg-emerald-900/40",
                    className
                )}
            >
                <Clock className={cn("w-3.5 h-3.5 mr-1.5")} />
                <span className="text-[10px] whitespace-nowrap">{formatTime(timer)}</span>
            </Button>

            <Dialog open={open} onOpenChange={(val) => { if (!val) setOpen(false) }}>
                <DialogContent className="bg-slate-950 border-slate-800 text-white" onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-indigo-400" />
                            Visita en Terreno
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Debes permanecer al menos {minTime} minutos en la ubicación.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-8 flex flex-col items-center justify-center space-y-4">
                        <div className={`text-6xl font-mono font-bold ${isTimeMet ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {formatTime(timer)}
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800">
                            <Clock className="w-4 h-4 text-slate-500" />
                            <span className="text-sm text-slate-300">Tiempo requerido: {minTime}:00</span>
                        </div>
                        {!isTimeMet && (
                            <p className="text-[10px] text-amber-500/70 uppercase font-black animate-pulse">
                                Esperando cumplimiento de tiempo mínimo...
                            </p>
                        )}
                        {isTimeMet && (
                            <p className="text-[10px] text-emerald-500 uppercase font-black">
                                ✓ Tiempo mínimo completado
                            </p>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }} className="bg-slate-900 border-slate-800 text-slate-400">
                            Minimizar
                        </Button>
                        {!isTimeMet && (
                             <Button variant="ghost" onClick={() => setCancelDialogOpen(true)} className="text-rose-500 hover:text-rose-400 hover:bg-rose-900/20 text-xs">
                                 Cancelar Visita
                             </Button>
                        )}
                        {isTimeMet && !visitaEnCurso.en_radio_cliente && (
                            <Button variant="ghost" onClick={() => setCancelDialogOpen(true)} className="text-amber-500 hover:text-amber-400 hover:bg-amber-900/20 text-xs">
                                Reiniciar (Fuera de Rango)
                            </Button>
                        )}
                        <Button
                            onClick={handleEnd}
                            disabled={!isTimeMet || loading}
                            className={`font-bold ${isTimeMet ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20' : 'bg-slate-800 opacity-50'}`}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Finalizar Visita
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <AlertDialogContent className="bg-slate-950 border-slate-800 text-white" onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <X className="w-5 h-5 text-rose-500" />
                            ¿Cancelar registro de visita?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            Esta acción anulará el registro actual y se perderá el tiempo acumulado ({formatTime(timer)}). 
                            Deberás iniciar una nueva visita si deseas registrarla posteriormente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setCancelDialogOpen(false)} className="bg-slate-900 border-slate-800 text-slate-400">
                            Volver
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleCancel}
                            disabled={loading}
                            className="bg-rose-600 hover:bg-rose-500 font-bold"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Sí, Cancelar Registro"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
