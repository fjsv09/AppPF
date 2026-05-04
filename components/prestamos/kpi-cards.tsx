'use client'

import { useMemo } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Wallet, TrendingUp, AlertCircle, Users } from 'lucide-react'
import { calculateMoraBancaria } from '@/lib/financial-logic'
import { cn } from '@/lib/utils'

interface KpiCardsProps {
  prestamos: any[]
  prestamosGlobal?: any[]
  perfiles: any[]
  userRole: string
  prestamoIdsProductoRefinanciamiento: string[]
  today: string
  umbralCpp: number
  umbralMoroso: number
  umbralCppOtros: number
  umbralMorosoOtros: number
}

export function KpiCards({
  prestamos,
  prestamosGlobal,
  perfiles,
  userRole,
  prestamoIdsProductoRefinanciamiento,
  today,
  umbralCpp,
  umbralMoroso,
  umbralCppOtros,
  umbralMorosoOtros,
}: KpiCardsProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const filtroSupervisor = searchParams.get('supervisor') || 'todos'
  const filtroAsesor = searchParams.get('asesor') || 'todos'
  const filtroSector = searchParams.get('sector') || 'todos'
  const filtroFrecuencia = searchParams.get('frecuencia') || 'todos'
  const activeTab = searchParams.get('tab') || ''

  const buildHref = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    params.set('page', '1')
    return `${pathname}?${params.toString()}`
  }

  const asesorSupervisorMap = useMemo(() => {
    const map: Record<string, string> = {}
    perfiles.forEach((p: any) => {
      if (p.supervisor_id) map[p.id] = p.supervisor_id
    })
    return map
  }, [perfiles])

  const filtered = useMemo(() => {
    let list = prestamos

    if (filtroSupervisor !== 'todos' && (userRole === 'admin' || userRole === 'secretaria')) {
      list = list.filter(p => {
        const aid = p.asesor_id || p.clientes?.asesor_id
        return asesorSupervisorMap[aid] === filtroSupervisor
      })
    }
    if (filtroAsesor !== 'todos') {
      list = list.filter(p => (p.asesor_id || p.clientes?.asesor_id) === filtroAsesor)
    }
    if (filtroSector !== 'todos') {
      list = list.filter(p => {
        const sid = p.clientes?.sector_id || p.clientes?.sectores?.id
        return sid === filtroSector
      })
    }
    if (filtroFrecuencia !== 'todos') {
      list = list.filter(p => p.frecuencia === filtroFrecuencia)
    }

    return list
  }, [prestamos, filtroSupervisor, filtroAsesor, filtroSector, filtroFrecuencia, asesorSupervisorMap, userRole])

  const kpis = useMemo(() => {
    // Check if any filters are active (not 'todos')
    const hasActiveFilters = filtroSupervisor !== 'todos' || filtroAsesor !== 'todos' ||
                            filtroSector !== 'todos' || filtroFrecuencia !== 'todos'

    // When no filters are applied, use ALL prestamos (complete portfolio); otherwise use filtered list
    // This ensures KPI shows complete role-based totals, not just table-filtered view
    const baseForKpi = hasActiveFilters ? filtered : prestamos

    // DEBUG: Log data sizes
    if (typeof window !== 'undefined') {
      console.log('🔍 KPI Debug:', {
        prestamosLength: prestamos.length,
        filteredLength: filtered.length,
        baseForKpiLength: baseForKpi.length,
        hasActiveFilters,
        filtroSupervisor, filtroAsesor, filtroSector, filtroFrecuencia
      })
    }

    // For KPI calculations: include all states when no filters applied, only active/risk when filters applied
    const relevant = hasActiveFilters
      ? baseForKpi.filter(p => ['activo', 'legal', 'vencido', 'moroso', 'cpp'].includes(p.estado))
      : baseForKpi

    // META HOY debe incluir TODAS las cuotas vencidas hoy sin importar estado
    // Usar baseForKpi directamente para no excluir finalizados, renovados, etc.
    const metaCobranzaHoy = baseForKpi.reduce((acc, p) => acc + (p.cuota_dia_programada || 0), 0)
    const recaudadoRutaHoy = baseForKpi.reduce((acc, p) => acc + (p.cobrado_ruta_hoy || 0), 0)
    const totalClientesHoy = baseForKpi.filter(p => (p.cuota_dia_programada || 0) > 0).length
    const clientesPendientesHoy = baseForKpi.filter(p => (p.cuota_dia_hoy || 0) > 0).length
    const clientesCobradosHoy = totalClientesHoy - clientesPendientesHoy

    // Active loans - mirrors server logic - use baseForKpi for complete count
    const clientesMap = new Map<string, any[]>()
    baseForKpi.forEach(p => {
      const cId = p.cliente_id
      if (!cId) return
      if (!clientesMap.has(cId)) clientesMap.set(cId, [])
      clientesMap.get(cId)!.push(p)
    })
    const activeLoans = Array.from(clientesMap.entries()).filter(([, loans]) => {
      const cliente = loans[0]?.clientes
      if (!!cliente?.bloqueado_renovacion) return false
      const main = loans.find((p: any) =>
        p.estado === 'activo' &&
        !p.es_paralelo &&
        !prestamoIdsProductoRefinanciamiento.includes(p.id)
      )
      if (!main) return false
      if (main.estado_mora === 'vencido') return false
      return (main.metrics?.saldoPendiente || 0) > 0.01
    }).length

    const oportunidadesRenovacion = baseForKpi.filter(p => p.es_renovable_estricto).length

    let metaEficienciaTotal = 0
    let cobradoEficienciaTotal = 0
    relevant.forEach(p => {
      metaEficienciaTotal += p.metrics?.metaTotalHoyYAtrasados || 0
      cobradoEficienciaTotal += p.metrics?.cobradoTotalHoyYAtrasados || 0
    })
    const porcentajeEficiencia = metaEficienciaTotal > 0
      ? (cobradoEficienciaTotal / metaEficienciaTotal) * 100
      : 0

    const moraBancaria = calculateMoraBancaria(prestamosGlobal || relevant, today)

    const totalPagado = baseForKpi.reduce((acc, p) => acc + (p.total_pagado_acumulado || 0), 0)
    const totalDeuda = baseForKpi.reduce((acc, p) =>
      acc + (parseFloat(p.monto) * (1 + parseFloat(p.interes) / 100)), 0) || 1
    const porcentajeRecuperacion = (totalPagado / totalDeuda) * 100

    const alertasGraves = baseForKpi.filter(p => p.metrics?.isCritico).length
    const clientesEnMora = baseForKpi.filter(p => p.metrics?.isMora).length

    return {
      metaCobranzaHoy, recaudadoRutaHoy,
      totalClientesHoy, clientesCobradosHoy,
      activeLoans, oportunidadesRenovacion,
      metaEficienciaTotal, cobradoEficienciaTotal, porcentajeEficiencia,
      tasaMorosidadCapital: moraBancaria.tasaMorosidadCapital,
      capitalEnRiesgo: moraBancaria.capitalVencido,
      totalPagado, porcentajeRecuperacion,
      alertasGraves, clientesEnMora,
    }
  }, [prestamos, filtered, filtroSupervisor, filtroAsesor, filtroSector, filtroFrecuencia, prestamosGlobal, prestamoIdsProductoRefinanciamiento, today])

  const isAdmin = userRole === 'admin' || userRole === 'secretaria'

  return (
    <>
      <div className={cn(
        "grid grid-cols-2 gap-2 md:gap-4 mb-6",
        isAdmin ? "lg:grid-cols-6" : "lg:grid-cols-5"
      )}>
        {/* Meta Hoy */}
        <Link href={buildHref('ruta_hoy')} className={cn(
          "bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px] hover:bg-[#0d1421] transition-all group",
          activeTab === 'ruta_hoy' && "border-[#10b981]/40 ring-1 ring-[#10b981]/20"
        )}>
          <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
            <Wallet className="w-20 h-20 md:w-24 md:h-24 text-white" />
          </div>
          <div className="relative z-10">
            <p className="text-[#10b981] font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Meta Hoy</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-2xl font-black text-white tracking-tighter">${kpis.recaudadoRutaHoy.toLocaleString()}</span>
              <span className="text-slate-600 text-[9px] md:text-sm font-medium">/ ${kpis.metaCobranzaHoy.toLocaleString()}</span>
            </div>
          </div>
          <div className="relative z-10 mt-1 md:mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-all duration-1000 ease-out"
                  style={{ width: `${kpis.metaCobranzaHoy > 0 ? Math.min(100, (kpis.recaudadoRutaHoy / kpis.metaCobranzaHoy) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[#10b981] font-bold text-[7px] md:text-[9px] flex items-center gap-1 shrink-0">
                <span>{kpis.metaCobranzaHoy > 0 ? Math.round((kpis.recaudadoRutaHoy / kpis.metaCobranzaHoy) * 100) : 0}%</span>
              </p>
            </div>
            <div className="flex">
              <span className="bg-[#10b981]/10 text-[#10b981] text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-[#10b981]/20 uppercase tracking-wider mt-1">
                {kpis.clientesCobradosHoy} de {kpis.totalClientesHoy} Préstamos
              </span>
            </div>
          </div>
        </Link>

        {/* ACTIVOS */}
        <Link href={buildHref('activos')} className={cn(
          "bg-[#090e16] border border-emerald-500/20 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px] hover:bg-[#0d1421] hover:border-emerald-500/40 transition-all group",
          activeTab === 'activos' && "border-emerald-500/50 ring-1 ring-emerald-500/25"
        )}>
          <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
            <Users className="w-20 h-20 md:w-24 md:h-24 text-emerald-500" />
          </div>
          <div className="relative z-10">
            <p className="text-emerald-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">ACTIVOS</p>
            <h2 className="text-lg md:text-2xl font-black text-white tracking-tighter">{kpis.activeLoans}</h2>
          </div>
          <div className="relative z-10 mt-1 md:mt-2 space-y-1.5">
            <div className="flex">
              <span className="bg-emerald-500/10 text-emerald-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider mt-1">
                COBRANZA VIGENTE
              </span>
            </div>
          </div>
        </Link>

        {/* Eficiencia Cobro */}
        <div className="bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px] hover:bg-[#0d1421] transition-all group">
          <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
            <TrendingUp className="w-20 h-20 md:w-24 md:h-24 text-white" />
          </div>
          <div className="relative z-10">
            <p className="text-blue-400 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Eficiencia Cobro</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-2xl font-black text-white tracking-tighter">${kpis.cobradoEficienciaTotal.toLocaleString()}</span>
              <span className="text-slate-600 text-[9px] md:text-sm font-medium">/ ${kpis.metaEficienciaTotal.toLocaleString()}</span>
            </div>
          </div>
          <div className="relative z-10 mt-1 md:mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(100, kpis.porcentajeEficiencia)}%` }}
                />
              </div>
              <p className="text-blue-400 font-bold text-[7px] md:text-[9px] flex items-center gap-1 shrink-0">
                <span>{kpis.porcentajeEficiencia.toFixed(0)}%</span>
              </p>
            </div>
            <div className="flex">
              <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider mt-1">
                Hoy + Atrasados
              </span>
            </div>
          </div>
        </div>

        {/* Renovaciones */}
        <Link href={buildHref('renovaciones')} className={cn(
          "bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between hover:bg-[#0d1421] transition-all group min-h-[90px] md:min-h-[120px]",
          activeTab === 'renovaciones' && "border-amber-500/40 ring-1 ring-amber-500/20"
        )}>
          <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
            <TrendingUp className="w-20 h-20 md:w-24 md:h-24 text-white" />
          </div>
          <div className="relative z-10">
            <p className="text-amber-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Renovaciones</p>
            <h2 className="text-lg md:text-3xl font-black text-white tracking-tighter">{kpis.oportunidadesRenovacion}</h2>
          </div>
          <div className="relative z-10 flex">
            <span className="bg-amber-500/10 text-amber-500 text-[6px] md:text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
              Disponibles
            </span>
          </div>
        </Link>

        {/* Índice Mora */}
        <div className="bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px]">
          <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12">
            <AlertCircle className="w-20 h-20 md:w-24 md:h-24 text-white" />
          </div>
          <div className="relative z-10">
            <p className="text-rose-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Índice Mora</p>
            <h2 className="text-lg md:text-3xl font-black text-white tracking-tighter">
              {kpis.tasaMorosidadCapital.toFixed(1)}%
            </h2>
          </div>
          <div className="relative z-10 flex">
            <span className="bg-rose-500/10 text-rose-500 text-[6px] md:text-[8px] font-black px-1.5 py-0.5 rounded border border-rose-500/20 uppercase tracking-wider">
              {isAdmin ? `$${Math.round(kpis.capitalEnRiesgo).toLocaleString()}` : "Riesgo"}
            </span>
          </div>
        </div>

        {/* Recuperación (Solo Admin & Secretaria) */}
        {isAdmin && (
          <div className="bg-[#090e16] border border-slate-800/40 rounded-xl p-2.5 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[95px] md:min-h-[125px]">
            <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12">
              <TrendingUp className="w-20 h-20 md:w-24 md:h-24 text-white" />
            </div>
            <div className="relative z-10">
              <p className="text-blue-500 font-bold text-[8px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-1.5">Recuperación</p>
              <h2 className="text-xl md:text-3xl font-black text-white tracking-tighter">
                {kpis.porcentajeRecuperacion.toFixed(1)}%
              </h2>
            </div>
            <div className="relative z-10 flex">
              <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider">
                ${Math.round(kpis.totalPagado).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Alerts Bar */}
      {['admin', 'supervisor', 'secretaria'].includes(userRole) && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Link href={buildHref('notificar')} className="bg-slate-900/40 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors border-l-2 border-l-rose-500/40">
            <div>
              <p className="text-rose-500/80 font-bold text-[8px] uppercase tracking-tighter">Alertas Críticas</p>
              <p className="text-lg font-black text-white">{kpis.alertasGraves}</p>
            </div>
            <AlertCircle className="w-5 h-5 text-rose-500/20" />
          </Link>
          <Link href={buildHref('morosos')} className="bg-slate-900/40 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors border-l-2 border-l-amber-500/40">
            <div>
              <p className="text-amber-500/80 font-bold text-[8px] uppercase tracking-tighter">Advertencia</p>
              <p className="text-lg font-black text-white">{kpis.clientesEnMora}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-amber-500/20" />
          </Link>
        </div>
      )}

      {/* Threshold info bar */}
      {isAdmin && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-rose-400 font-bold uppercase italic">Moroso:</span> Diario ≥{umbralMoroso} atr. Otros ≥{umbralMorosoOtros} atr.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-amber-400 font-bold uppercase italic">Advertencia:</span> Diario {umbralCpp}-{umbralMoroso - 1} atr. Otros {umbralCppOtros}-{umbralMorosoOtros - 1} atr.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
