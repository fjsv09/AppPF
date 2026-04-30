'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { User, CreditCard, Phone, MapPin, Briefcase, MessageSquare, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProspectoData } from '@/types/wizard'

const prospectoSchema = z.object({
  nombres: z.string().min(3, 'Nombre completo es requerido'),
  dni: z.string().length(8, 'DNI debe tener 8 dígitos'),
  telefono: z.string().min(9, 'Teléfono debe tener al menos 9 dígitos'),
  direccion: z.string().optional(),
  referencia: z.string().optional(),
  sector_id: z.string().min(1, 'Debe seleccionar un sector')
})

interface Sector {
  id: string
  nombre: string
}

interface StepProspectoProps {
  initialData?: Partial<ProspectoData>
  onNext: (data: ProspectoData) => void
  onChange?: (data: Partial<ProspectoData>) => void
  clienteExistente?: boolean
  sectores?: Sector[]
}

export function StepProspecto({ initialData, onNext, onChange, clienteExistente, sectores = [] }: StepProspectoProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty }
  } = useForm({
    resolver: zodResolver(prospectoSchema),
    defaultValues: {
      nombres: initialData?.nombres || '',
      dni: initialData?.dni || '',
      telefono: initialData?.telefono || '',
      direccion: initialData?.direccion || '',
      referencia: initialData?.referencia || '',
      sector_id: initialData?.sector_id || ''
    }
  })

  const watchedValues = watch()

  // Notificar cambios al padre solo tras interacción del usuario.
  // Why: en el mount, watchedValues = defaultValues. Si onChange dispara aquí,
  // sobreescribe wizardState con los defaults (vacíos si no hay initialData),
  // lo que borra el borrador restaurado desde localStorage.
  useEffect(() => {
    if (!isDirty) return
    if (onChange) {
      onChange(watchedValues)
    }
  }, [watchedValues, onChange, isDirty])

  const onSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      await onNext(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
      <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-900/30">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Datos del Prospecto</h2>
            <p className="text-sm text-slate-400">Información del cliente</p>
          </div>
        </div>

        {clienteExistente && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-6">
            <p className="text-xs text-blue-400">ℹ️ Datos pre-cargados de cliente existente</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Nombres Completos */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 ml-1">Nombres Completos *</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input
                {...register('nombres')}
                placeholder="Juan Pérez García"
                disabled={clienteExistente || isSubmitting}
                className={`pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base ${
                  clienteExistente ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              />
            </div>
            {errors.nombres && (
              <p className="text-xs text-red-400 ml-1">{errors.nombres.message as string}</p>
            )}
          </div>

          {/* DNI y Teléfono */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">DNI *</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <Input
                  {...register('dni')}
                  placeholder="12345678"
                  maxLength={8}
                  disabled={clienteExistente || isSubmitting}
                  className={`pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base ${
                    clienteExistente ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
              </div>
              {errors.dni && (
                <p className="text-xs text-red-400 ml-1">{errors.dni.message as string}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Teléfono *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <Input
                  {...register('telefono')}
                  placeholder="999888777"
                  disabled={clienteExistente || isSubmitting}
                  className={`pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base ${
                    clienteExistente ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
              </div>
              {errors.telefono && (
                <p className="text-xs text-red-400 ml-1">{errors.telefono.message as string}</p>
              )}
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 ml-1">Dirección</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
              <Input
                {...register('direccion')}
                placeholder="Av. Principal 123"
                disabled={isSubmitting}
                className="pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base"
              />
            </div>
          </div>

          {/* Sector y Referencia */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Sector *</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <select
                  {...register('sector_id')}
                  disabled={isSubmitting || (clienteExistente && !!initialData?.sector_id)}
                  className={`flex h-12 w-full rounded-xl border border-slate-700 bg-slate-950/50 pl-9 pr-3 py-2 text-base text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none ${
                    (clienteExistente && !!initialData?.sector_id) ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  <option value="">Seleccione un sector...</option>
                  {sectores.map((sec) => (
                    <option key={sec.id} value={sec.id}>{sec.nombre}</option>
                  ))}
                </select>
              </div>
              {errors.sector_id && (
                <p className="text-xs text-red-400 ml-1">{errors.sector_id.message as string}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 ml-1">Referencia</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <Input
                  {...register('referencia')}
                  placeholder="Cerca al mercado"
                  disabled={isSubmitting}
                  className="pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-900/20 border border-purple-400/20 rounded-xl px-8 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
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
