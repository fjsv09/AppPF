'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Stepper } from '@/components/wizard/stepper'
import { StepProspecto } from '@/components/wizard/step-prospecto'
import { StepEvaluacion } from '@/components/wizard/step-evaluacion'
import { StepPrestamo } from '@/components/wizard/step-prestamo'
import { WizardState, WizardStep, ProspectoData, EvaluacionData, PrestamoData, WIZARD_STEPS } from '@/types/wizard'
import { createClient } from '@/utils/supabase/client'
import { BackButton } from '@/components/ui/back-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

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
    clienteExistenteId: clienteId || undefined,
    transactionId: typeof window !== 'undefined' ? crypto.randomUUID() : ''
  })

  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sectores, setSectores] = useState<any[]>([])
  const [systemSchedule, setSystemSchedule] = useState<any>(null)

  const [accessResult, setAccessResult] = useState<any>(null)

  // Marca que la hidratación desde localStorage ya corrió. Evita que el
  // useEffect de persistencia escriba el estado vacío y destruya el borrador
  // antes de que la restauración tenga oportunidad de leerlo.
  const hasHydratedRef = useRef(false)

  // Contador para forzar remount de los Step* tras envío exitoso.
  // Necesario porque cada Step usa useForm con defaultValues, que solo se aplican
  // al montar — sin remount, los inputs mantienen los valores del envío anterior
  // aunque el wizardState del padre ya esté reseteado.
  const [formInstance, setFormInstance] = useState(0)

  // Detecta si el wizardState tiene datos reales del usuario (no defaults vacíos)
  const hasContent = (state: WizardState): boolean => {
    return !!(
      state.prospecto?.nombres ||
      state.prospecto?.dni ||
      state.prospecto?.telefono ||
      state.prospecto?.direccion ||
      state.prospecto?.referencia ||
      state.evaluacion?.giro_negocio ||
      state.evaluacion?.fuentes_ingresos ||
      state.evaluacion?.motivo_prestamo ||
      state.evaluacion?.ingresos_mensuales ||
      state.prestamo?.monto_solicitado ||
      state.prestamo?.cuotas
    )
  }

  // Cargar datos iniciales (Cliente o Solicitud existente)
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true)
      // [IMPORTANTE] Resetear el estado al iniciar carga para evitar que datos 
      // de una solicitud previa (o cliente anterior) se queden grabados.
      setWizardState(prev => ({
        currentStep: 1,
        prospecto: {},
        evaluacion: {},
        prestamo: {},
        clienteExistenteId: clienteId || undefined,
        transactionId: prev.transactionId || (typeof window !== 'undefined' ? crypto.randomUUID() : '')
      }))
      setCompletedSteps([])
      setFormInstance(prev => prev + 1)

      const supabase = createClient()

      try {
        // 0. VERIFICAR ACCESO AL SISTEMA (Centralizado)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        // Obtener rol del perfil
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('rol')
          .eq('id', user.id)
          .single()
        
        const userRole = perfil?.rol || 'asesor'

        // Verificar acceso
        const { checkSystemAccess } = await import('@/utils/systemRestrictions')
        const access = await checkSystemAccess(supabase, user.id, userRole, 'solicitud')
        setAccessResult(access)

        if (!access.allowed && userRole !== 'admin') {
          setIsLoading(false)
          return
        }

        // 1. Cargar sectores activos vía API
        try {
            const sectoresRes = await fetch('/api/sectores')
            const sectoresData = await sectoresRes.json()
            if (sectoresRes.ok) {
                setSectores(sectoresData)
            }
        } catch (err) {
            console.error('Error en fetch sectores:', err)
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
            .select('*, clientes(limite_prestamo)')
            .eq('id', solicitudId)
            .single()

          if (error) throw error

          if (solicitud) {
            setWizardState({
              currentStep: 1,
              clienteExistenteId: solicitud.cliente_id || undefined,
              clienteLimit: (solicitud.clientes as any)?.limite_prestamo || 0,
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
            setCompletedSteps([1, 2, 3])
          }
        } 
        // CASO 2: Nueva Solicitud para Cliente Existente
        else if (clienteId) {
          const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*, sectores(nombre)')
            .eq('id', clienteId)
            .single()

          if (error) throw error
          if (cliente) {
            setWizardState({
              currentStep: 1,
              clienteLimit: cliente.limite_prestamo || 0,
              prospecto: {
                nombres: cliente.nombres,
                dni: cliente.dni,
                telefono: cliente.telefono,
                direccion: cliente.direccion || '',
                referencia: cliente.referencia || '',
                sector_id: cliente.sector_id || ''
              },
              evaluacion: {}, // Limpieza explícita
              prestamo: {},   // Limpieza explícita
              clienteExistenteId: clienteId
            })
          }
        }
      } catch (error: any) {
        console.error('Error loading initial data:', error)
        toast.error('Error al cargar datos')
      } finally {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [clienteId, isEditMode, solicitudId, router])

  const handleReset = () => {
    if (window.confirm('¿Estás seguro de que deseas limpiar todo el formulario? Se perderán los datos no enviados.')) {
      setWizardState({
        currentStep: 1,
        prospecto: {},
        evaluacion: {},
        prestamo: {},
        clienteExistenteId: undefined,
        transactionId: crypto.randomUUID()
      })
      setCompletedSteps([])
      setFormInstance(prev => prev + 1)
      localStorage.removeItem('borrador_solicitud')
      toast.info('Formulario reiniciado')
    }
  }

  // Lógica de Persistencia (Borradores Inteligentes)
  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoading && !isEditMode) {
      const saved = localStorage.getItem('borrador_solicitud')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          const savedContext = parsed?.context || null
          const currentContext = clienteId || 'new_prospect'

          if (savedContext === currentContext && parsed?.state && hasContent(parsed.state)) {
            setWizardState(parsed.state)
            if (parsed.steps) setCompletedSteps(parsed.steps)
            // Remontar los Step* para que useForm tome los defaultValues restaurados
            setFormInstance(prev => prev + 1)

            toast.success('Borrador recuperado', {
              description: 'Se han restaurado los datos anteriores.',
              action: {
                label: 'Limpiar',
                onClick: () => {
                   setWizardState({ currentStep: 1, prospecto: {}, evaluacion: {}, prestamo: {} })
                   setCompletedSteps([])
                   setFormInstance(prev => prev + 1)
                   localStorage.removeItem('borrador_solicitud')
                }
              }
            })
          } else if (savedContext !== currentContext) {
            console.log('Borrador ignorado: pertenece a otro contexto')
          }
        } catch (e) {
          console.error('Error al restaurar borrador:', e)
        }
      }
      // La hidratación corrió (con o sin borrador). Recién ahora autorizamos
      // al efecto de persistencia a escribir en localStorage.
      hasHydratedRef.current = true
    }
  }, [isLoading, isEditMode, clienteId])

  useEffect(() => {
    if (typeof window !== 'undefined' && !isEditMode && !isLoading && hasHydratedRef.current) {
      const currentContext = clienteId || 'new_prospect'

      if (hasContent(wizardState)) {
        const data = {
          state: wizardState,
          steps: completedSteps,
          context: currentContext, // Guardamos el contexto para validación
          timestamp: new Date().getTime()
        }
        localStorage.setItem('borrador_solicitud', JSON.stringify(data))
      } else {
        // Solo remover si realmente está vacío (el reseteo inicial no debería disparar esto si isLoading es true)
        localStorage.removeItem('borrador_solicitud')
      }
    }
  }, [wizardState, completedSteps, isEditMode, clienteId, isLoading])

  const handleProspectoNext = (data: ProspectoData) => {
    setWizardState((prev) => ({
      ...prev,
      prospecto: data,
      currentStep: 2
    }))
    setCompletedSteps((prev) => Array.from(new Set([...prev, 1])))
  }

  const handleStepDataChange = useCallback((step: 'prospecto' | 'evaluacion' | 'prestamo', data: any) => {
    setWizardState((prev) => ({
      ...prev,
      [step]: { ...prev[step], ...data }
    }))
  }, [])

  const handleProspectoChange = useCallback((data: any) => handleStepDataChange('prospecto', data), [handleStepDataChange])
  const handleEvaluacionChange = useCallback((data: any) => handleStepDataChange('evaluacion', data), [handleStepDataChange])
  const handlePrestamoChange = useCallback((data: any) => handleStepDataChange('prestamo', data), [handleStepDataChange])

  const handleEvaluacionNext = (data: EvaluacionData) => {
    setWizardState((prev) => ({
      ...prev,
      evaluacion: data,
      currentStep: 3
    }))
    setCompletedSteps((prev) => Array.from(new Set([...prev, 2])))
  }

  const handleSubmit = async (data: PrestamoData) => {
    if (isSubmitting) return;
    setIsSubmitting(true)
    
    // Notificación de carga inmediata
    const toastId = toast.loading('Enviando solicitud al servidor...', {
      description: 'Por favor, no cierre ni refresque la página.'
    })

    try {
      const payload: any = {
        transaction_id: wizardState.transactionId, // Enviamos el ID de transacción
        monto_solicitado: data.monto_solicitado,
        interes: data.interes,
        cuotas: data.cuotas,
        modalidad: data.modalidad,
        fecha_inicio_propuesta: data.fecha_inicio_propuesta,

        giro_negocio: wizardState.evaluacion.giro_negocio,
        fuentes_ingresos: wizardState.evaluacion.fuentes_ingresos,
        ingresos_mensuales: wizardState.evaluacion.ingresos_mensuales,
        motivo_prestamo: wizardState.evaluacion.motivo_prestamo,
        gps_coordenadas: wizardState.evaluacion.gps_coordenadas,
        documentos_evaluacion: wizardState.evaluacion.documentos || {}
      }

      if (!wizardState.clienteExistenteId) {
        payload.prospecto_nombres = wizardState.prospecto.nombres
        payload.prospecto_dni = wizardState.prospecto.dni
        payload.prospecto_telefono = wizardState.prospecto.telefono
        payload.prospecto_direccion = wizardState.prospecto.direccion || null
        payload.prospecto_sector_id = wizardState.prospecto.sector_id || null
        payload.prospecto_referencia = wizardState.prospecto.referencia || null
      }

      let response
      if (isEditMode) {
        response = await fetch(`/api/solicitudes/${solicitudId}/corregir`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
      } else {
        if (wizardState.clienteExistenteId) {
            payload.cliente_id = wizardState.clienteExistenteId
        }
        response = await fetch('/api/solicitudes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error en el servidor')
      }

      // ÉXITO
      toast.success('¡Solicitud enviada!', {
        id: toastId,
        description: 'La solicitud ha sido registrada correctamente.'
      })

      if (typeof window !== 'undefined') {
        localStorage.removeItem('borrador_solicitud')
      }
      
      // Limpiar estado para la siguiente solicitud
      setWizardState({
        currentStep: 1,
        prospecto: {},
        evaluacion: {},
        prestamo: {},
        clienteExistenteId: clienteId || undefined,
        transactionId: crypto.randomUUID()
      })
      setCompletedSteps([])
      setFormInstance((n) => n + 1)

      const targetId = isEditMode ? solicitudId : result.id
      router.push(`/dashboard/solicitudes/${targetId}?success=true`)
      router.refresh()

    } catch (error: any) {
      console.error('Error procesando solicitud:', error)
      toast.error('Error al enviar', {
        id: toastId,
        description: error.message || 'Intente nuevamente en unos momentos.'
      })
      setIsSubmitting(false)
    } finally {
        // Aseguramos que el estado de carga se libere si no hubo navegación
        // (Aunque el router.push suele ser suficiente, esto es por seguridad)
        setTimeout(() => setIsSubmitting(false), 5000)
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
        if (typeof window !== 'undefined') {
            localStorage.removeItem('borrador_solicitud')
        }
        if (isEditMode) {
            router.push(`/dashboard/solicitudes/${solicitudId}`)
        } else {
            router.push('/dashboard/solicitudes')
        }
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400 font-medium">Verificando acceso al sistema...</p>
        </div>
      </div>
    )
  }

  // PANTALLA DE BLOQUEO (Si no se permite acceso)
  if (accessResult && !accessResult.allowed) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
            <Lock className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Acceso Restringido</h2>
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800 mb-6">
            <p className="text-slate-300 text-sm leading-relaxed">
              {accessResult.reason || "El sistema se encuentra temporalmente cerrado o requiere un cuadre previo."}
            </p>
          </div>
          <div className="space-y-3">
            <Button 
                onClick={() => router.push('/dashboard/solicitudes')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-xl h-12"
            >
              Volver a Solicitudes
            </Button>
            {accessResult.code === 'MISSING_MORNING_CUADRE' && (
                <Button 
                    variant="outline"
                    onClick={() => router.push('/dashboard/cuadre')}
                    className="w-full border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 rounded-xl h-12"
                >
                    Ir a Cuadre de Caja
                </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
              {isEditMode ? 'Editar Solicitud' : 'Nueva Solicitud'}
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] uppercase font-black tracking-widest">
                Wizard v2.0
              </Badge>
            </h1>
            <p className="text-slate-400 mt-1 text-sm sm:text-base">
              {isEditMode 
                ? 'Modifica los datos de la solicitud seleccionada' 
                : 'Completa los pasos para registrar un nuevo prospecto y su evaluación financiera.'}
            </p>
          </div>
          
          {!isEditMode && hasContent(wizardState) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleReset}
              disabled={isSubmitting}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-10 rounded-xl px-4 gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Limpiar Formulario
            </Button>
          )}
        </div>

        {/* Stepper */}
        <Stepper steps={WIZARD_STEPS} currentStep={wizardState.currentStep} completedSteps={completedSteps} />

        {/* Step Content */}
        <div className="mt-8">
          {wizardState.currentStep === 1 && (
            <StepProspecto
              key={`prospecto-${formInstance}`}
              initialData={wizardState.prospecto}
              onNext={handleProspectoNext}
              onChange={handleProspectoChange}
              clienteExistente={!!wizardState.clienteExistenteId}
              sectores={sectores}
            />
          )}

          {wizardState.currentStep === 2 && (
            <StepEvaluacion
              key={`evaluacion-${formInstance}`}
              initialData={wizardState.evaluacion}
              onNext={handleEvaluacionNext}
              onChange={handleEvaluacionChange}
              onBack={handleBack}
            />
          )}

          {wizardState.currentStep === 3 && (
            <StepPrestamo
              key={`prestamo-${formInstance}`}
              initialData={wizardState.prestamo}
              onNext={handleSubmit}
              onChange={handlePrestamoChange}
              onBack={handleBack}
              isSubmitting={isSubmitting}
              systemSchedule={systemSchedule}
              clienteLimit={wizardState.clienteLimit}
            />
          )}
        </div>
      </div>
  )
}
