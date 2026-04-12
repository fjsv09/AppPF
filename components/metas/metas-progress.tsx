'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Percent, Target, ShieldAlert, Award, AlertCircle, Calendar, CheckCircle2, Wallet, Users, DollarSign, History, Clock } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { esDiaHabil } from '@/lib/financial-logic'

interface MetasProgressProps {
  userId: string
  userRole?: string
}

export function MetasProgress({ userId, userRole = 'asesor' }: MetasProgressProps) {
  const [metas, setMetas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [realTimeStats, setRealTimeStats] = useState({
    porcentaje_cobro: 0,
    nuevos_clientes: 0,
    morosidad_actual: 0,
    clientes_en_cartera: 0,
    clientes_finales_bloqueados: 0,
    hueco_calculado: 0,
    clientes_colocados_mes: 0,
    capital_colocado: 0,
    recaudacion_total: 0,
    promedio_colocacion: 0,
    monto_objetivo_dia: 0,
    monto_cobrado_dia: 0,
    cuotas_objetivo_dia: 0,
    cuotas_cobradas_dia: 0,
    monto_minimo_colocacion: 500,
    detalles_retencion: {
      totales: 0,
      bloqueados: 0,
      activos_validos: 0,
      hueco: 0
    },
    detalles_colocacion: {
      nuevos_totales: 0,
      usados_parche: 0,
      netos_comisionables: 0,
      capital_neto_comisionable: 0
    }
  })
  const [bonosPendientes, setBonosPendientes] = useState<any[]>([])
  const [bonosPagadosHoy, setBonosPagadosHoy] = useState<string[]>([])
  const [bonosPagadosSemana, setBonosPagadosSemana] = useState<string[]>([])
  const [bonosPagadosQuincena, setBonosPagadosQuincena] = useState<string[]>([])
  const [bonosPagadosMes, setBonosPagadosMes] = useState<string[]>([])
  const [historialBonos, setHistorialBonos] = useState<any[]>([])
  const [historialDescuentos, setHistorialDescuentos] = useState<any[]>([])
  const [asesoresInfo, setAsesoresInfo] = useState<any[]>([])
  const [projectedBonuses, setProjectedBonuses] = useState<any[]>([])

  const supabase = createClient()
  const esSupervisorOAdmin = userRole === 'supervisor' || userRole === 'admin'
  const hoyPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

  const fetchStats = useCallback(async () => {
    try {
      const { data: metasData } = await supabase
        .from('metas_asesores')
        .select('*')
        .eq('asesor_id', userId)
        .eq('activo', true)

      setMetas(metasData || [])

      const hoyPeruStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      const mesActualStr = hoyPeruStr.slice(0, 7)

      const { data: todosBonosMes } = await supabase
        .from('bonos_pagados')
        .select('*')
        .eq('asesor_id', userId)
        .gte('fecha', `${mesActualStr}-01`)

      const pagadosHoy = todosBonosMes?.filter(p => p.fecha === hoyPeruStr && p.estado === 'aprobado').map(p => p.meta_id) || []
      
      const d = new Date(hoyPeruStr + 'T12:00:00')
      const day = d.getDay()
      const diffLunes = d.getDate() - day + (day === 0 ? -6 : 1)
      const lunesActual = new Date(d.setDate(diffLunes)).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      
      const pagadosSemana = todosBonosMes?.filter(p => p.fecha >= lunesActual && p.estado === 'aprobado').map(p => p.meta_id) || []
      const pagadosQuincena = todosBonosMes?.filter(p => {
        if (p.estado !== 'aprobado') return false;
        const isSecondHalf = parseInt(hoyPeruStr.split('-')[2]) > 15;
        const bDate = parseInt(p.fecha.split('-')[2]);
        return (isSecondHalf && bDate > 15) || (!isSecondHalf && bDate <= 15);
      }).map(p => p.meta_id) || []
      const pagadosMes = todosBonosMes?.filter(p => p.estado === 'aprobado').map(p => p.meta_id) || []
      const pendientesORechazados = todosBonosMes?.filter(p => {
        if (!['pendiente', 'rechazado'].includes(p.estado)) return false;
        const meta = metasData?.find(m => m.id === p.meta_id);
        if (!meta) return false;
        
        if (meta.periodo === 'diario') return p.fecha === hoyPeruStr;
        if (meta.periodo === 'semanal') return p.fecha >= lunesActual;
        if (meta.periodo === 'quincenal') {
            const isSecondHalf = parseInt(hoyPeruStr.split('-')[2]) > 15;
            const bDate = parseInt(p.fecha.split('-')[2]);
            return (isSecondHalf && bDate > 15) || (!isSecondHalf && bDate <= 15);
        }
        return true;
      }) || []

      setBonosPagadosHoy(pagadosHoy)
      setBonosPagadosSemana(pagadosSemana)
      setBonosPagadosQuincena(pagadosQuincena)
      setBonosPagadosMes(pagadosMes)
      setBonosPendientes(pendientesORechazados)

      const { data: histBonos } = await supabase
        .from('bonos_pagados')
        .select('*, metas_asesores(*)')
        .eq('asesor_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      setHistorialBonos(histBonos || [])

      const { data: histDescuentos } = await supabase
        .from('asistencia_tardanzas')
        .select('*')
        .eq('trabajador_id', userId)
        .order('fecha', { ascending: false })
        .limit(20)
      setHistorialDescuentos(histDescuentos || [])

      // Fetch Real Time Stats
      const resStats = await fetch(`/api/metas/estadisticas?userId=${userId}`)
      if (resStats.ok) {
        const { data, success } = await resStats.json()
        if (success && data?.realTimeStats) {
            setRealTimeStats(prev => ({ ...prev, ...data.realTimeStats }))
            setProjectedBonuses(data.pendingOrProjectedBonuses || [])
        }
      }

      setLoading(false)
    } catch (error) {
      console.error('Error fetching stats:', error)
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchStats()

    // Suscripción en tiempo real para "Radiactividad" técnica
    const channel = supabase
      .channel('metas_realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'bonos_pagados',
        filter: `asesor_id=eq.${userId}`
      }, () => {
        fetchStats()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'metas_asesores',
        filter: `asesor_id=eq.${userId}`
      }, () => {
        fetchStats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchStats, userId, supabase])

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-slate-800 rounded-2xl" />
      <div className="h-64 bg-slate-800 rounded-2xl" />
    </div>
  )

  const metaCobro = metas.find(m => m.meta_cobro !== null && m.meta_cobro !== undefined)
  const metaMora = metas.find(m => (m.meta_morosidad_max !== null && m.meta_morosidad_max !== undefined) || m.escalones_mora)
  const metaClie = metas.find(m => m.meta_cantidad_clientes !== null && m.meta_cantidad_clientes !== undefined)
  const metaRetencion = metas.find(m => m.meta_retencion_clientes !== null && m.meta_retencion_clientes !== undefined)
  const metaColocClientes = metas.find(m => m.meta_colocacion_clientes !== null && m.meta_colocacion_clientes !== undefined)
  const metaCapital = metas.find(m => 
    (m.meta_colocacion !== null && m.meta_colocacion > 0) || 
    (m.bono_capital !== null && m.bono_capital > 0)
  )

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
        <CardHeader className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-500/20 rounded-lg">
                <Award className="w-4 h-4 text-blue-400" />
              </span>
              <div>
                <CardTitle className="text-base font-bold text-white">
                  {esSupervisorOAdmin ? 'Rendimiento del Equipo' : 'Tu Progreso de Bonos'}
                </CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0 space-y-4">
          {metas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
              {/* --- FILA 1: GESTIÓN DE DINERO Y CAPITAL --- */}
              
              {/* 1. Eficiencia Cobro (%) */}
              {metaCobro && (
                <MetricBox
                  label="Eficiencia Cobro"
                  value={`${realTimeStats.porcentaje_cobro.toFixed(1)}%`}
                  target={`${metaCobro.meta_cobro}%`}
                  progress={realTimeStats.porcentaje_cobro}
                  icon={<Percent className="w-3.5 h-3.5 text-blue-400" />}
                  subtitle={`Meta de Ruta Hoy`}
                />
              )}

              {/* 2. Recaudación Total (S/) */}
              {(() => {
                const metaReca = metas.find(m => m.meta_recaudacion_total)
                if (!metaReca) return null
                return (
                  <MetricBox
                    label="Recaudación Total"
                    value={`S/ ${realTimeStats.recaudacion_total.toLocaleString()}`}
                    target={`S/ ${metaReca.meta_recaudacion_total.toLocaleString()}`}
                    progress={Math.min((realTimeStats.recaudacion_total / (metaReca.meta_recaudacion_total || 1)) * 100, 100)}
                    icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
                    subtitle={`Todo lo cobrado en el periodo`}
                  />
                )
              })()}

              {/* 3. Colocación de Capital (S/) */}
              {metaCapital && (
                <MetricBox
                  label="Colocación Capital"
                  value={`S/ ${realTimeStats.capital_colocado.toLocaleString()}`}
                  target={`S/ ${metaCapital.meta_colocacion?.toLocaleString() || 0}`}
                  progress={Math.min((realTimeStats.capital_colocado / (metaCapital.meta_colocacion || 1)) * 100, 100)}
                  icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                  subtitle={`Bono: S/ ${metaCapital.bono_capital || 0} | Faltante: S/ ${Math.max(0, metaCapital.meta_colocacion - realTimeStats.capital_colocado).toLocaleString()}`}
                />
              )}

              {/* --- FILA 2: CRECIMIENTO Y RETENCIÓN --- */}

              {/* 4. Retención de Cartera */}
              {metaRetencion && (
                <MetricBox
                  label="Retención"
                  value={realTimeStats.clientes_en_cartera.toString()}
                  target={`${metaRetencion.meta_retencion_clientes}`}
                  progress={Math.min((realTimeStats.clientes_en_cartera / (metaRetencion.meta_retencion_clientes || 1)) * 100, 100)}
                  icon={<Users className="w-3.5 h-3.5 text-purple-400" />}
                  subtitle={`Bajas/Bloqueados: ${realTimeStats.clientes_finales_bloqueados} | Hueco: ${realTimeStats.hueco_calculado}`}
                />
              )}

              {/* 5. Nuevos Clientes (Unidades) */}
              {metaClie && (
                <MetricBox
                  label="Nuevos Clientes"
                  value={realTimeStats.nuevos_clientes.toString()}
                  target={`${metaClie.meta_cantidad_clientes} cli`}
                  progress={Math.min((realTimeStats.nuevos_clientes / (metaClie.meta_cantidad_clientes || 1)) * 100, 100)}
                  icon={<TrendingUp className="w-3.5 h-3.5 text-amber-400" />}
                  subtitle={`Bono: S/ ${metaClie.bono_monto || 0}`}
                />
              )}

              {/* 6. Bono por Cliente (Comisionista) */}
              {metaColocClientes && (
                <MetricBox
                  label="Bono x Cliente"
                  value={`S/ ${projectedBonuses.find(pb => pb.meta_id === metaColocClientes.id)?.monto || 0}`}
                  target={`Meta: S/ ${metaColocClientes.bono_por_cliente || 0}/cli`}
                  progress={(() => {
                      const montoMin = metaColocClientes.monto_minimo_prestamo || 500;
                      const cap = (realTimeStats as any).capital_neto_comisionable || 0;
                      const nextStep = (Math.floor(cap / montoMin) + 1) * montoMin;
                      const currentProgress = (cap % montoMin) / montoMin * 100;
                      return cap > 0 ? (cap >= metaColocClientes.meta_cantidad_clientes * montoMin ? 100 : currentProgress) : 0;
                  })()}
                  icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
                  subtitle={(() => {
                      const montoMin = metaColocClientes.monto_minimo_prestamo || 500;
                      const cap = (realTimeStats as any).capital_neto_comisionable || 0;
                      const bloques = Math.floor(cap / montoMin);
                      const cliBonificados = Math.min(realTimeStats.clientes_colocados_mes, bloques);
                      const faltanteSiguiente = montoMin - (cap % montoMin);
                      
                      if (cliBonificados < realTimeStats.clientes_colocados_mes) {
                          return `Bonificando ${cliBonificados} de ${realTimeStats.clientes_colocados_mes} cli. Falta S/ ${Math.round(faltanteSiguiente)} para el siguiente.`;
                      }
                      return `Bonificando ${cliBonificados} cli. Promedio: S/ ${realTimeStats.promedio_colocacion}`;
                  })()}
                />
              )}

              {/* --- FILA 3: SALUD FINANCIERA (Full Width on grid wrap) --- */}
              
              {/* 7. Morosidad Actual (Panel de Escalones) */}
              {metaMora && (
                <div className="p-4 bg-[#0d1421]/60 border border-slate-800/60 rounded-2xl flex flex-col justify-between min-h-[140px] shadow-xl hover:bg-[#0f1828] transition-all lg:col-span-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <ShieldAlert className={`w-3.5 h-3.5 ${realTimeStats.morosidad_actual > 10 ? 'text-rose-500' : 'text-orange-400'}`} />
                       <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">Morosidad Actual</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] md:text-xs ${realTimeStats.morosidad_actual > 10 ? 'text-rose-500 border-rose-500/30' : 'text-emerald-500 border-emerald-500/30'}`}>
                      {realTimeStats.morosidad_actual.toFixed(1)}%
                    </Badge>
                  </div>

                  {metaMora.escalones_mora ? (
                    <div className="space-y-1.5 mt-3">
                      {(() => {
                        const escs = typeof metaMora.escalones_mora === 'string' ? JSON.parse(metaMora.escalones_mora) : metaMora.escalones_mora
                        const sorted = [...escs].sort((a,b) => parseFloat(a.mora) - parseFloat(b.mora))
                        return sorted.map((esc: any, i: number) => {
                          const isMet = realTimeStats.morosidad_actual <= parseFloat(esc.mora)
                          const isBest = isMet && (i === 0 || realTimeStats.morosidad_actual > parseFloat(sorted[i-1].mora))
                          return (
                            <div key={i} className={`flex items-center justify-between px-2 py-1 rounded-lg border transition-all ${isBest ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-950/20 border-slate-800/30 text-slate-600'}`}>
                              <span className="text-[8px] md:text-[10px] font-bold">Base {esc.mora}%</span>
                              <span className="text-[8px] md:text-[10px] font-black">S/ {esc.bono}</span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  ) : (
                     <div className="mt-auto">
                        <Progress value={Math.max(0, 100 - (realTimeStats.morosidad_actual / (metaMora.meta_morosidad_max || 1) * 100))} className="h-1 bg-slate-800" />
                        <p className="text-[10px] text-slate-500 mt-2">Meta Máx: {metaMora.meta_morosidad_max || 0}%</p>
                     </div>
                  )}
                </div>
              )}

            </div>
          )}
        </CardContent>
      </Card>

      {/* === BONOS Y ESTADO === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-900/40 border-slate-800">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Bonos Ganados (Acumulado)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {metas.length > 0 ? metas.map((m, idx) => {
              const isPaidToday = bonosPagadosHoy.includes(m.id)
              const isPaidWeek = bonosPagadosSemana.includes(m.id)
              const isPaidMonth = bonosPagadosMes.includes(m.id)
              
              const isPaid = m.periodo === 'diario' ? isPaidToday : 
                            m.periodo === 'semanal' ? isPaidWeek : 
                            m.periodo === 'quincenal' ? bonosPagadosQuincena.includes(m.id) :
                            isPaidMonth

              const bonoInfo = bonosPendientes.find(p => p.meta_id === m.id)
              const isPending = !isPaid && bonoInfo?.estado === 'pendiente'
              const isRejected = !isPaid && bonoInfo?.estado === 'rechazado'
              const rejectionReason = isRejected ? bonoInfo?.motivo_rechazo : null
              
              // --- EVALUACIÓN DE META (VISUAL) ---
              let label = 'Meta'
              let isReached = !!projectedBonuses.find(pb => pb.meta_id === m.id)
              let bonoDisplay = `S/ ${m.bono_monto || 0}`
              
              if (m.meta_cobro !== null && m.meta_cobro !== undefined) {
                label = 'Bono Cobranza'
              } else if (m.meta_retencion_clientes !== null && m.meta_retencion_clientes !== undefined) {
                label = 'Bono Retención'
              } else if (m.meta_cantidad_clientes !== null && m.meta_cantidad_clientes !== undefined) {
                label = 'Bono Nuevos Clientes'
              } else if (m.meta_colocacion_clientes) {
                label = 'Bono por Cliente'
                bonoDisplay = projectedBonuses.find(pb => pb.meta_id === m.id)?.monto ? `S/ ${projectedBonuses.find(pb => pb.meta_id === m.id)?.monto}` : `S/ ${(m.bono_por_cliente || 0)}`
              } else if (m.meta_morosidad_max !== null && m.meta_morosidad_max !== undefined) {
                label = 'Bono Morosidad'
              } else if (m.escalones_mora) {
                label = 'Bono Morosidad'
                const escProj = projectedBonuses.find(pb => pb.meta_id === m.id)
                bonoDisplay = escProj ? `S/ ${escProj.monto}` : 'S/ 0'
              }

              return (
                <TierRow
                  key={idx}
                  label={label}
                  range={m.periodo}
                  bonus={bonoDisplay}
                  active={isReached || isPaid || isPending || isRejected}
                  paid={isPaid}
                  pending={isPending}
                  rejected={isRejected}
                  reason={rejectionReason}
                />
              )
            }) : (
              <p className="text-xs text-slate-500 text-center py-4">No hay metas activas</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800 overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-white/5">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-blue-500" />
              Últimos Movimientos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800/50">
              {historialBonos.map((h, i) => {
                const meta = h.metas_asesores;
                let nombreBono = 'Bono de Gestión';
                
                if (meta) {
                  if (meta.meta_cobro) nombreBono = 'Bono Cobranza';
                  else if (meta.meta_retencion_clientes) nombreBono = 'Bono Retención';
                  else if (meta.meta_colocacion_clientes) nombreBono = 'Bono x Cliente';
                  else if (meta.meta_cantidad_clientes) nombreBono = 'Bono Clientes Nuevos';
                  else if (meta.meta_colocacion) nombreBono = 'Bono Colocación';
                  else if (meta.escalones_mora) nombreBono = 'Bono Morosidad';
                }

                return (
                  <div key={h.id || i} className="p-3 flex items-center justify-between group hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        h.estado === 'aprobado' ? 'bg-emerald-500/10 text-emerald-500' : 
                        h.estado === 'rechazado' ? 'bg-rose-500/10 text-rose-500' : 
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {h.estado === 'aprobado' ? <CheckCircle2 className="w-4 h-4" /> : 
                         h.estado === 'rechazado' ? <AlertCircle className="w-4 h-4" /> : 
                         <Clock className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-white uppercase tracking-tight">
                          {nombreBono} <span className="text-slate-500 font-medium ml-1">
                            ({h.estado === 'pendiente' ? 'En Revisión' : 
                              h.estado === 'rechazado' ? 'Rechazado' : 'Abonado'})
                          </span>
                        </p>
                        <p className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                           <Calendar className="w-2.5 h-2.5" />
                           {format(new Date(h.created_at), 'dd MMM yyyy', { locale: es })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black ${
                         h.estado === 'rechazado' ? 'text-rose-500 line-through opacity-50' : 'text-amber-500'
                      }`}>
                        S/ {Number(h.monto || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
              {historialBonos.length === 0 && (
                <div className="p-10 text-center">
                  <p className="text-[11px] text-slate-600 italic">No hay movimientos recientes.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricBox({ label, value, progress, target, icon, reverse = false, subtitle }: any) {
  const isGood = reverse ? (progress <= 50) : (progress >= 90);
  const isWarning = !isGood && (progress > 50);

  return (
    <div className={`kpi-card group relative p-4 transition-all duration-500 hover:scale-[1.02] ${
      isGood ? 'radioactive-emerald' : isWarning ? 'radioactive-amber' : 'radioactive-rose'
    }`}>
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl bg-slate-900/80 shadow-inner group-hover:scale-110 transition-transform duration-500`}>
            {icon}
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-slate-950/50 border-white/5 text-slate-500 px-2 py-0 font-medium">
          Meta: {target}
        </Badge>
      </div>
      
      <div className="mt-4 space-y-1 relative z-10">
        <div className="flex justify-between items-end">
          <span className="text-2xl font-black text-white tracking-tighter drop-shadow-sm">{value}</span>
          <div className="flex flex-col items-end">
             <span className={`text-[10px] font-black ${isGood ? 'text-emerald-400' : isWarning ? 'text-amber-400' : 'text-rose-400'}`}>
                {Math.round(progress)}%
             </span>
          </div>
        </div>
        <Progress
          value={progress}
          className="h-1.5 bg-slate-800/50 overflow-hidden"
          indicatorClassName={reverse ? (progress > 50 ? 'bg-rose-500' : 'bg-emerald-500') : (progress > 80 ? 'bg-emerald-500' : 'bg-blue-500')}
        />
        {subtitle && (
          <p className="text-[10px] text-slate-500 italic mt-2 font-medium leading-tight line-clamp-1">{subtitle}</p>
        )}
      </div>
      
      {/* Glow effect background */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none ${
        isGood ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : 'bg-rose-500'
      }`} />
    </div>
  )
}

function getNextPayoutDate(periodo: string) {
  const hoy = new Date()
  
  if (periodo === 'diario') return 'Hoy'
  
  if (periodo === 'semanal') {
    // Próximo SÁBADO (Día hábil cierre de semana)
    const proximoSabado = new Date(hoy)
    // Sunday is 0, Saturday is 6
    const diff = (6 - hoy.getDay() + 7) % 7
    proximoSabado.setDate(hoy.getDate() + diff)
    
    if (diff === 0) return 'Hoy (Cierre)'
    return format(proximoSabado, "eee dd 'de' MMM", { locale: es })
  }
  
  if (periodo === 'mensual') {
    let ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    if (ultimoDia.getDay() === 0) { // Si termina en domingo
      ultimoDia.setDate(ultimoDia.getDate() - 1) // Pasar al sábado previo
    }
    return format(ultimoDia, "dd 'de' MMM", { locale: es })
  }
  
  return '-'
}

function TierRow({ label, range, bonus, active, paid, pending, rejected, reason }: any) {
  const nextPayout = getNextPayoutDate(range)
  
  return (
    <div className={`flex flex-col gap-2 p-2.5 rounded-xl border transition-all ${paid ? 'bg-emerald-500/10 border-emerald-500/30' :
        rejected ? 'bg-rose-500/10 border-rose-500/30' :
        pending ? 'bg-amber-500/10 border-amber-500/30 border-dashed animate-pulse' :
          active ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-950/40 border-slate-800/50 opacity-40'
      }`}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <p className={`text-xs font-bold ${paid ? 'text-emerald-400' : rejected ? 'text-rose-400' : pending ? 'text-amber-400' : active ? 'text-blue-400' : 'text-slate-400'}`}>{label}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] text-slate-600 uppercase font-medium">{range}</p>
            <span className="text-[10px] text-slate-700">•</span>
            <p className="text-[10px] text-slate-500 italic">Abono: {nextPayout}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-black ${paid ? 'text-emerald-400' : rejected ? 'text-rose-400' : pending ? 'text-amber-400' : active ? 'text-blue-400' : 'text-slate-500'}`}>{bonus}</p>
          <div className="flex items-center gap-1 justify-end mt-0.5">
            {paid ? (
              <span className="text-[8px] font-bold text-emerald-500 uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/10">Pagado</span>
            ) : rejected ? (
              <span className="text-[8px] font-bold text-rose-500 uppercase flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" /> Rechazado
              </span>
            ) : pending ? (
              <span className="text-[8px] font-bold text-amber-500 uppercase flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Pendiente
              </span>
            ) : active ? (
              <span className="text-[8px] font-bold text-blue-500 uppercase">Alcanzada</span>
            ) : (
              <span className="text-[8px] font-bold text-slate-600 uppercase">En progreso</span>
            )}
          </div>
        </div>
      </div>
      
      {rejected && reason && (
        <div className="mt-1 p-2 bg-rose-500/5 rounded-lg border border-rose-500/10">
          <p className="text-[9px] text-rose-500/80 font-medium italic flex items-start gap-1.5 leading-tight">
             <Target className="w-2 h-2 mt-0.5" />
             Motivo: {reason}
          </p>
        </div>
      )}
    </div>
  )
}
