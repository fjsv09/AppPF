// components/cobranza-ruta/asesor-metrics-details.tsx
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Clock, TrendingUp, TrendingDown, Minus, Users, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { DetalleMetrica } from './types'
import { cn } from '@/lib/utils'

interface Props {
  detalle: DetalleMetrica | null
  loading: boolean
}

function formatSoles(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AsesorMetricsDetails({ detalle, loading }: Props) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (!detalle) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
        <Users className="w-8 h-8 opacity-40" />
        <p className="text-sm">Selecciona una métrica para ver detalles</p>
      </div>
    )
  }

  const titulo = {
    quedan: 'Clientes con Deuda Pendiente',
    cobraron: 'Pagos Cobrados en Ruta',
    total: 'Resumen Total del Día'
  }[detalle.tipo]

  return (
    <div className="flex flex-col h-full">
      {/* Header del detalle */}
      <div className="p-4 border-b border-white/10">
        <p className="text-xs text-slate-400 uppercase tracking-wider">{detalle.nombre_asesor}</p>
        <h3 className="text-white font-semibold mt-0.5">{titulo}</h3>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">

        {/* Tipo: quedan */}
        {detalle.tipo === 'quedan' && detalle.clientes_pendientes && (
          detalle.clientes_pendientes.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="text-sm">¡Sin deuda pendiente!</p>
            </div>
          ) : (
            detalle.clientes_pendientes.map((c) => (
              <div key={c.cliente_id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{c.nombre_cliente}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {c.cuotas_atrasadas > 0 ? `${c.cuotas_atrasadas} cuota${c.cuotas_atrasadas > 1 ? 's' : ''} atrasada${c.cuotas_atrasadas > 1 ? 's' : ''}` : 'Cuota actual'}
                    {c.dias_sin_pago > 0 && ` · ${c.dias_sin_pago}d sin pago`}
                  </p>
                </div>
                <span className={cn(
                  "text-sm font-bold ml-3 shrink-0",
                  c.dias_sin_pago > 7 ? "text-red-400" : c.dias_sin_pago > 3 ? "text-amber-400" : "text-white"
                )}>
                  {formatSoles(c.monto_pendiente)}
                </span>
              </div>
            ))
          )
        )}

        {/* Tipo: cobraron */}
        {detalle.tipo === 'cobraron' && detalle.pagos_cobrados && (
          detalle.pagos_cobrados.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm">Sin cobros registrados</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-slate-400 mb-3">
                {detalle.pagos_cobrados.length} pago{detalle.pagos_cobrados.length > 1 ? 's' : ''} registrado{detalle.pagos_cobrados.length > 1 ? 's' : ''}
              </div>
              {detalle.pagos_cobrados.map((p, i) => (
                <div key={`${p.cliente_id}-${p.cuota_numero ?? i}-${p.hora_pago}`} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{p.nombre_cliente}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-400">{p.hora_pago}</span>
                      <Badge variant={p.estado_verificacion === 'aprobado' ? 'default' : 'secondary'} className="text-[10px] h-4">
                        {p.estado_verificacion === 'aprobado' ? 'Verificado' : 'Pendiente'}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 ml-3 shrink-0">
                    +{formatSoles(p.monto_cobrado)}
                  </span>
                </div>
              ))}
            </>
          )
        )}

        {/* Tipo: total */}
        {detalle.tipo === 'total' && !detalle.resumen_total && (
          <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm">No hay datos de resumen disponibles</p>
          </div>
        )}
        {detalle.tipo === 'total' && detalle.resumen_total && (
          <div className="space-y-4">
            {/* Comparativo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-400">Cobrado Hoy</p>
                <p className="text-lg font-bold text-white mt-1">{formatSoles(detalle.resumen_total.total_cobrado_hoy)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-400">Cobrado Ayer</p>
                <p className="text-lg font-bold text-slate-300 mt-1">{formatSoles(detalle.resumen_total.total_cobrado_ayer)}</p>
              </div>
            </div>

            {/* Meta */}
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-slate-400">Meta Programada Hoy</p>
              <p className="text-lg font-bold text-white mt-1">{formatSoles(detalle.resumen_total.meta_programada)}</p>
            </div>

            {/* Diferencia vs ayer */}
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg",
              detalle.resumen_total.diferencia_porcentaje > 0 ? "bg-emerald-900/20" :
              detalle.resumen_total.diferencia_porcentaje < 0 ? "bg-red-900/20" : "bg-white/5"
            )}>
              {detalle.resumen_total.diferencia_porcentaje > 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : detalle.resumen_total.diferencia_porcentaje < 0 ? (
                <TrendingDown className="w-5 h-5 text-red-400" />
              ) : (
                <Minus className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <p className="text-sm font-medium text-white">
                  {detalle.resumen_total.diferencia_porcentaje > 0 ? '+' : ''}{detalle.resumen_total.diferencia_porcentaje}% vs ayer
                </p>
                <p className="text-xs text-slate-400">vs. día anterior completo</p>
              </div>
            </div>

            {/* Pagos individuales */}
            {detalle.pagos_cobrados && detalle.pagos_cobrados.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Detalle de Pagos</p>
                {detalle.pagos_cobrados.map((p, i) => (
                  <div key={`${p.cliente_id}-${p.cuota_numero ?? i}-${p.hora_pago}`} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{p.nombre_cliente}</p>
                      <p className="text-xs text-slate-400">{p.hora_pago}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400 ml-2">{formatSoles(p.monto_cobrado)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
