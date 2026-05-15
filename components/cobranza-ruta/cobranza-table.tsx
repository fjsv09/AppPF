'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AsesorRutaMetrics } from './types'

interface Props {
  asesores: AsesorRutaMetrics[]
  selectedAsesorId: string | null
  selectedMetric: 'quedan' | 'cobraron' | 'total' | null
  onMetricClick: (asesorId: string, metric: 'quedan' | 'cobraron' | 'total') => void
}

function formatSolesCompact(n: number) {
  if (n >= 1000) return `S/ ${(n / 1000).toFixed(1)}K`
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function BadgeEstado({ estado }: { estado: AsesorRutaMetrics['estado_badge'] }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      estado === 'al_dia' && "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50",
      estado === 'riesgo' && "bg-amber-900/40 text-amber-400 border border-amber-800/50",
      estado === 'critico' && "bg-red-900/40 text-red-400 border border-red-800/50"
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full mr-1.5",
        estado === 'al_dia' && "bg-emerald-400",
        estado === 'riesgo' && "bg-amber-400",
        estado === 'critico' && "bg-red-400 animate-pulse"
      )} />
      {estado === 'al_dia' ? 'Al día' : estado === 'riesgo' ? 'En riesgo' : 'Crítico'}
    </span>
  )
}

function TendenciaIcon({ tendencia }: { tendencia: AsesorRutaMetrics['tendencia'] }) {
  if (tendencia === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
  if (tendencia === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />
  return <Minus className="w-3.5 h-3.5 text-slate-500" />
}

function MetricCell({ value, metric, asesorId, selectedAsesorId, selectedMetric, onClick }: {
  value: string
  metric: 'quedan' | 'cobraron' | 'total'
  asesorId: string
  selectedAsesorId: string | null
  selectedMetric: 'quedan' | 'cobraron' | 'total' | null
  onClick: () => void
}) {
  const isSelected = selectedAsesorId === asesorId && selectedMetric === metric
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-sm font-mono font-semibold px-2 py-1 rounded transition-all",
        "hover:bg-white/10 hover:text-white cursor-pointer text-right w-full",
        isSelected ? "bg-blue-900/40 text-blue-300 ring-1 ring-blue-700/50" : "text-slate-200"
      )}
    >
      {value}
    </button>
  )
}

export function CobranzaTable({ asesores, selectedAsesorId, selectedMetric, onMetricClick }: Props) {
  if (asesores.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        Sin asesores disponibles
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {/* Desktop table */}
      <table className="w-full hidden md:table">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Asesor</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Quedan</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Cobraron</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Total Hoy</th>
            <th className="text-center text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Estado</th>
            <th className="text-center text-xs text-slate-400 uppercase tracking-wider py-3 px-2">Tend.</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">% Meta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {asesores.map(asesor => (
            <tr
              key={asesor.asesor_id}
              className={cn(
                "hover:bg-white/5 transition-colors",
                selectedAsesorId === asesor.asesor_id && "bg-white/5"
              )}
            >
              <td className="py-3 px-4">
                <p className="text-sm font-medium text-white">{asesor.nombre_asesor}</p>
                {asesor.clientes_pendientes_count > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">{asesor.clientes_pendientes_count} con deuda</p>
                )}
              </td>
              <td className="py-3 px-4">
                <MetricCell
                  value={formatSolesCompact(asesor.quedan_por_cobrar)}
                  metric="quedan"
                  asesorId={asesor.asesor_id}
                  selectedAsesorId={selectedAsesorId}
                  selectedMetric={selectedMetric}
                  onClick={() => onMetricClick(asesor.asesor_id, 'quedan')}
                />
              </td>
              <td className="py-3 px-4">
                <MetricCell
                  value={formatSolesCompact(asesor.cobraron_en_ruta)}
                  metric="cobraron"
                  asesorId={asesor.asesor_id}
                  selectedAsesorId={selectedAsesorId}
                  selectedMetric={selectedMetric}
                  onClick={() => onMetricClick(asesor.asesor_id, 'cobraron')}
                />
              </td>
              <td className="py-3 px-4">
                <MetricCell
                  value={formatSolesCompact(asesor.total_cobrado)}
                  metric="total"
                  asesorId={asesor.asesor_id}
                  selectedAsesorId={selectedAsesorId}
                  selectedMetric={selectedMetric}
                  onClick={() => onMetricClick(asesor.asesor_id, 'total')}
                />
              </td>
              <td className="py-3 px-4 text-center">
                <BadgeEstado estado={asesor.estado_badge} />
              </td>
              <td className="py-3 px-2 text-center">
                <TendenciaIcon tendencia={asesor.tendencia} />
              </td>
              <td className="py-3 px-4 text-right">
                <span className={cn(
                  "text-sm font-bold",
                  asesor.porcentaje_meta >= 85 ? "text-emerald-400" :
                  asesor.porcentaje_meta >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {asesor.porcentaje_meta.toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: lista compacta */}
      <div className="md:hidden space-y-2">
        {asesores.map(asesor => (
          <div
            key={asesor.asesor_id}
            className={cn(
              "p-3 rounded-lg bg-white/5 border border-white/10",
              selectedAsesorId === asesor.asesor_id && "border-blue-700/50 bg-blue-900/10"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white">{asesor.nombre_asesor}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <BadgeEstado estado={asesor.estado_badge} />
                  <TendenciaIcon tendencia={asesor.tendencia} />
                </div>
              </div>
              <button
                onClick={() => onMetricClick(asesor.asesor_id, 'total')}
                className={cn(
                  "text-right rounded-md transition-all",
                  selectedAsesorId === asesor.asesor_id && selectedMetric === 'total' && "ring-1 ring-blue-500/50"
                )}
              >
                <p className="text-lg font-bold text-white">{formatSolesCompact(asesor.total_cobrado)}</p>
                <p className={cn(
                  "text-xs font-semibold",
                  asesor.porcentaje_meta >= 85 ? "text-emerald-400" :
                  asesor.porcentaje_meta >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {asesor.porcentaje_meta.toFixed(0)}% de meta
                </p>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onMetricClick(asesor.asesor_id, 'quedan')}
                className={cn(
                  "p-2 rounded bg-white/5 hover:bg-white/10 text-left transition-colors",
                  selectedAsesorId === asesor.asesor_id && selectedMetric === 'quedan' && "bg-blue-900/30 ring-1 ring-blue-700/50"
                )}
              >
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Quedan</p>
                <p className="text-sm font-semibold text-white">{formatSolesCompact(asesor.quedan_por_cobrar)}</p>
              </button>
              <button
                onClick={() => onMetricClick(asesor.asesor_id, 'cobraron')}
                className={cn(
                  "p-2 rounded bg-white/5 hover:bg-white/10 text-left transition-colors",
                  selectedAsesorId === asesor.asesor_id && selectedMetric === 'cobraron' && "bg-blue-900/30 ring-1 ring-blue-700/50"
                )}
              >
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cobraron</p>
                <p className="text-sm font-semibold text-emerald-400">{formatSolesCompact(asesor.cobraron_en_ruta)}</p>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
