'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle, Lock, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ScoreIndicator, ScoreBreakdown, ScoreLimitRules } from '@/components/ui/score-indicator'
import { ClientReputationGauge } from '@/components/ui/client-reputation-gauge'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/utils/format'
import { calculateLoanScore, calculateClientReputation } from '@/lib/financial-logic'

interface SolicitudRenovacionModalProps {
    prestamoId: string
    clienteNombre: string
    currentMonto: number
    currentInteres: number
    currentModalidad: string
    currentCuotas: number
    solicitudPendiente?: { id: string; estado_solicitud: string } | null
    userRole?: string | null
    esRefinanciado?: boolean
    isAdminDirectRefinance?: boolean
    /** El préstamo actual es producto de un refinanciamiento previo */
    esProductoDeRefinanciamiento?: boolean
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        horario_fin_turno_1?: string
        desbloqueo_hasta: string
    }
    isBlockedByCuadre?: boolean
    blockReasonCierre?: string
    trigger?: React.ReactNode
    cuentas?: { id: string; nombre: string; saldo: number }[]
}

interface Elegibilidad {
    elegible: boolean
    score: number
    score_detalle: {
        pagos_puntuales: number
        pagos_tardios: number
        cuotas_vencidas_actual: number
        prestamos_finalizados: number
        prestamos_renovados: number
        meses_cliente: number
        historial_mora: number
        historial_cpp: number
    }
    porcentaje_pagado: number
    monto_original: number
    saldo_pendiente: number
    monto_maximo: number
    monto_minimo: number
    requiere_excepcion: boolean
    tipo_excepcion: string | null
    estado_prestamo: string
    estado_mora: string
    razon_bloqueo?: string
    porcentaje_requerido?: number
}

const CUOTAS_ESTANDAR: Record<string, number> = {
    diario: 24,
    semanal: 4,
    quincenal: 2,
    mensual: 1,
}

export function SolicitudRenovacionModal({ 
    prestamoId, 
    clienteNombre, 
    currentMonto,
    currentInteres,
    currentModalidad,
    currentCuotas,
    solicitudPendiente,
    userRole,
    esRefinanciado = false,
    isAdminDirectRefinance = false,
    esProductoDeRefinanciamiento = false,
    systemSchedule,
    isBlockedByCuadre,
    blockReasonCierre,
    trigger,
    cuentas = []
}: SolicitudRenovacionModalProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(false)
    const supabase = useMemo(() => createClient(), [])
    const [checkingEligibility, setCheckingEligibility] = useState(false)
    const [elegibilidad, setElegibilidad] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [selectedCuenta, setSelectedCuenta] = useState<string>('')
    const [showScoreBreakdown, setShowScoreBreakdown] = useState(false)
    const router = useRouter()

    // Lógica de Horario Síncrona para bloqueo preventivo inmediato
    const getCanRequestDueToTime = () => {
        if (userRole === 'admin') return true;
        if (!systemSchedule) return true;

        const now = new Date()
        const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const currentTime = peruTime.getHours().toString().padStart(2, '0') + ':' + peruTime.getMinutes().toString().padStart(2, '0')
        
        const timeToMinutes = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const tNow = timeToMinutes(currentTime);
        const tApertura = timeToMinutes(systemSchedule.horario_apertura || '07:00');
        const tCierre = timeToMinutes(systemSchedule.horario_cierre || '20:00');
        const tFinTurno1 = timeToMinutes(systemSchedule.horario_fin_turno_1 || '13:30');
        
        const isUnlocked = systemSchedule.desbloqueo_hasta ? (new Date(systemSchedule.desbloqueo_hasta) > now) : false;
        const isWithinHours = tNow >= tApertura && tNow < tCierre;
        
        // Bloqueo preventivo si ya pasó el fin del turno 1 Y el servidor reporta bloqueo
        const isWithinShift1 = tNow < tFinTurno1;
        const allowedByTime = isWithinHours && (isWithinShift1 || !isBlockedByCuadre);
        
        return allowedByTime || isUnlocked
    }

    const canRequestDueToTime = getCanRequestDueToTime()

    // Evaluar elegibilidad cuando se abre el modal
    useEffect(() => {
        if (open && canRequestDueToTime && !isBlockedByCuadre) {
            checkEligibility()
        }
    }, [open, canRequestDueToTime, isBlockedByCuadre])

    const checkEligibility = async () => {
        setCheckingEligibility(true)
        setError(null)
        try {
            const endpoint = isAdminDirectRefinance 
                ? `/api/prestamos/${prestamoId}/elegibilidad-directa`
                : `/api/prestamos/${prestamoId}/elegibilidad-renovacion`
            
            // Add a timeout to prevent infinite hanging
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 15000)

            const response = await fetch(endpoint, { signal: controller.signal })
            clearTimeout(timeoutId)
            
            let data;
            try {
                 data = await response.json()
            } catch (err) {
                 throw new Error('El servidor retornó una respuesta inválida (no JSON)')
            }
            
            if (!response.ok) {
                if (data.elegibilidad) {
                    // No es elegible pero tenemos info
                    setElegibilidad(data.elegibilidad)
                } else {
                    setError(data.error || 'Error verificando elegibilidad')
                }
            } else {
                setElegibilidad(data)
                // [NUEVO] Auto-sugerir el monto máximo recomendado (Ajuste por Score)
                if (data.monto_maximo) {
                    setSimulacion(prev => ({
                        ...prev,
                        monto: data.monto_maximo
                    }))
                }
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                setError('La evaluación de elegibilidad tardó demasiado (Timeout).')
            } else {
                setError(e.message || 'Error de conexión')
            }
        } finally {
            setCheckingEligibility(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!elegibilidad?.elegible || !canRequestDueToTime || isBlockedByCuadre) return

        setLoading(true)
        const formData = new FormData(e.currentTarget)
        const fecha_inicio = formData.get('fecha_inicio') as string
        
        const data = {
            prestamo_id: prestamoId,
            monto_solicitado: simulacion.monto,
            interes: resultados.interesFinal, 
            cuotas: simulacion.cuotas,
            modalidad: simulacion.modalidad,
            fecha_inicio_propuesta: fecha_inicio,
            cuenta_id: selectedCuenta,
            score_al_solicitar: elegibilidad?.score || 0,
            detalles_score: elegibilidad?.score_detalle || {}
        }

        try {
            const endpoint = isAdminDirectRefinance 
                ? '/api/renovaciones/directa'
                : '/api/renovaciones'

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            
            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.error || 'Error al crear solicitud')
            }

            let successTitle = 'Solicitud de renovación enviada';
            let successDesc = 'Tu supervisor será notificado para revisarla';

            if (isAdminDirectRefinance) {
                successTitle = 'Refinanciación completada';
                successDesc = 'El préstamo ha sido refinanciado exitosamente';
            } else if (userRole === 'admin') {
                successTitle = 'Renovación Pre-Aprobada';
                successDesc = 'La solicitud se generó en estado pre-aprobado y está lista para tu aprobación en el panel.';
            }

            toast.success(successTitle, {
                description: successDesc
            })
            setOpen(false)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al procesar la operación')
        } finally {
            setLoading(false)
        }
    }

    // Calcular fecha de hoy para el input date
    const today = new Date()
    // Ajuste zona horaria Perú si es necesario, o usar local
    const todayStr = today.toISOString().split('T')[0]

    // Helper para revertir el cálculo de interés y obtener la base original
    const getBaseInterest = () => {
        const estandar = CUOTAS_ESTANDAR[currentModalidad] || 24
        // Fórmula inversa: InteresBase = (InteresFinal * Estandar) / Cuotas
        // Si las cuotas son 0 o invalidas, retornar 20 por defecto
        if (!currentCuotas || currentCuotas <= 0) return 20 
        
        const baseCalculada = (currentInteres * estandar) / currentCuotas
        // Retornamos redondeado a un decimal para limpieza
        return Math.round(baseCalculada * 10) / 10
    }

    // Simulador Logic
    const [simulacion, setSimulacion] = useState({
        monto: currentMonto,
        interes: getBaseInterest(), 
        cuotas: currentCuotas,
        modalidad: currentModalidad
    })



    const calcularSimulacion = () => {
        const monto = parseFloat(simulacion.monto?.toString() || '0') || 0
        const cuotas = parseInt(simulacion.cuotas?.toString() || '0') || 0
        const interesBase = parseFloat(simulacion.interes?.toString() || '20') || 20
        const cuotasEstandar = CUOTAS_ESTANDAR[simulacion.modalidad] || 24
        
        let interesFinal = interesBase
        if (cuotas > 0) {
           interesFinal = Math.round((cuotas / cuotasEstandar) * interesBase * 100) / 100
        }

        const totalPagar = monto * (1 + interesFinal / 100)
        const valorCuota = cuotas > 0 ? totalPagar / cuotas : 0

        return { interesFinal, totalPagar, valorCuota }
    }

    const resultados = calcularSimulacion()

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (!isOpen) {
            // Resetear estado al cerrar para que vuelva a verificar al abrir
            // Esto corrige el bug de que no se actualiza si el usuario paga una cuota y vuelve a intentar
            setElegibilidad(null)
            setError(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button size="sm" className="h-[46px] md:h-[58px] px-4 md:px-5 gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl font-bold border-0 shadow-lg shadow-orange-500/20 transition-all">
                        <RefreshCw className="h-4 w-4 md:w-5 md:h-5" /> Renovar
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent 
                className="bg-slate-900 border-slate-800 text-white sm:max-w-[600px] max-h-[95vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl">
                        {isAdminDirectRefinance ? 'Refinanciación Directa (Mora Crítica)' : 'Solicitar Renovación'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Cliente: <span className="text-white font-medium">{clienteNombre}</span>
                    </DialogDescription>
                </DialogHeader>

                {(!canRequestDueToTime && userRole !== 'admin') ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                            <Lock className="h-8 w-8 text-red-500" />
                        </div>
                        <div className="space-y-2 max-w-xs">
                            <h3 className="text-lg font-bold text-red-400">Sistema Cerrado</h3>
                            <p className="text-slate-400 text-sm">
                                No se pueden procesar solicitudes fuera del horario de operación ({systemSchedule?.horario_apertura} a {systemSchedule?.horario_cierre}).
                                {systemSchedule?.desbloqueo_hasta && new Date(systemSchedule.desbloqueo_hasta) > new Date() ? ' (Desbloqueo activo pronto)' : ''}
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => setOpen(false)} className="mt-4 border-slate-700 text-slate-300">
                            Cerrar
                        </Button>
                    </div>
                ) : (isBlockedByCuadre && userRole === 'asesor') ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
                        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center">
                            <Lock className="h-8 w-8 text-amber-500" />
                        </div>
                        <div className="space-y-2 max-w-xs">
                            <h3 className="text-lg font-bold text-amber-400">Cuadre Pendiente</h3>
                            <p className="text-slate-400 text-sm">
                                {blockReasonCierre || `Al finalizar el Primer Turno (${systemSchedule?.horario_fin_turno_1 || '13:30'}), debes realizar el CUADRE PARCIAL para continuar.`}
                            </p>
                        </div>
                        <Button variant="outline" onClick={() => setOpen(false)} className="mt-4 border-slate-700 text-slate-300">
                            Entendido
                        </Button>
                    </div>
                ) : checkingEligibility ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
                        <p className="text-slate-400">Evaluando elegibilidad...</p>
                    </div>
                ) : error && !elegibilidad ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <XCircle className="h-12 w-12 text-red-500" />
                        <p className="text-red-400 text-center">{error}</p>
                        <Button variant="outline" onClick={checkEligibility}>
                            Reintentar
                        </Button>
                    </div>
                ) : elegibilidad && !elegibilidad.elegible ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <div className="relative">
                            <Lock className="h-16 w-16 text-slate-600" />
                            <XCircle className="h-8 w-8 text-red-500 absolute -bottom-1 -right-1" />
                        </div>
                        <h3 className="text-lg font-semibold text-red-400">No Elegible para Renovación</h3>
                        <p className="text-slate-400 text-center text-sm max-w-xs">
                            {elegibilidad.razon_bloqueo}
                        </p>
                        {elegibilidad.porcentaje_requerido && (
                            <div className="bg-slate-800 rounded-lg p-4 text-center">
                                <p className="text-slate-400 text-sm mb-1">Progreso actual</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-amber-500 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, elegibilidad.porcentaje_pagado)}%` }}
                                        />
                                    </div>
                                    <span className="text-amber-400 font-bold text-sm">
                                        {elegibilidad.porcentaje_pagado?.toFixed(1)}%
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Requerido: {elegibilidad.porcentaje_requerido}%
                                </p>
                            </div>
                        )}
                    </div>
                ) : elegibilidad ? (
                    <>
                        {/* Dual Score Summary */}
                        <div className="bg-slate-950/40 rounded-2xl p-4 border border-slate-800/60 shadow-inner relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
                            
                            <div className="relative flex flex-col gap-6">
                                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_1.5fr] items-center gap-4 sm:gap-6">
                                    {/* Left: Health Score (Current Loan) */}
                                    <div className="flex flex-col items-center gap-2 p-2 bg-white/5 rounded-2xl border border-white/5">
                                        <span className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Salud Préstamo</span>
                                        <ScoreIndicator score={elegibilidad.healthScore || elegibilidad.score} size="md" />
                                    </div>

                                    {/* Right: Reputation Score (Client History) */}
                                    <div className="flex flex-col items-center gap-2 p-2 bg-white/5 rounded-2xl border border-white/5">
                                        <span className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Reputación Cliente</span>
                                        <ClientReputationGauge score={elegibilidad.reputationScore || elegibilidad.score} size="md" showLabel={true} />
                                    </div>

                                    <div className="hidden sm:block w-px h-24 bg-slate-800/80" />

                                    {/* Right Panel: Decision Summary */}
                                    <div className="col-span-2 sm:col-span-1 space-y-3">
                                        <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 shadow-sm">
                                            <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-tighter mb-2 flex items-center justify-between">
                                                Capacidad Renovación
                                                <span className="bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded-[4px] text-[7px] animate-pulse">Dual-Score Activo</span>
                                            </h4>
                                            <ScoreLimitRules 
                                                healthScore={elegibilidad.healthScore || elegibilidad.score} 
                                                reputationScore={elegibilidad.reputationScore || elegibilidad.score} 
                                            />
                                        </div>
                                        
                                        <button 
                                            type="button"
                                            onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
                                            className="w-full flex items-center justify-center gap-1.5 py-1 text-[9px] font-black text-slate-500 hover:text-slate-300 transition-all uppercase tracking-widest border border-dashed border-slate-800 rounded-lg hover:bg-slate-800/50"
                                        >
                                            {showScoreBreakdown ? (
                                                <><ChevronUp className="w-3.5 h-3.5" /> Cerrar Detalle</>
                                            ) : (
                                                <><ChevronDown className="w-3.5 h-3.5" /> Auditoría de Puntos</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Panel de Desglose (Salud) */}
                            {showScoreBreakdown && (
                                <div className="mt-4 pt-4 border-t border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <ScoreBreakdown loanScore={elegibilidad.loanScoreData} />
                                    <p className="text-[9px] text-slate-500 italic mt-3 text-center border-t border-white/5 pt-2">
                                        * El desglose muestra los factores individuales del préstamo actual.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Alerta: Producto de Refinanciamiento */}
                        {esProductoDeRefinanciamiento && (
                            <div className="bg-amber-900/25 border border-amber-500/40 rounded-lg p-3 flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-amber-300 font-semibold text-sm">Préstamo originado por Refinanciamiento</p>
                                    <p className="text-amber-200/60 text-xs mt-0.5 leading-snug">
                                        Este préstamo fue creado a partir de una refinanciación directa por mora o atrasos en un crédito anterior. 
                                        Evaluar con precaución antes de aprobar una nueva renovación.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Alerta de excepción */}
                        {elegibilidad.requiere_excepcion && (
                            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-amber-400 font-medium text-sm">Requiere Excepción</p>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        {elegibilidad.tipo_excepcion === 'mora' && 'El préstamo está en estado de mora. Un supervisor o admin debe aprobar la excepción.'}
                                        {elegibilidad.tipo_excepcion === 'vencido' && 'El préstamo está vencido. Se requiere excepción o refinanciamiento.'}
                                        {elegibilidad.tipo_excepcion === 'score_bajo' && 'El score crediticio es bajo. Un supervisor o admin debe aprobar la excepción.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Resumen del préstamo actual */}
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-slate-800/50 rounded-lg p-3">
                                <div className="text-slate-400 text-xs text-[10px] uppercase tracking-wider">Monto Original</div>
                                <div className="text-slate-200 font-bold font-mono">${formatMoney(currentMonto)}</div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-3">
                                <div className="text-slate-400 text-xs text-[10px] uppercase tracking-wider">Pagado</div>
                                <div className="text-emerald-400 font-bold font-mono">{elegibilidad.porcentaje_pagado?.toFixed(1)}%</div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-3">
                                <div className="text-slate-400 text-xs text-[10px] uppercase tracking-wider">Saldo Pendiente</div>
                                <div className="text-amber-400 font-bold font-mono">${formatMoney(elegibilidad.saldo_pendiente)}</div>
                            </div>
                        </div>

                        {/* Límites de Monto */}
                        <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3">
                            <p className="text-blue-400 text-xs font-medium mb-3">Límites de Monto según Score</p>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Mínimo: <span className="text-white font-bold">${formatMoney(elegibilidad.monto_minimo)}</span></span>
                                <span className="text-slate-400">Máximo: <span className="text-white font-bold">${formatMoney(elegibilidad.monto_maximo)}</span></span>
                            </div>
                        </div>

                        {/* Formulario */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <div className="flex justify-between items-end">
                                        <Label htmlFor="monto_solicitado">Nuevo Monto</Label>
                                        {elegibilidad.ajuste_recomendado_pct !== undefined && (
                                            <Badge variant="outline" className={cn(
                                                "text-[9px] font-black h-5 px-1.5 border-0",
                                                elegibilidad.ajuste_recomendado_pct > 0 ? "bg-emerald-500/10 text-emerald-400" : 
                                                elegibilidad.ajuste_recomendado_pct < 0 ? "bg-rose-500/10 text-rose-400" : 
                                                "bg-slate-800 text-slate-400"
                                            )}>
                                                {elegibilidad.ajuste_recomendado_pct > 0 ? <TrendingUp className="w-2.5 h-2.5 mr-1" /> : elegibilidad.ajuste_recomendado_pct < 0 ? <TrendingDown className="w-2.5 h-2.5 mr-1" /> : null}
                                                Recomendado: {elegibilidad.ajuste_recomendado_pct > 0 ? `+${elegibilidad.ajuste_recomendado_pct}%` : `${elegibilidad.ajuste_recomendado_pct}%`}
                                            </Badge>
                                        )}
                                    </div>
                                    <Input 
                                        id="monto_solicitado" 
                                        name="monto_solicitado" 
                                        type="number" 
                                        step="0.01" 
                                        min={elegibilidad.monto_minimo}
                                        max={elegibilidad.monto_maximo}
                                        value={simulacion.monto}
                                        onChange={(e) => setSimulacion({...simulacion, monto: parseFloat(e.target.value) || 0})}
                                        className="bg-slate-950 border-slate-800"
                                        required 
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="interes">Interés Base (%)</Label>
                                    <Input 
                                        id="interes" 
                                        name="interes" 
                                        type="number" 
                                        step="0.1" 
                                        value={simulacion.interes}
                                        onChange={(e) => setSimulacion({...simulacion, interes: parseFloat(e.target.value) || 0})}
                                        className="bg-slate-950 border-slate-800"
                                        required 
                                    />
                                </div>
                            </div>

                            
                            
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="modalidad">Modalidad</Label>
                                    <Select 
                                        name="modalidad" 
                                        value={simulacion.modalidad}
                                        onValueChange={(val) => setSimulacion({...simulacion, modalidad: val})}
                                    >
                                        <SelectTrigger className="bg-slate-950 border-slate-800">
                                            <SelectValue placeholder="Seleccionar modalidad" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                            <SelectItem value="diario">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    <span>Diario</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="semanal">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                    <span>Semanal</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="quincenal">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                    <span>Quincenal</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="mensual">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                    <span>Mensual</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="cuotas">Número de Cuotas</Label>
                                    <Input 
                                        id="cuotas" 
                                        name="cuotas" 
                                        type="number" 
                                        min="1"
                                        value={simulacion.cuotas}
                                        onChange={(e) => setSimulacion({...simulacion, cuotas: parseFloat(e.target.value) || 0})}
                                        className="bg-slate-950 border-slate-800"
                                        required 
                                    />
                                </div>
                            </div>

                            {/* SIMULADOR / PREVIEW */}
                            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/20">
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Interés Final</p>
                                        <p className="text-emerald-400 font-bold text-lg">{resultados.interesFinal}%</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Total a Pagar</p>
                                        <p className="text-white font-bold text-lg">${formatMoney(resultados.totalPagar)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Valor Cuota</p>
                                        <p className="text-white font-bold text-lg">${formatMoney(resultados.valorCuota)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Selector de Cuenta - Solo visible y REQUERIDO para Refinanciación Directa (Admin) */}
                            {isAdminDirectRefinance && (
                                <div className="grid gap-2 mb-2">
                                    <Label htmlFor="cuenta">Cuenta de Desembolso (Cartera) <span className="text-rose-500">*</span></Label>
                                    <Select 
                                        name="cuenta_id" 
                                        value={selectedCuenta}
                                        onValueChange={setSelectedCuenta}
                                        required
                                    >
                                        <SelectTrigger className="bg-slate-950 border-slate-800">
                                            <SelectValue placeholder="Seleccione una cuenta para el desembolso" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#0f172a] border-slate-700">
                                            {cuentas.map((cuenta) => (
                                                <SelectItem key={cuenta.id} value={cuenta.id}>
                                                    <div className="flex justify-between items-center w-full min-w-[200px]">
                                                        <span>{cuenta.nombre}</span>
                                                        <span className="text-emerald-400 font-mono ml-4">${formatMoney(cuenta.saldo)}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="grid gap-2">
                                <Label htmlFor="fecha_inicio">Fecha de Inicio</Label>
                                <Input 
                                    id="fecha_inicio" 
                                    name="fecha_inicio" 
                                    type="date" 
                                    min={todayStr}
                                    defaultValue={todayStr}
                                    className="bg-slate-950 border-slate-800"
                                    required 
                                />
                            </div>

                            {isBlockedByCuadre && (
                                <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-red-400 font-bold text-sm">Registro de Renovaciones Bloqueado</p>
                                        <p className="text-red-200/70 text-xs mt-1 leading-snug">
                                            {blockReasonCierre}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {userRole !== 'supervisor' && (
                                <DialogFooter>
                                    <Button 
                                        type="submit" 
                                        disabled={loading || !canRequestDueToTime || isBlockedByCuadre}
                                        className={cn(
                                            "w-full text-white shadow-lg",
                                            isBlockedByCuadre ? "bg-slate-800 cursor-not-allowed grayscale" :
                                            elegibilidad.requiere_excepcion 
                                                ? "bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400"
                                                : "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400"
                                        )}
                                    >
                                        {loading ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
                                        ) : isBlockedByCuadre ? (
                                            <><Lock className="mr-2 h-4 w-4" /> Bloqueado por Cuadre</>
                                        ) : !canRequestDueToTime ? (
                                            <><Lock className="mr-2 h-4 w-4" /> Sistema Cerrado ({systemSchedule?.horario_apertura} - {systemSchedule?.horario_cierre})</>
                                        ) : (
                                            <><CheckCircle2 className="mr-2 h-4 w-4" /> {isAdminDirectRefinance ? 'Refinanciar (Aprobación Automática)' : 'Solicitar Renovación'}</>
                                        )}
                                    </Button>
                                </DialogFooter>
                            )}
                            
                            {!canRequestDueToTime && (
                                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg flex items-center gap-2 mt-4">
                                    <Lock className="h-4 w-4 text-red-500 shrink-0" />
                                    <p className="text-[11px] text-red-400">
                                        No se pueden procesar solicitudes fuera del horario de operación ({systemSchedule?.horario_apertura} a {systemSchedule?.horario_cierre}).
                                    </p>
                                </div>
                            )}
                        </form>
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    )
}
