'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Stepper } from '@/components/wizard/stepper'
import { StepProspecto } from '@/components/wizard/step-prospecto'
import { StepEvaluacion } from '@/components/wizard/step-evaluacion'
import { StepPrestamo } from '@/components/wizard/step-prestamo'
import { WizardState, WizardStep, ProspectoData, EvaluacionData, PrestamoData, WIZARD_STEPS } from '@/types/wizard'
import { createClient } from '@/utils/supabase/client'
import { BackButton } from '@/components/ui/back-button'

export default function NuevaSolicitudPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('cliente_id')
  const mode = searchParams.get('mode')
  const solicitudId = searchParams.get('id')
  const isEditMode = mode === 'edit' && !!solicitudId

  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 1,
    prospecto: {},
    evaluacion: {},
    prestamo: {},
    clienteExistenteId: clienteId || undefined
  })

  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sectores, setSectores] = useState<any[]>([])
  const [systemSchedule, setSystemSchedule] = useState<any>(null)

  // Cargar datos iniciales (Cliente o Solicitud existente)
  useEffect(() => {
    const loadInitialData = async () => {
      const supabase = createClient()

      try {
        // Cargar sectores activos primero
        const { data: sectoresData, error: sectoresError } = await supabase
          .from('sectores')
          .select('id, nombre')
          .eq('activo', true)
          .order('orden', { ascending: true })
          
        if (!sectoresError && sectoresData) {
            setSectores(sectoresData)
        }

        // Cargar configuración de horario
        const { data: scheduleConfigs } = await supabase
          .from('configuracion_sistema')
          .select('clave, valor')
          .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
        
        const schedule = (scheduleConfigs || []).reduce((acc: any, curr) => {
          acc[curr.clave] = curr.valor
          return acc
        }, { horario_apertura: '07:00', horario_cierre: '20:00', desbloqueo_hasta: '1970-01-01' })
        setSystemSchedule(schedule)

        // CASO 1: Modo Edición de Solicitud
        if (isEditMode) {
          const { data: solicitud, error } = await supabase
            .from('solicitudes')
            .select('*')
            .eq('id', solicitudId)
            .single()

          if (error) throw error

          if (solicitud) {
            setWizardState({
              currentStep: 1,
              clienteExistenteId: solicitud.cliente_id || undefined,
              prospecto: {
                nombres: solicitud.prospecto_nombres || '',
                dni: solicitud.prospecto_dni || '',
                telefono: solicitud.prospecto_telefono || '',
                direccion: solicitud.prospecto_direccion || '',
                sector_id: solicitud.prospecto_sector_id || '',
                referencia: solicitud.prospecto_referencia || ''
              },
              evaluacion: {
                giro_negocio: solicitud.giro_negocio || '',
                fuentes_ingresos: solicitud.fuentes_ingresos || '',
                ingresos_mensuales: solicitud.ingresos_mensuales || 0,
                motivo_prestamo: solicitud.motivo_prestamo || '',
                gps_coordenadas: solicitud.gps_coordenadas || '',
                documentos: solicitud.documentos_evaluacion || {}
              },
              prestamo: {
                monto_solicitado: solicitud.monto_solicitado,
                interes: solicitud.interes,
                cuotas: solicitud.cuotas,
                modalidad: solicitud.modalidad,
                fecha_inicio_propuesta: solicitud.fecha_inicio_propuesta
              }
            })
            // Marcar todos los pasos como completados visualmente para facilitar navegación
            setCompletedSteps([1, 2, 3])
          }
        } 
        // CASO 2: Nueva Solicitud para Cliente Existente
        else if (clienteId) {
          const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', clienteId)
            .single()

          if (error) throw error

          if (cliente) {
            setWizardState((prev) => ({
              ...prev,
              prospecto: {
                nombres: cliente.nombres,
                dni: cliente.dni,
                telefono: cliente.telefono || '',
                direccion: cliente.direccion || '',
                sector_id: cliente.sector_id || '',
                referencia: cliente.referencia || ''
              }
            }))
          }
        }
      } catch (error: any) {
        console.error('Error cargando datos:', error)
        alert(`Error al cargar los datos: ${error.message || 'Error desconocido'}`)
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [clienteId, isEditMode, solicitudId])

  const handleProspectoNext = (data: ProspectoData) => {
    setWizardState((prev) => ({
      ...prev,
      prospecto: data,
      currentStep: 2
    }))
    setCompletedSteps((prev) => Array.from(new Set([...prev, 1])))
  }

  const handleEvaluacionNext = (data: EvaluacionData) => {
    setWizardState((prev) => ({
      ...prev,
      evaluacion: data,
      currentStep: 3
    }))
    setCompletedSteps((prev) => Array.from(new Set([...prev, 2])))
  }

  const handleSubmit = async (data: PrestamoData) => {
    setIsSubmitting(true)

    try {
      // Preparar payload común
      const payload: any = {
        // Datos del préstamo
        monto_solicitado: data.monto_solicitado,
        interes: data.interes,
        cuotas: data.cuotas,
        modalidad: data.modalidad,
        fecha_inicio_propuesta: data.fecha_inicio_propuesta,

        // Datos de evaluación financiera
        giro_negocio: wizardState.evaluacion.giro_negocio,
        fuentes_ingresos: wizardState.evaluacion.fuentes_ingresos,
        ingresos_mensuales: wizardState.evaluacion.ingresos_mensuales,
        motivo_prestamo: wizardState.evaluacion.motivo_prestamo,
        gps_coordenadas: wizardState.evaluacion.gps_coordenadas,
        documentos_evaluacion: wizardState.evaluacion.documentos || {}
      }

      // Si es prospecto nuevo y no tiene ID de cliente, incluir sus datos
      if (!wizardState.clienteExistenteId) {
        payload.prospecto_nombres = wizardState.prospecto.nombres
        payload.prospecto_dni = wizardState.prospecto.dni
        payload.prospecto_telefono = wizardState.prospecto.telefono
        payload.prospecto_direccion = wizardState.prospecto.direccion || null
        payload.prospecto_sector_id = wizardState.prospecto.sector_id || null
        payload.prospecto_referencia = wizardState.prospecto.referencia || null
      }

      let response
      let result

      if (isEditMode) {
        // MODO EDICIÓN: PATCH
        response = await fetch(`/api/solicitudes/${solicitudId}/corregir`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
      } else {
        // MODO CREACIÓN: POST
        if (wizardState.clienteExistenteId) {
            payload.cliente_id = wizardState.clienteExistenteId
        }
        
        response = await fetch('/api/solicitudes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
      }

      result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || (isEditMode ? 'Error al corregir solicitud' : 'Error al crear solicitud'))
      }

      // Redirigir a detalle de solicitud
      const targetId = isEditMode ? solicitudId : result.id
      router.push(`/dashboard/solicitudes/${targetId}?success=true`)
      router.refresh()

    } catch (error: any) {
      console.error('Error procesando solicitud:', error)
      alert(error.message || 'Error al procesar la solicitud. Por favor intente nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    setWizardState((prev) => ({
      ...prev,
      currentStep: Math.max(1, prev.currentStep - 1) as WizardStep
    }))
  }

  const handleCancel = () => {
    if (confirm('¿Está seguro de cancelar? Se perderán los cambios no guardados.')) {
        if (isEditMode) {
            router.push(`/dashboard/solicitudes/${solicitudId}`)
        } else {
            router.push('/dashboard/solicitudes')
        }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando datos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col items-start gap-4">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">
                {isEditMode ? 'Corregir Solicitud' : (wizardState.clienteExistenteId ? 'Nueva Solicitud' : 'Nuevo Prospecto')}
            </h1>
          </div>
          <p className="text-white/60">
            {isEditMode 
                ? 'Modifique la información necesaria y reenvíe la solicitud a supervisión'
                : 'Complete los 3 pasos para registrar la solicitud de crédito'
            }
          </p>
        </div>

        {/* Stepper */}
        <Stepper steps={WIZARD_STEPS} currentStep={wizardState.currentStep} completedSteps={completedSteps} />

        {/* Step Content */}
        <div className="mt-8">
          {wizardState.currentStep === 1 && (
            <StepProspecto
              initialData={wizardState.prospecto}
              onNext={handleProspectoNext}
              clienteExistente={!!wizardState.clienteExistenteId}
              sectores={sectores}
              // En modo edición mantenemos el valor original de "clienteExistente" que viene de la BD
            />
          )}

          {wizardState.currentStep === 2 && (
            <StepEvaluacion
              initialData={wizardState.evaluacion}
              onNext={handleEvaluacionNext}
              onBack={handleBack}
            />
          )}

          {wizardState.currentStep === 3 && (
            <StepPrestamo
              initialData={wizardState.prestamo}
              onNext={handleSubmit}
              onBack={handleBack}
              isSubmitting={isSubmitting}
              systemSchedule={systemSchedule}
            />
          )}
        </div>
      </div>
    </div>
  )
}
