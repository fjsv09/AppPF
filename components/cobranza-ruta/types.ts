export interface AsesorRutaMetrics {
  asesor_id: string
  nombre_asesor: string
  quedan_por_cobrar: number      // S/. pendiente de cuotas hoy+atrasados
  cobraron_en_ruta: number       // S/. cobrado hoy que aplica a cuotas de ruta
  total_cobrado: number          // S/. total cobrado hoy (todos los pagos)
  meta_programada: number        // S/. cuota total programada para hoy
  porcentaje_meta: number        // 0-150 (puede superar 100%)
  estado_badge: 'critico' | 'riesgo' | 'al_dia'
  tendencia: 'up' | 'down' | 'flat'
  clientes_pendientes_count: number
  cobrados_ruta_count: number     // Nº de clientes cobrados en ruta hoy
  pendientes_ruta_count: number   // Nº de clientes pendientes de cobrar hoy
}

export interface ClientePendiente {
  cliente_id: string
  nombre_cliente: string
  monto_pendiente: number
  cuotas_atrasadas: number
  dias_sin_pago: number
}

export interface PagoCobrado {
  cliente_id: string
  nombre_cliente: string
  monto_cobrado: number
  hora_pago: string              // HH:MM (Lima time)
  estado_verificacion: 'pendiente' | 'aprobado' | 'rechazado'
  cuota_numero: number
}

export interface DetalleMetrica {
  tipo: 'quedan' | 'cobraron' | 'total'
  asesor_id: string
  nombre_asesor: string
  clientes_pendientes?: ClientePendiente[]
  pagos_cobrados?: PagoCobrado[]
  resumen_total?: {
    total_cobrado_hoy: number
    total_cobrado_ayer: number
    meta_programada: number
    diferencia_porcentaje: number
  }
}
