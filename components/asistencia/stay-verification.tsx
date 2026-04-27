'use client'

import { useState, useEffect, useCallback } from 'react'
import { MapPin, Clock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
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
                toast.error('Error de GPS', {
                    description: 'No se pudo obtener tu ubicación para la verificación de permanencia.'
                })
            },
            { enableHighAccuracy: true }
        )
    }, [sendPing])

    useEffect(() => {
        checkStatus(true)
    }, [checkStatus])

    // Intervalo de actualización de tiempo (cada 1 minuto)
    useEffect(() => {
        if (!status || status.estado !== 'pendiente') return

        const updateTimer = () => {
            const ahora = new Date()
            const inicio = new Date(status.inicio)
            const transcurrido = Math.floor((ahora.getTime() - inicio.getTime()) / 60000)
            const restante = Math.max(0, status.minutos_permanencia - transcurrido)
            
            if (restante !== status.restante) {
                setStatus(prev => prev ? { ...prev, restante } : null)
                
                // Si llegamos a 0 por primera vez, disparar ping inmediato
                if (restante === 0 && !verifying) {
                    requestLocationAndPing()
                }
            }
        }

        const interval = setInterval(updateTimer, 60000) // 1 minuto
        return () => clearInterval(interval)
    }, [status, verifying, requestLocationAndPing])

    // Intervalo de pings de seguridad (cada 5 minutos si no ha terminado)
    useEffect(() => {
        if (!status || status.estado !== 'pendiente' || status.restante === 0) return

        const interval = setInterval(() => {
            requestLocationAndPing()
        }, 300000) // 5 minutos

        return () => clearInterval(interval)
    }, [status, requestLocationAndPing])

    if (loading || !status) return null

    return (
        <div className="fixed bottom-24 right-4 z-50 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="backdrop-blur-md bg-slate-900/80 border border-blue-500/30 rounded-2xl p-4 shadow-2xl flex items-center gap-4 min-w-[240px]">
                <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                        {verifying ? (
                            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        ) : (
                            <MapPin className="w-5 h-5 text-blue-400 animate-pulse" />
                        )}
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center border-2 border-slate-900">
                        <Clock className="w-2 h-2 text-white" />
                    </div>
                </div>

                <div className="flex-1">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-0.5">
                        Verificando Permanencia
                    </p>
                    <div className="flex items-center gap-2">
                        <p className={cn(
                            "text-sm font-bold",
                            status.restante === 0 ? "text-emerald-400 animate-pulse" : "text-white"
                        )}>
                            {status.restante === 0 ? 'Verificando finalización...' : `${status.restante} minutos restantes`}
                        </p>
                        <span className={cn(
                            "flex h-1.5 w-1.5 rounded-full animate-ping",
                            status.restante === 0 ? "bg-emerald-400" : "bg-blue-500"
                        )} />
                    </div>
                </div>

                <div className="h-8 w-px bg-slate-800" />

                <div className="text-right">
                    <p className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">
                        Precisión GPS
                    </p>
                    <p className="text-[10px] text-slate-300 font-mono">
                        {lastPosition ? 'Activa' : 'Pendiente'}
                    </p>
                </div>
            </div>
            
            {/* Warning under the main box */}
            <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 max-w-[300px] shadow-lg animate-in slide-in-from-bottom-2 duration-700">
                <p className="text-[9px] text-amber-200/60 leading-tight">
                    ⚠️ <strong>Si sales del rango</strong>, la asistencia no será registrada y deberás marcar de nuevo.
                </p>
            </div>
        </div>
    )
}
