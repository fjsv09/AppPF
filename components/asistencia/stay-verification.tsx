'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { MapPin, Clock, Loader2, Info } from 'lucide-react'
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
    const [isHovered, setIsHovered] = useState(false)

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

                if (isInitial) {
                    toast.info('Verificación de permanencia activa', {
                        description: `Debes permanecer en la oficina durante ${restante} minutos más.`,
                        duration: 5000
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
        try {
            const res = await fetch('/api/asistencia/permanencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lon })
            })

            const data = await res.json()

            if (data.estado === 'cumplido') {
                toast.success('¡Permanencia cumplida!', {
                    description: 'Has completado el tiempo mínimo de permanencia en la oficina.',
                    duration: 5000
                })
                setStatus(null)
            } else if (data.estado === 'incumplido') {
                toast.error('Permanencia incumplida', {
                    description: 'Se ha detectado que saliste del rango de la oficina antes de tiempo.',
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
                // Solo mostrar toast de error si no es un error de timeout recurrente
                if (error.code !== 3) {
                    toast.error('Error de GPS', {
                        description: 'No se pudo obtener tu ubicación para la verificación de permanencia.'
                    })
                }
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }, [sendPing])

    useEffect(() => {
        checkStatus(true)
    }, [checkStatus])

    // Intervalo de actualización de tiempo (cada 30 segundos para mayor precisión)
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

            // Si llegamos a 0 y no estamos verificando, forzar ping
            if (restante === 0 && !verifying) {
                requestLocationAndPing()
            }
        }

        const interval = setInterval(updateTimer, 30000)
        return () => clearInterval(interval)
    }, [status, verifying, requestLocationAndPing])

    // Intervalo de pings de seguridad 
    useEffect(() => {
        if (!status || status.estado !== 'pendiente') return

        // Si ya llegó a 0, ping cada 15 segundos para salir lo antes posible
        // Si no, cada 5 minutos
        const intervalTime = status.restante === 0 ? 15000 : 300000

        const interval = setInterval(() => {
            requestLocationAndPing()
        }, intervalTime)

        return () => clearInterval(interval)
    }, [status, requestLocationAndPing])

    const progress = useMemo(() => {
        if (!status) return 0
        const completed = status.minutos_permanencia - status.restante
        return Math.min(100, (completed / status.minutos_permanencia) * 100)
    }, [status])

    if (loading || !status) return null

    return (
        <div 
            className="fixed bottom-20 right-6 z-50 flex flex-col items-end gap-3"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Tooltip Detallado */}
            <div className={cn(
                "bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl transition-all duration-300 transform origin-bottom-right w-64",
                isHovered ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-4 pointer-events-none"
            )}>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                        Permanencia
                    </span>
                    <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", status.restante === 0 ? "bg-emerald-500 animate-pulse" : "bg-blue-500 animate-ping")} />
                        <span className="text-[10px] text-slate-400 font-bold uppercase">En Curso</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <div>
                        <p className="text-xs text-slate-400 mb-1">Tiempo Restante</p>
                        <p className={cn(
                            "text-xl font-bold leading-none",
                            status.restante === 0 ? "text-emerald-400" : "text-white"
                        )}>
                            {status.restante === 0 ? '¡Tiempo completado!' : `${status.restante} minutos`}
                        </p>
                        {status.restante === 0 && (
                            <p className="text-[10px] text-emerald-400/70 mt-1 animate-pulse">
                                Verificando ubicación final...
                            </p>
                        )}
                    </div>

                    <div className="pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Info className="w-3 h-3 text-amber-400" />
                            <p className="text-[10px] text-amber-200/80 font-medium leading-tight">
                                No cierres la app ni salgas de la oficina.
                            </p>
                        </div>
                        <p className="text-[9px] text-slate-500 leading-relaxed italic">
                            ⚠️ Si sales del rango, la asistencia no será registrada y deberás marcar de nuevo.
                        </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-[9px] text-slate-500 uppercase font-bold">GPS</span>
                        <span className={cn(
                            "text-[10px] font-mono",
                            lastPosition ? "text-emerald-400" : "text-amber-400"
                        )}>
                            {lastPosition ? 'SEÑAL ACTIVA' : 'BUSCANDO...'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Círculo Principal (FAB) */}
            <button 
                className={cn(
                    "group relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500",
                    "bg-slate-900 border border-white/10 shadow-[0_0_20px_rgba(0,0,0,0.4)]",
                    isHovered ? "scale-110 border-blue-500/50 ring-4 ring-blue-500/10" : "scale-100"
                )}
            >
                {/* Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                        cx="28"
                        cy="28"
                        r="25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-white/5"
                    />
                    <circle
                        cx="28"
                        cy="28"
                        r="25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={2 * Math.PI * 25}
                        strokeDashoffset={2 * Math.PI * 25 * (1 - progress / 100)}
                        strokeLinecap="round"
                        className={cn(
                            "transition-all duration-1000",
                            status.restante === 0 ? "text-emerald-500" : "text-blue-500"
                        )}
                    />
                </svg>

                {/* Content */}
                <div className="relative flex flex-col items-center justify-center">
                    {verifying ? (
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    ) : status.restante === 0 ? (
                        <MapPin className="w-5 h-5 text-emerald-400 animate-pulse" />
                    ) : (
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-white leading-none">
                                {status.restante}
                            </span>
                            <span className="text-[7px] text-blue-400 font-bold uppercase tracking-tighter">
                                MIN
                            </span>
                        </div>
                    )}
                </div>

                {/* Indicator dot */}
                <div className={cn(
                    "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors duration-500",
                    status.restante === 0 ? "bg-emerald-500" : "bg-blue-500"
                )} />
            </button>
        </div>
    )
}
