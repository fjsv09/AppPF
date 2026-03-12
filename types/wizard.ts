// Types para el wizard de solicitudes

export interface ProspectoData {
  nombres: string
  dni: string
  telefono: string
  direccion: string
  sector_id: string
  referencia: string
}

export interface EvaluacionData {
  giro_negocio: string
  fuentes_ingresos: string
  ingresos_mensuales: number
  motivo_prestamo: string
  gps_coordenadas: string
  documentos: {
    negocio?: string
    frontis_casa?: string
    recibo_luz_agua?: string
    documentos_negocio?: string
    foto_cliente?: string
    filtro_sentinel?: string
    dni_frontal?: string
    dni_posterior?: string
  }
}

export interface PrestamoData {
  monto_solicitado: number
  interes: number
  cuotas: number
  modalidad: 'diario' | 'semanal' | 'quincenal' | 'mensual'
  fecha_inicio_propuesta: string
}

export interface WizardState {
  currentStep: 1 | 2 | 3
  prospecto: Partial<ProspectoData>
  evaluacion: Partial<EvaluacionData>
  prestamo: Partial<PrestamoData>
  clienteExistenteId?: string
}

export type WizardStep = 1 | 2 | 3  

export interface WizardStepDefinition {
  number: WizardStep
  label: string
  description: string
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { number: 1, label: 'Prospecto', description: 'Datos del Cliente' },
  { number: 2, label: 'Evaluación', description: 'Análisis Financiero' },
  { number: 3, label: 'Préstamo', description: 'Detalles del Crédito' }
]
