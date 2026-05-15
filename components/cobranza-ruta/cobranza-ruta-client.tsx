'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Clock, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CobranzaTable } from './cobranza-table'
import { AsesorMetricsDetails } from './asesor-metrics-details'
import type { AsesorRutaMetrics, DetalleMetrica } from './types'

interface Props {
  userRole: 'supervisor' | 'admin'
}

const AUTO_REFRESH_MS = 45_000

export function CobranzaRutaClient({ userRole }: Props) {
  const [asesores, setAsesores] = useState<AsesorRutaMetrics[]>([])
  const [supervisores, setSupervisores] = useState<Array<{ id: string; nombre: string }>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsSince, setSecondsSince] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null)

  // Drill-down state
  const [selectedAsesorId, setSelectedAsesorId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<'quedan' | 'cobraron' | 'total' | null>(null)
  const [detalle, setDetalle] = useState<DetalleMetrica | null>(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [detalleError, setDetalleError] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Detectar si es desktop y manejar transición entre sidebar y modal al redimensionar
  useEffect(() => {
    const check = () => {
      const desktop = window.innerWidth >= 1024
      setIsDesktop(prev => {
        if (prev !== desktop) {
          if (desktop && isModalOpen) {
            setIsModalOpen(false)
            if (selectedAsesorId) setIsSidebarOpen(true)
          } else if (!desktop && isSidebarOpen) {
            setIsSidebarOpen(false)
            if (selectedAsesorId) setIsModalOpen(true)
          }
        }
        return desktop
      })
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isModalOpen, isSidebarOpen, selectedAsesorId])

  // Contador de segundos desde última actualización
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated) {
        setSecondsSince(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lastUpdated])

  const fetchAsesores = useCallback(async (isManual = false) => {
    if (!isManual) setLoading(true)
    if (isManual) setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (selectedSupervisorId) params.append('supervisorId', selectedSupervisorId)
      const res = await fetch(`/api/dashboard/cobranza-ruta?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      const data = await res.json()
      setAsesores(data.asesores || [])
      if (data.supervisores?.length > 0) setSupervisores(data.supervisores)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error desconocido'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedSupervisorId])

  // Auto-refresh
  useEffect(() => {
    fetchAsesores()
    timerRef.current = setInterval(() => fetchAsesores(), AUTO_REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchAsesores])

  const fetchDetalle = useCallback(async (asesorId: string, metric: 'quedan' | 'cobraron' | 'total') => {
    setDetalleLoading(true)
    try {
      const params = new URLSearchParams({ asesorId, tipo: metric })
      const res = await fetch(`/api/dashboard/cobranza-ruta/detalle?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar detalle')
      const data = await res.json()
      setDetalle(data)
      setDetalleError(null)
    } catch (e: unknown) {
      setDetalle(null)
      setDetalleError(e instanceof Error ? e.message : 'Error al cargar detalle')
    } finally {
      setDetalleLoading(false)
    }
  }, [])

  const handleMetricClick = useCallback((asesorId: string, metric: 'quedan' | 'cobraron' | 'total') => {
    // Toggle: cerrar si ya estaba seleccionado
    if (selectedAsesorId === asesorId && selectedMetric === metric) {
      setSelectedAsesorId(null)
      setSelectedMetric(null)
      setIsSidebarOpen(false)
      setIsModalOpen(false)
      return
    }
    setSelectedAsesorId(asesorId)
    setSelectedMetric(metric)
    fetchDetalle(asesorId, metric)
    if (isDesktop) setIsSidebarOpen(true)
    else setIsModalOpen(true)
  }, [selectedAsesorId, selectedMetric, isDesktop, fetchDetalle])

  const handleClose = useCallback(() => {
    setIsSidebarOpen(false)
    setIsModalOpen(false)
    setSelectedAsesorId(null)
    setSelectedMetric(null)
    setDetalle(null)
    setDetalleError(null)
  }, [])

  const selectedAsesor = asesores.find(a => a.asesor_id === selectedAsesorId)

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Selector de supervisor (solo admin) */}
          {userRole === 'admin' && supervisores.length > 0 && (
            <div className="relative">
              <select
                value={selectedSupervisorId || ''}
                onChange={e => setSelectedSupervisorId(e.target.value || null)}
                className="appearance-none bg-white/10 text-white text-sm rounded-lg px-3 py-2 pr-8 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">Todos los supervisores</option>
                {supervisores.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Hace {secondsSince}s</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchAsesores(true)}
            disabled={refreshing}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className={cn("w-4 h-4 mr-1.5", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Layout: tabla + sidebar en desktop */}
      <div className={cn("flex gap-4", isSidebarOpen && isDesktop ? "flex-row" : "flex-col")}>

        {/* Tabla principal */}
        <div className={cn("flex-1 min-w-0", isSidebarOpen && isDesktop ? "w-[65%]" : "w-full")}>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <CobranzaTable
              asesores={asesores}
              selectedAsesorId={selectedAsesorId}
              selectedMetric={selectedMetric}
              onMetricClick={handleMetricClick}
            />
          )}
        </div>

        {/* Sidebar (desktop) */}
        {isSidebarOpen && isDesktop && (
          <div className="w-[35%] min-w-[280px] max-w-[380px] rounded-xl bg-slate-900/60 border border-white/10 flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="text-xs text-slate-400 uppercase tracking-wider">
                {selectedAsesor?.nombre_asesor || 'Detalles'}
              </span>
              <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AsesorMetricsDetails detalle={detalle} loading={detalleLoading} />
              {detalleError && (
                <p className="text-xs text-red-400 p-3">{detalleError}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal (mobile) */}
      <Dialog open={isModalOpen} onOpenChange={open => { if (!open) handleClose() }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-white/10 shrink-0">
            <DialogTitle className="text-sm text-white">
              {selectedAsesor?.nombre_asesor ?? 'Asesor'} — {selectedMetric === 'quedan' ? 'Quedan por Cobrar' : selectedMetric === 'cobraron' ? 'Cobraron en Ruta' : 'Total Cobrado'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <AsesorMetricsDetails detalle={detalle} loading={detalleLoading} />
            {detalleError && (
              <p className="text-xs text-red-400 p-3">{detalleError}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
