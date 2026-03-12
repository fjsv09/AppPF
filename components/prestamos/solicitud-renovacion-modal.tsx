'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ScoreIndicator, BehaviorSummary } from '@/components/ui/score-indicator'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/utils/format'

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
        desbloqueo_hasta: string
    }
    trigger?: React.ReactNode
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
    trigger
}: SolicitudRenovacionModalProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [checkingEligibility, setCheckingEligibility] = useState(false)
    const [elegibilidad, setElegibilidad] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [canRequestDueToTime, setCanRequestDueToTime] = useState(true)
    const router = useRouter()

    // Evaluar elegibilidad cuando se abre el modal
    useEffect(() => {
        if (open) {
            checkEligibility()
            checkTimeStatus()
        }
    }, [open])

    const checkTimeStatus = () => {
        if (!systemSchedule) return

        const now = new Date()
        // Format to HH:MM in Peru time
        const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const currentTime = peruTime.getHours().toString().padStart(2, '0') + ':' + peruTime.getMinutes().toString().padStart(2, '0')
        
        const isUnlocked = systemSchedule.desbloqueo_hasta ? (new Date(systemSchedule.desbloqueo_hasta) > now) : false
        const isWithinSchedule = currentTime >= systemSchedule.horario_apertura && currentTime < systemSchedule.horario_cierre
        
        // Final decision: if it's unlocked by exception OR within schedule, you can pay/request
        setCanRequestDueToTime(isWithinSchedule || isUnlocked)
    }

    const checkEligibility = async () => {
        setCheckingEligibility(true)
        setError(null)
        try {
            const endpoint = isAdminDirectRefinance 
                ? `/api/prestamos/${prestamoId}/elegibilidad-directa`
                : `/api/prestamos/${prestamoId}/elegibilidad-renovacion`
            
            const response = await fetch(endpoint)
            const data = await response.json()
            
            if (!response.ok) {
                if (data.elegibilidad) {
                    // No es elegible pero tenemos info
                    setElegibilidad(data.elegibilidad)
                } else {
                    setError(data.error || 'Error verificando elegibilidad')
                }
            } else {
                setElegibilidad(data)
            }
        } catch (e: any) {
            setError(e.message || 'Error de conexión')
        } finally {
            setCheckingEligibility(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!elegibilidad?.elegible || !canRequestDueToTime) return

        setLoading(true)
        const formData = new FormData(e.currentTarget)
        
        const data = {
            prestamo_id: prestamoId,
            monto_solicitado: parseFloat(formData.get('monto_solicitado') as string),
            interes: resultados.interesFinal, // Usar interés calculado efectivo
            cuotas: parseInt(formData.get('cuotas') as string),
            modalidad: formData.get('modalidad') as string,
            fecha_inicio_propuesta: formData.get('fecha_inicio') as string,
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

                {checkingEligibility ? (
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
                        {/* Score y Resumen */}
                        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-4 border border-slate-700/50">
                            <div className="flex items-start gap-4">
                                <ScoreIndicator score={elegibilidad.score} size="lg" />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-white mb-2">Comportamiento de Pago</h3>
                                    <BehaviorSummary data={elegibilidad.score_detalle} />
                                </div>
                            </div>
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
                                    <Label htmlFor="monto_solicitado">Nuevo Monto</Label>
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
                                        <SelectContent className="bg-slate-900 border-slate-800">
                                            <SelectItem value="diario">Diario</SelectItem>
                                            <SelectItem value="semanal">Semanal</SelectItem>
                                            <SelectItem value="quincenal">Quincenal</SelectItem>
                                            <SelectItem value="mensual">Mensual</SelectItem>
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

                            {userRole !== 'supervisor' && (
                                <DialogFooter>
                                    <Button 
                                        type="submit" 
                                        disabled={loading}
                                        className={cn(
                                            "w-full text-white shadow-lg",
                                            elegibilidad.requiere_excepcion 
                                                ? "bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400"
                                                : "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400"
                                        )}
                                    >
                                        {loading ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
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
