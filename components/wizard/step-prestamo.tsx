'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { DollarSign, Hash, Calendar, RefreshCw, Percent, AlertTriangle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PrestamoData } from '@/types/wizard'
import { useMemo } from 'react'

const prestamoSchema = z.object({
  monto_solicitado: z.number().min(100, 'Monto mínimo es 100'),
  interes_base: z.number().min(1, 'Interés debe ser mayor a 0'),
  cuotas: z.number().min(1, 'Debe tener al menos 1 cuota'),
  modalidad: z.enum(['diario', 'semanal', 'quincenal', 'mensual']),
  fecha_inicio_propuesta: z.string().min(1, 'Fecha de inicio es requerida')
})

interface StepPrestamoProps {
  initialData?: Partial<PrestamoData>
  onNext: (data: PrestamoData) => void
  onBack: () => void
  isSubmitting?: boolean
  systemSchedule?: {
    horario_apertura: string
    horario_cierre: string
    desbloqueo_hasta: string
  }
  clienteLimit?: number
  onChange?: (data: Partial<PrestamoData>) => void
}

const CUOTAS_ESTANDAR = {
  diario: 24,
  semanal: 4,
  quincenal: 2,
  mensual: 1
}

export function StepPrestamo({ initialData, onNext, onBack, isSubmitting = false, systemSchedule, clienteLimit, onChange }: StepPrestamoProps) {

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(prestamoSchema),
    defaultValues: {
      monto_solicitado: initialData?.monto_solicitado || 0,
      interes_base: initialData?.interes || 20,
      cuotas: initialData?.cuotas || 0,
      modalidad: initialData?.modalidad || 'diario',
      fecha_inicio_propuesta: initialData?.fecha_inicio_propuesta || new Date().toISOString().split('T')[0]
    }
  })

  const watchAll = watch()

  const monto = watchAll.monto_solicitado || 0
  const interesBase = watchAll.interes_base || 0
  const cuotas = watchAll.cuotas || 1
  const modalidad = watchAll.modalidad

  // Calcular interés proporcional usando useMemo
  const calcularInteres = useMemo(() => {
    const cuotasEstandar = CUOTAS_ESTANDAR[modalidad]

    if (cuotas <= 0) return { interes: interesBase, esAjustado: false, cuotasEstandar }

    // Fórmula: interes_final = (cuotas / cuotas_estándar) × interes_base
    const interesFinal = (cuotas / cuotasEstandar) * interesBase

    return {
      interes: Math.round(interesFinal * 100) / 100, // Redondear a 2 decimales
      esAjustado: cuotas !== cuotasEstandar,
      cuotasEstandar
    }
  }, [modalidad, cuotas, interesBase])

  // Notificar cambios al padre en tiempo real
  useEffect(() => {
    if (onChange) {
        onChange({
            ...watchAll,
            interes: calcularInteres.interes // Enviamos el interés calculado
        })
    }
  }, [watchAll, onChange, calcularInteres.interes])

  // Calcular totales
  const totalPagar = monto * (1 + calcularInteres.interes / 100)
  const cuotaMonto = totalPagar / cuotas

  const onSubmit = (data: any) => {
    // Verificar horario antes de permitir submit
    if (systemSchedule) {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
      const currentTimeString = formatter.format(now)
      
      const padTime = (t: string) => t.split(':').map(p => p.padStart(2, '0')).join(':')
      const opening = padTime(systemSchedule.horario_apertura)
      const closing = padTime(systemSchedule.horario_cierre)
      
      const isUnlocked = systemSchedule.desbloqueo_hasta ? (new Date(systemSchedule.desbloqueo_hasta) > now) : false
      
      if (!isUnlocked && (currentTimeString < opening || currentTimeString > closing)) {
        alert(`Sistema cerrado. El horario de operación es de ${systemSchedule.horario_apertura} a ${systemSchedule.horario_cierre}.`)
        return
      }
    }

    // Validar Límite de Préstamo
    if (clienteLimit && clienteLimit > 0 && data.monto_solicitado > clienteLimit) {
      alert(`El monto solicitado (S/ ${data.monto_solicitado}) excede el límite permitido para este cliente (S/ ${clienteLimit}).`)
      return
    }

    // Enviar el interés calculado (proporcional), no el base
    onNext({
      monto_solicitado: data.monto_solicitado,
      interes: calcularInteres.interes, // Interés final calculado
      cuotas: data.cuotas,
      modalidad: data.modalidad,
      fecha_inicio_propuesta: data.fecha_inicio_propuesta
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-emerald-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-900/30">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Detalles del Préstamo</h2>
            <p className="text-sm text-slate-400">Configure las condiciones del crédito</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Monto e Interés Base */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Monto Solicitado (S/) *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3.5 h-4 w-4 text-emerald-500" />
                <Input
                  type="number"
                  step="0.01"
                  {...register('monto_solicitado', { valueAsNumber: true })}
                  placeholder="1000"
                  className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-emerald-500/50 text-slate-200 rounded-xl text-base"
                />
              </div>
              {clienteLimit && clienteLimit > 0 && (
                <div className="flex items-center gap-1.5 mt-1 mx-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${monto > clienteLimit ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                  <p className={`text-[10px] uppercase font-bold tracking-tight ${monto > clienteLimit ? 'text-red-400' : 'text-amber-500/80'}`}>
                    Límite del Cliente: S/ {clienteLimit}
                  </p>
                </div>
              )}
              {errors.monto_solicitado && (
                <p className="text-xs text-red-400 ml-1">{errors.monto_solicitado.message as string}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Interés Base (%) *</label>
              <div className="relative">
                <Percent className="absolute left-3 top-3.5 h-4 w-4 text-blue-500" />
                <Input
                  type="number"
                  step="0.01"
                  {...register('interes_base', { valueAsNumber: true })}
                  placeholder="20"
                  className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base"
                />
              </div>
              {errors.interes_base && (
                <p className="text-xs text-red-400 ml-1">{errors.interes_base.message as string}</p>
              )}
            </div>
          </div>

          {/* Modalidad y Cuotas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Modalidad de Pago *</label>
              <div className="relative">
                <RefreshCw className="absolute left-3 top-3.5 h-4 w-4 text-purple-500" />
                <select
                  {...register('modalidad')}
                  className="flex h-12 w-full rounded-xl border border-slate-700 bg-slate-950/50 pl-10 pr-3 py-2 text-base text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
                >
                  <option value="diario">Diario</option>
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
              <p className="text-xs text-slate-500 ml-1">
                Base: {CUOTAS_ESTANDAR[modalidad]} cuotas = {interesBase}%
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Número de Cuotas *</label>
              <div className="relative">
                <Hash className="absolute left-3 top-3.5 h-4 w-4 text-blue-500" />
                <Input
                  type="number"
                  {...register('cuotas', { valueAsNumber: true })}
                  placeholder={`Ej: ${CUOTAS_ESTANDAR[modalidad]}`}
                  min="1"
                  className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base"
                />
              </div>
              {errors.cuotas && (
                <p className="text-xs text-red-400 ml-1">{errors.cuotas.message as string}</p>
              )}
            </div>
          </div>

          {/* Fecha de Inicio Propuesta */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 ml-1">Fecha de Inicio Propuesta *</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-orange-500" />
              <Input
                type="date"
                {...register('fecha_inicio_propuesta')}
                className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-orange-500/50 text-slate-200 rounded-xl text-base"
              />
            </div>
            {errors.fecha_inicio_propuesta && (
              <p className="text-xs text-red-400 ml-1">{errors.fecha_inicio_propuesta.message as string}</p>
            )}
          </div>

          {/* Alert si interés es ajustado */}
          {calcularInteres.esAjustado && cuotas > 0 && (
            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
              <p className="text-xs text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Interés ajustado: {cuotas} cuotas ÷ {calcularInteres.cuotasEstandar} base × {interesBase}% = <strong>{calcularInteres.interes}%</strong>
              </p>
            </div>
          )}

          {/* Resumen */}
          {monto > 0 && cuotas > 0 && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 mt-6">
              <p className="text-xs text-emerald-400 font-bold">💰 Resumen del Préstamo</p>
              
              {/* Montos */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-slate-900/50">
                  <p className="text-xs text-slate-400">Monto</p>
                  <p className="text-white font-bold">S/ {monto.toFixed(2)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-slate-900/50">
                  <p className="text-xs text-slate-400">Interés Final</p>
                  <p className={`font-bold ${calcularInteres.esAjustado ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {calcularInteres.interes}%
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-slate-900/50">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="text-emerald-400 font-bold">S/ {totalPagar.toFixed(2)}</p>
                </div>
              </div>
              
              {/* Cuota */}
              <div className="text-center p-3 rounded-lg bg-emerald-600/20 border border-emerald-500/30">
                <p className="text-xs text-emerald-300">Cuota {modalidad}</p>
                <p className="text-2xl font-bold text-white">S/ {cuotaMonto.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="bg-slate-950/50 border-slate-700 hover:bg-slate-900 text-slate-300 hover:text-white rounded-xl px-6 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Anterior
        </Button>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/20 border border-emerald-400/20 rounded-xl px-8 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            'Finalizar →'
          )}
        </Button>
      </div>

      {(() => {
        if (!systemSchedule) return null
        const now = new Date()
        const formatter = new Intl.DateTimeFormat('es-PE', {
          timeZone: 'America/Lima',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
        const currentTimeString = formatter.format(now)

        const padTime = (t: string) => t.split(':').map(p => p.padStart(2, '0')).join(':')
        const opening = padTime(systemSchedule.horario_apertura)
        const closing = padTime(systemSchedule.horario_cierre)
        
        const isUnlocked = systemSchedule.desbloqueo_hasta ? (new Date(systemSchedule.desbloqueo_hasta) > now) : false
        const isClosed = !isUnlocked && (currentTimeString < opening || currentTimeString > closing)
        
        if (!isClosed) return null
        
        return (
          <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 flex items-center gap-3 mt-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-red-400 font-bold text-sm">Sistema Cerrado para Nuevas Operaciones</p>
              <p className="text-red-300/60 text-xs">El horario de operación es de {systemSchedule.horario_apertura} a {systemSchedule.horario_cierre}.</p>
            </div>
          </div>
        )
      })()}
    </form>
  )
}
