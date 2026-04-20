'use client'

import { useState, useEffect, useCallback } from 'react'
import { MapPin, Clock, AlertTriangle, CheckCircle2, Loader2, Navigation, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface AttendanceConfig {
    radio_metros: number
    descuento_por_minuto: number
    hora_limite: string
    hora_fin_1: string
    hora_cierre: string
    tolerancia: number
    oficina_lat: number
    oficina_lon: number
}

interface AttendanceRecord {
    id: string
    hora_entrada?: string
    hora_turno_tarde?: string
    hora_cierre?: string
    estado: string
    minutos_tardanza: number
    descuento_tardanza: number
    distancia_oficina: number
}

interface AttendanceGateProps {
    children: React.ReactNode
    userRole: string
    initialData?: {
        required: boolean
        marked: boolean
        event: 'entrada' | 'fin_turno_1' | 'cierre' | string
        config: any
    }
}

export function AttendanceGate({ children, userRole, initialData }: AttendanceGateProps) {
    const [checking, setChecking] = useState(!initialData)
    const [isMarked, setIsMarked] = useState(initialData?.marked ?? false)
    const [required, setRequired] = useState(initialData?.required ?? true)
    const [currentEvent, setCurrentEvent] = useState<'entrada' | 'fin_turno_1' | 'cierre'>(
        (initialData?.event as any) || 'entrada'
    )
    const [config, setConfig] = useState<AttendanceConfig | null>(initialData?.config || null)
    const [record, setRecord] = useState<AttendanceRecord | null>(null)

    // GPS state
    const [gpsLoading, setGpsLoading] = useState(false)
    const [gpsError, setGpsError] = useState<string | null>(null)
    const [currentLat, setCurrentLat] = useState<number | null>(null)
    const [currentLon, setCurrentLon] = useState<number | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [successRecord, setSuccessRecord] = useState<any>(null)

    // Check attendance status on mount
    useEffect(() => {
        // We only do the background sync, the initial state is already set by the server
        checkAttendance()
    }, [])

    const checkAttendance = async () => {
        try {
            const res = await fetch('/api/asistencia')
            const data = await res.json()

            // Update cache (for when clicking refresh manually via browser)
            const today = new Date().toLocaleDateString('sv-SE')
            sessionStorage.setItem('attendance_status', JSON.stringify({
                date: today,
                marked: data.marked,
                required: data.required,
                event: data.event,
                config: data.config
            }))

            setRequired(data.required)
            setIsMarked(data.marked)
            setCurrentEvent(data.event || 'entrada')
            setConfig(data.config || null)
            setRecord(data.record || null)
        } catch (error) {
            console.error('[ATTENDANCE CHECK]', error)
            // If check fails, let user through (fail-open for UX)
            setRequired(false)
            setIsMarked(true)
        } finally {
            setChecking(false)
        }
    }

    const requestGPS = useCallback(() => {
        setGpsLoading(true)
        setGpsError(null)

        if (!navigator.geolocation) {
            setGpsError('Tu navegador no soporta la geolocalización')
            setGpsLoading(false)
            return
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCurrentLat(position.coords.latitude)
                setCurrentLon(position.coords.longitude)
                setGpsLoading(false)
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        setGpsError('Debes permitir el acceso a tu ubicación para marcar asistencia')
                        break
                    case error.POSITION_UNAVAILABLE:
                        setGpsError('No se puede obtener tu ubicación. Verifica tu GPS.')
                        break
                    case error.TIMEOUT:
                        setGpsError('Tiempo de espera agotado. Intenta de nuevo.')
                        break
                    default:
                        setGpsError('Error desconocido de geolocalización')
                }
                setGpsLoading(false)
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        )
    }, [])

    const submitAttendance = async () => {
        if (currentLat === null || currentLon === null) {
            toast.error('Primero obtén tu ubicación GPS')
            return
        }

        setSubmitting(true)

        try {
            const res = await fetch('/api/asistencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: currentLat, lon: currentLon })
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error('Error al marcar asistencia', { description: data.error })
                return
            }

            setSuccessRecord(data.record)

            // Update cache immediately on success
            const today = new Date().toLocaleDateString('sv-SE')
            sessionStorage.setItem('attendance_status', JSON.stringify({
                date: today,
                marked: true,
                required: true,
                event: currentEvent
            }))

            if (data.record?.permanencia_entrada_estado === 'pendiente') {
                toast.info('⏳ Verificación de permanencia iniciada', {
                    description: 'Debes permanecer en la oficina durante 15 minutos.',
                    duration: 5000
                })
            } else if (data.record?.estado === 'puntual') {
                toast.success('¡Llegaste puntual! 🎉', {
                    description: data.message,
                    duration: 4000
                })
            } else {
                toast.warning('Tardanza registrada', {
                    description: data.message,
                    duration: 5000
                })
            }

            // Wait a moment then unlock
            setTimeout(() => {
                setIsMarked(true)
            }, 2000)
        } catch (error: any) {
            toast.error('Error de conexión', { description: error.message })
        } finally {
            setSubmitting(false)
        }
    }

    // Show loading state
    if (checking) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
                    <p className="text-sm text-slate-500">Verificando asistencia...</p>
                </div>
            </div>
        )
    }

    // If not required or already marked, render children directly
    if (!required || isMarked) {
        return <>{children}</>
    }

    // Show attendance gate
    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
            </div>

            <div className="relative z-10 w-full max-w-md">
                <div className="backdrop-blur-xl bg-slate-900/80 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                    {/* Header gradient */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500" />

                    <div className="p-6 md:p-8">
                        {/* Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/20 flex items-center justify-center">
                                    <Shield className="w-10 h-10 text-blue-400" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center animate-bounce">
                                    <Clock className="w-3 h-3 text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Title */}
                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-bold text-white mb-2">
                                {currentEvent === 'entrada' ? 'Registro de Entrada' : 
                                 currentEvent === 'fin_turno_1' ? 'Inicio Turno Tarde' : 
                                 'Cierre Final del Día'}
                            </h2>
                            <div className="text-sm text-slate-400 px-4">
                                {currentEvent === 'entrada' 
                                    ? 'Debes marcar tu asistencia para acceder al sistema.'
                                    : `Es hora de registrar tu ${currentEvent === 'fin_turno_1' ? 'inicio del turno tarde' : 'cierre de jornada'} desde la oficina.`
                                }
                                {config && currentEvent === 'entrada' && (
                                    <div className="mt-4 space-y-3">
                                        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-2.5">
                                            <p className="text-slate-500 text-[10px] leading-relaxed">
                                                Hora puntual: {config.hora_limite} • Radio: {config.radio_metros}m
                                            </p>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-3 items-start text-left shadow-lg shadow-amber-900/10">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-amber-200/70 leading-relaxed">
                                                <strong className="text-amber-400 uppercase tracking-tighter">Advertencia:</strong> Si abandonas la oficina antes de los 15 minutos, el registro quedará como incumplido y no se registrará hora de entrada, debiendo marcar de nuevo.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Success state */}
                        {successRecord && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className={`p-4 rounded-2xl border ${
                                    successRecord.estado === 'puntual' || successRecord.permanencia_entrada_estado === 'pendiente'
                                        ? 'bg-emerald-500/10 border-emerald-500/20'
                                        : 'bg-amber-500/10 border-amber-500/20'
                                }`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        {successRecord.estado === 'puntual' || successRecord.permanencia_entrada_estado === 'pendiente' ? (
                                            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                        ) : (
                                            <AlertTriangle className="w-6 h-6 text-amber-400" />
                                        )}
                                        <div>
                                            <p className="font-bold text-white text-sm">
                                                {successRecord.permanencia_entrada_estado === 'pendiente' ? '¡Verificación Iniciada!' : 
                                                 (successRecord.estado === 'tardanza' ? 'Asistencia con Tardanza' : '¡Registro Exitoso!')}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {successRecord.permanencia_entrada_estado === 'pendiente' 
                                                    ? 'Permanece 15 min en el radio GPS' 
                                                    : `Hora: ${currentEvent === 'entrada' ? successRecord.hora_entrada : 
                                                       currentEvent === 'fin_turno_1' ? successRecord.hora_turno_tarde : 
                                                       successRecord.hora_cierre}`}
                                            </p>
                                        </div>
                                    </div>
                                    {successRecord.minutos_tardanza > 0 && currentEvent === 'entrada' && (
                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                            <div className="bg-slate-900/50 rounded-xl p-3 text-center">
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Tardanza</p>
                                                <p className="text-lg font-bold text-amber-400">{successRecord.minutos_tardanza} min</p>
                                            </div>
                                            <div className="bg-slate-900/50 rounded-xl p-3 text-center">
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Descuento</p>
                                                <p className="text-lg font-bold text-rose-400">S/ {successRecord.descuento_tardanza?.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Ingresando al sistema...
                                </div>
                            </div>
                        )}

                        {/* GPS and Submit */}
                        {!successRecord && (
                            <div className="space-y-4">
                                {/* GPS Status */}
                                <div className={`p-4 rounded-2xl border transition-all ${
                                    currentLat !== null
                                        ? 'bg-emerald-500/5 border-emerald-500/20'
                                        : 'bg-slate-800/30 border-slate-700/30'
                                }`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <MapPin className={`w-4 h-4 ${currentLat !== null ? 'text-emerald-400' : 'text-slate-500'}`} />
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ubicación GPS</span>
                                        </div>
                                        {currentLat !== null && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                                                OBTENIDA
                                            </span>
                                        )}
                                    </div>

                                    {currentLat !== null ? (
                                        <div className="flex items-center gap-2">
                                            <code className="text-xs text-slate-300 font-mono bg-slate-900/50 px-2 py-1 rounded">
                                                {currentLat.toFixed(6)}, {currentLon?.toFixed(6)}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[10px] text-blue-400 hover:text-blue-300"
                                                onClick={requestGPS}
                                            >
                                                Actualizar
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            onClick={requestGPS}
                                            disabled={gpsLoading}
                                            className="w-full h-11 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl font-bold text-sm transition-all"
                                        >
                                            {gpsLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Obteniendo GPS...
                                                </>
                                            ) : (
                                                <>
                                                    <Navigation className="w-4 h-4 mr-2" />
                                                    Obtener Mi Ubicación
                                                </>
                                            )}
                                        </Button>
                                    )}

                                    {gpsError && (
                                        <div className="mt-2 flex items-center gap-2 text-rose-400 text-xs">
                                            <AlertTriangle className="w-3 h-3" />
                                            {gpsError}
                                        </div>
                                    )}
                                </div>

                                {/* Submit button */}
                                <Button
                                    onClick={submitAttendance}
                                    disabled={submitting || currentLat === null}
                                    className="w-full h-12 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/30 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Iniciando Registro...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-5 h-5 mr-2" />
                                            Marcar Asistencia
                                        </>
                                    )}
                                </Button>

                                {/* Info box */}
                                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                    <p className="text-[10px] text-slate-500 leading-relaxed text-center px-4">
                                        📍 Debes estar dentro de <strong className="text-slate-300">{config?.radio_metros || 150}m</strong> de la oficina.
                                        {currentEvent === 'entrada' && (
                                            <> Tol: <strong className="text-slate-300">{config?.tolerancia || '15'}m</strong> después de las <strong className="text-slate-300">{config?.hora_limite || '08:00'}</strong>.</>
                                        )}
                                    </p>
                                </div>

                                {/* Admin skip option */}
                                {userRole === 'admin' && (
                                    <div className="pt-2">
                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                const today = new Date().toLocaleDateString('sv-SE')
                                                sessionStorage.setItem('attendance_status', JSON.stringify({
                                                    date: today,
                                                    marked: true,
                                                    required: false,
                                                    event: currentEvent
                                                }))
                                                setIsMarked(true)
                                            }}
                                            className="w-full h-10 text-slate-500 hover:text-slate-300 text-xs font-bold uppercase tracking-widest border border-slate-800/30 hover:bg-slate-800/50 rounded-xl"
                                        >
                                            Ingresar sin marcar (Administrador)
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
