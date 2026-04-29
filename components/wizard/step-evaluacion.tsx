'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Briefcase, DollarSign, MapPin, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EvaluacionData } from '@/types/wizard'
import { SimpleImageUpload } from '@/components/wizard/simple-image-upload'
import { GpsInput } from '@/components/wizard/gps-input'


const evaluacionSchema = z.object({
  giro_negocio: z.string().min(3, 'Giro de negocio es requerido'),
  fuentes_ingresos: z.string().min(5, 'Describa sus fuentes de ingresos'),
  ingresos_mensuales: z.number().min(0, 'Ingresos mensuales requeridos'),
  motivo_prestamo: z.string().min(10, 'Explique el motivo del préstamo'),
  gps_coordenadas: z.string().optional()
})

interface StepEvaluacionProps {
  initialData?: Partial<EvaluacionData>
  onNext: (data: EvaluacionData) => void
  onChange?: (data: Partial<EvaluacionData>) => void
  onBack: () => void
}

const DOCUMENTOS_REQUERIDOS = [
  { key: 'negocio', label: 'Foto del Negocio' },
  { key: 'frontis_casa', label: 'Frontis de Casa' },
  { key: 'recibo_luz_agua', label: 'Recibo Luz/Agua' },
  { key: 'documentos_negocio', label: 'Docs del Negocio' },
  { key: 'foto_cliente', label: 'Foto Cliente' },
  { key: 'filtro_sentinel', label: 'Filtro Sentinel' },
  { key: 'dni_frontal', label: 'DNI Frontal' },
  { key: 'dni_posterior', label: 'DNI Posterior' }
]

export function StepEvaluacion({ initialData, onNext, onChange, onBack }: StepEvaluacionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [documentos, setDocumentos] = useState<Record<string, string>>(initialData?.documentos || {})
  const [gpsCoords, setGpsCoords] = useState(initialData?.gps_coordenadas || '')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(evaluacionSchema),
    defaultValues: {
      giro_negocio: initialData?.giro_negocio || '',
      fuentes_ingresos: initialData?.fuentes_ingresos || '',
      ingresos_mensuales: initialData?.ingresos_mensuales || 0,
      motivo_prestamo: initialData?.motivo_prestamo || '',
      gps_coordenadas: initialData?.gps_coordenadas || ''
    }
  })

  const watchedValues = watch()

  // Notificar cambios al padre en tiempo real
  useEffect(() => {
    if (onChange) {
      onChange({
        ...watchedValues,
        gps_coordenadas: gpsCoords,
        documentos
      })
    }
  }, [watchedValues, gpsCoords, documentos, onChange])

  const handleDocumentoUpload = (key: string, fileData: string) => {
    setDocumentos((prev) => ({ ...prev, [key]: fileData }))
  }

  const documentosCompletos = DOCUMENTOS_REQUERIDOS.every((doc) => documentos[doc.key])

  const onSubmit = async (data: any) => {
    // Validar documentos
    if (!documentosCompletos) {
      alert('⚠️ Debe cargar todos los 8 documentos obligatorios antes de continuar')
      return
    }

    setIsSubmitting(true)
    try {
      await onNext({
        ...data,
        gps_coordenadas: gpsCoords,
        documentos
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-900/30">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Evaluación Financiera</h2>
            <p className="text-sm text-slate-400">Análisis del cliente y documentación</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Giro de Negocio */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 ml-1">Giro de Negocio *</label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-3.5 h-4 w-4 text-blue-500" />
              <Input
                {...register('giro_negocio')}
                placeholder="Ej: Bodega, Restaurante, Taxi"
                disabled={isSubmitting}
                className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base"
              />
            </div>
            {errors.giro_negocio && (
              <p className="text-xs text-red-400 ml-1">{errors.giro_negocio.message as string}</p>
            )}
          </div>

          {/* Fuentes de Ingresos e Ingresos Mensuales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Fuentes de Ingresos *</label>
              <Input
                {...register('fuentes_ingresos')}
                placeholder="Ej: Ventas, Servicios"
                disabled={isSubmitting}
                className="h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base"
              />
              {errors.fuentes_ingresos && (
                <p className="text-xs text-red-400 ml-1">{errors.fuentes_ingresos.message as string}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Ingresos Mensuales (S/) *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3.5 h-4 w-4 text-emerald-500" />
                <Input
                  type="number"
                  step="0.01"
                  {...register('ingresos_mensuales', { valueAsNumber: true })}
                  placeholder="2500"
                  disabled={isSubmitting}
                  className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-emerald-500/50 text-slate-200 rounded-xl text-base"
                />
              </div>
              {errors.ingresos_mensuales && (
                <p className="text-xs text-red-400 ml-1">{errors.ingresos_mensuales.message as string}</p>
              )}
            </div>
          </div>

          {/* Motivo del Préstamo */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 ml-1">Motivo del Préstamo *</label>
            <Textarea
              {...register('motivo_prestamo')}
              placeholder="Describa para qué utilizará el préstamo..."
              rows={3}
              disabled={isSubmitting}
              className="bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base resize-none"
            />
            {errors.motivo_prestamo && (
              <p className="text-xs text-red-400 ml-1">{errors.motivo_prestamo.message as string}</p>
            )}
          </div>

          {/* GPS Coordenadas */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 ml-1">Ubicación GPS</label>
            <GpsInput value={gpsCoords} onChange={setGpsCoords} disabled={isSubmitting} />
          </div>

          {/* Documentos Obligatorios */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">Documentos Obligatorios *</label>
              <span className="text-xs text-blue-400">
                {Object.keys(documentos).length} / {DOCUMENTOS_REQUERIDOS.length}
              </span>
            </div>

            {!documentosCompletos && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs text-yellow-400">⚠️ Debe cargar todos los 8 documentos para continuar</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DOCUMENTOS_REQUERIDOS.map((doc) => (
                <SimpleImageUpload
                  key={doc.key}
                  label={doc.label}
                  value={documentos[doc.key]}
                  onChange={(fileData) => handleDocumentoUpload(doc.key, fileData)}
                  disabled={isSubmitting}
                />
              ))}
            </div>
          </div>
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
          disabled={isSubmitting || !documentosCompletos}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-900/20 border border-blue-400/20 rounded-xl px-8 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Procesando...
            </>
          ) : (
            'Siguiente →'
          )}
        </Button>
      </div>
    </form>
  )
}
