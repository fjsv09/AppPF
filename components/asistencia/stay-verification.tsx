'use client'

import { useState, useEffect, useCallback } from 'react'
import { MapPin, Clock, Loader2, AlertCircle, CheckCircle2, ChevronUp, ChevronDown, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface StayStatus {
    estado: 'pendiente' | 'cumplido' | 'incumplido'
    inicio: string
    restante: number // minutos
    minutos_permanencia: number
}

export function StayVerification() {
    const [status, setStatus] = useState<StayStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [verifying, setVerifying] = useState(false)
    const [lastPosition, setLastPosition] = useState<{ lat: number, lon: number } | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const [lastPingTime, setLastPingTime] = useState<number>(0)

    const checkStatus = useCallback(async (isInitial = false) => {
        try {
            const res = await fetch('/api/asistencia')
            const data = await res.json()

            if (data.record?.permanencia_entrada_estado === 'pendiente') {
                const inicio = new Date(data.record.permanencia_entrada_inicio)
                const ahora = new Date()
                const minsPermanencia = data.config?.minutos_permanencia || 15
                const transcurrido = Math.floor((ahora.getTime() - inicio.getTime()) / 60000)
                const restante = Math.max(0, minsPermanencia - transcurrido)

                setStatus({
                    estado: 'pendiente',
                    inicio: data.record.permanencia_entrada_inicio,
                    restante,
                    minutos_permanencia: minsPermanencia
                })

                if (isInitial && restante > 0) {
                    toast.info('Permanencia activa', {
                        description: `Faltan ${restante} min. para completar tu registro.`,
                        duration: 3000
                    })
                }
            } else {
                setStatus(null)
            }
        } catch (error) {
            console.error('[STAY_STATUS_CHECK]', error)
        } finally {
            setLoading(false)
        }
    }, [])

    const sendPing = useCallback(async (lat: number, lon: number) => {
        setVerifying(true)
        setLastPingTime(Date.now())
        try {
            const res = await fetch('/api/asistencia/permanencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lon })
            })

            const data = await res.json()

            if (data.estado === 'cumplido') {
                toast.success('¡Permanencia cumplida!', {
                    description: 'Registro de entrada finalizado exitosamente.',
                    duration: 5000
                })
                setStatus(null)
            } else if (data.estado === 'incumplido') {
                toast.error('Permanencia incumplida', {
                    description: 'Has salido del rango de la oficina.',
                    duration: 5000
                })
                setStatus(null)
            } else {
                // Sigue pendiente, actualizar tiempo restante
                if (status) {
                    const ahora = new Date()
                    const inicio = new Date(status.inicio)
                    const transcurrido = Math.floor((ahora.getTime() - inicio.getTime()) / 60000)
                    const restante = Math.max(0, status.minutos_permanencia - transcurrido)
                    setStatus(prev => prev ? { ...prev, restante } : null)
                }
            }
        } catch (error) {
            console.error('[STAY_PING_ERROR]', error)
            toast.error('Error de red', { description: 'No se pudo verificar tu ubicación.' })
        } finally {
            setVerifying(false)
        }
    }, [status])

    const requestLocationAndPing = useCallback(() => {
        if (!navigator.geolocation) return

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords
                setLastPosition({ lat: latitude, lon: longitude })
                sendPing(latitude, longitude)
            },
            (error) => {
                console.error('[GEO_ERROR]', error)
                toast.error('Error de GPS', {
                    description: 'No se pudo obtener tu ubicación.'
                })
            },
            { enableHighAccuracy: true }
        )
    }, [sendPing])

    useEffect(() => {
        checkStatus(true)
    }, [checkStatus])

    // Intervalo de actualización de tiempo (cada 10 segundos para mayor fluidez)
    useEffect(() => {
        if (!status || status.estado !== 'pendiente') return

        const updateTimer = () => {
            const ahora = new Date()
            const inicio = new Date(status.inicio)
            const transcurrido = Math.floor((ahora.getTime() - inicio.getTime()) / 60000)
            const restante = Math.max(0, status.minutos_permanencia - transcurrido)
            
            if (restante !== status.restante) {
                setStatus(prev => prev ? { ...prev, restante } : null)
            }

            // Si llegamos a 0, intentar ping cada 30 segundos hasta que se complete
            if (restante === 0 && !verifying) {
                const timeSinceLastPing = Date.now() - lastPingTime
                if (timeSinceLastPing > 30000 || lastPingTime === 0) {
                    requestLocationAndPing()
                }
            }
        }

        const interval = setInterval(updateTimer, 10000)
        return () => clearInterval(interval)
    }, [status, verifying, lastPingTime, requestLocationAndPing])

    // Intervalo de pings de seguridad (cada 5 minutos)
    useEffect(() => {
        if (!status || status.estado !== 'pendiente' || status.restante === 0) return

        const interval = setInterval(() => {
            requestLocationAndPing()
        }, 300000)

        return () => clearInterval(interval)
    }, [status, requestLocationAndPing])

    if (loading || !status) return null

    const isComplete = status.restante <= 0

    return (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-8 md:left-[280px] left-4 z-[100] flex flex-col items-start gap-3 pointer-events-none transition-all duration-500">
            {/* Expanded Content */}
            {isExpanded && (
                <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-xl border border-blue-500/30 rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-72 animate-in zoom-in-95 slide-in-from-bottom-10 fade-in duration-300 origin-bottom-left">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">
                                Verificando Permanencia
                            </h3>
                            <p className="text-xs text-slate-400 leading-tight">
                                Debes permanecer en el rango para validar tu entrada.
                            </p>
                        </div>
                        <button 
                            onClick={() => setIsExpanded(false)}
                            className="p-1 hover:bg-slate-800 rounded-full transition-colors"
                        >
                            <ChevronDown className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>

                    <div className="bg-slate-800/50 rounded-2xl p-4 mb-4 border border-slate-700/50">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center border-2",
                                isComplete ? "bg-emerald-500/10 border-emerald-500/50" : "bg-blue-500/10 border-blue-500/50"
                            )}>
                                {verifying ? (
                                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                ) : isComplete ? (
                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                ) : (
                                    <Clock className="w-6 h-6 text-blue-400" />
                                )}
                            </div>
                            <div>
                                <p className={cn(
                                    "text-xl font-black tabular-nums tracking-tight",
                                    isComplete ? "text-emerald-400" : "text-white"
                                )}>
                                    {isComplete ? '¡Completado!' : `${status.restante} min`}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">
                                    {isComplete ? 'Verificando finalización...' : 'Restantes'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-800/30 rounded-xl p-2 border border-slate-700/30">
                            <p className="text-[8px] text-slate-500 uppercase font-black mb-1">GPS</p>
                            <div className="flex items-center gap-1.5">
                                <MapPin className={cn("w-3 h-3", lastPosition ? "text-emerald-400" : "text-amber-400")} />
                                <span className="text-[10px] text-slate-300 font-medium">
                                    {lastPosition ? 'Activo' : 'Buscando...'}
                                </span>
                            </div>
                        </div>
                        <div className="bg-slate-800/30 rounded-xl p-2 border border-slate-700/30">
                            <p className="text-[8px] text-slate-500 uppercase font-black mb-1">Inicio</p>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className="text-[10px] text-slate-300 font-medium">
                                    {new Date(status.inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={requestLocationAndPing}
                        disabled={verifying}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                    >
                        {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                        Verificar Ubicación Ahora
                    </button>

                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <p className="text-[9px] text-amber-500/80 leading-relaxed italic">
                            ⚠️ Si sales del rango antes de completar el tiempo, la asistencia será anulada.
                        </p>
                    </div>
                </div>
            )}

            {/* Circular Trigger Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="pointer-events-auto relative group"
            >
                {/* Ring Indicator */}
                <div className={cn(
                    "absolute -inset-1 rounded-full blur-md opacity-40 transition-all duration-500 group-hover:opacity-70",
                    isComplete ? "bg-emerald-500 animate-pulse" : "bg-blue-500"
                )} />
                
                <div className={cn(
                    "relative w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 border-2 active:scale-95",
                    isExpanded 
                        ? "bg-slate-800 border-slate-700 scale-90 opacity-0" 
                        : isComplete
                            ? "bg-emerald-950 border-emerald-500/50"
                            : "bg-slate-900 border-blue-500/50"
                )}>
                    {verifying ? (
                        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    ) : isComplete ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                    ) : (
                        <>
                            <span className="text-[14px] font-black text-white leading-none mb-0.5">
                                {status.restante}
                            </span>
                            <span className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter leading-none">
                                min
                            </span>
                        </>
                    )}

                    {/* Notification Badge if not expanded */}
                    {!isExpanded && !isComplete && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg">
                            <Clock className="w-2.5 h-2.5 text-white" />
                        </div>
                    )}
                </div>
                
                {/* Tooltip on hover */}
                {!isExpanded && (
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded-lg border border-slate-800 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl">
                        {isComplete ? 'Verificando...' : 'Permanencia en curso'}
                    </div>
                )}
            </button>
        </div>
    )
}

