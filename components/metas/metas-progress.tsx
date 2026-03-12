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
    clientes_colocados_mes: 0,
    promedio_colocacion: 0,
    monto_objetivo_dia: 0,
    monto_cobrado_dia: 0,
    cuotas_objetivo_dia: 0,
    cuotas_cobradas_dia: 0
  })
  const [bonosPagadosHoy, setBonosPagadosHoy] = useState<string[]>([])
  const [historialBonos, setHistorialBonos] = useState<any[]>([])
  const [historialDescuentos, setHistorialDescuentos] = useState<any[]>([])
  const [asesoresInfo, setAsesoresInfo] = useState<any[]>([])
  const processingMetas = useRef(new Set<string>())
  
  const supabase = createClient()
  const esSupervisorOAdmin = userRole === 'supervisor' || userRole === 'admin'

  const fetchStats = useCallback(async () => {
    try {
      // 1. Obtener Metas Asignadas
      const { data: metasData } = await supabase
        .from('metas_asesores')
        .select('*')
        .eq('asesor_id', userId)
        .eq('activo', true)
      
      setMetas(metasData || [])

      // 2. Obtener Bonos ya pagados hoy (Usando zona horaria correcta de Perú)
      const hoyPeruStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      const { data: pagosAuditados } = await supabase
        .from('bonos_pagados')
        .select('meta_id')
        .eq('asesor_id', userId)
        .eq('fecha', hoyPeruStr)
      
      setBonosPagadosHoy(pagosAuditados?.map(p => p.meta_id) || [])

      // 2b. Historial completo de bonos
      const { data: histBonos } = await supabase
        .from('bonos_pagados')
        .select('*')
        .eq('asesor_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      setHistorialBonos(histBonos || [])

      // 2c. Historial de descuentos
      const { data: histDescuentos } = await supabase
        .from('asistencia_tardanzas')
        .select('*')
        .eq('trabajador_id', userId)
        .order('fecha', { ascending: false })
        .limit(20)
      setHistorialDescuentos(histDescuentos || [])

      // 3. CALCULO EN TIEMPO REAL
      const hoyPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      const mesActual = hoyPeru.slice(0, 7)

      // === DETERMINAR IDS DE ASESORES A AGREGAR ===
      let asesorIds: string[] = []
      
      if (esSupervisorOAdmin) {
        // Para supervisor: obtener sus asesores; para admin: todos los asesores
        let query = supabase.from('perfiles').select('id, nombre_completo').eq('rol', 'asesor')
        if (userRole === 'supervisor') {
          query = query.eq('supervisor_id', userId)
        }
        const { data: asesores } = await query
        asesorIds = asesores?.map(a => a.id) || []
        setAsesoresInfo(asesores || [])
      } else {
        asesorIds = [userId]
      }

      if (asesorIds.length === 0) {
        setRealTimeStats({ 
          porcentaje_cobro: 0, 
          nuevos_clientes: 0, 
          morosidad_actual: 0, 
          clientes_en_cartera: 0, 
          clientes_colocados_mes: 0, 
          promedio_colocacion: 0,
          monto_objetivo_dia: 0,
          monto_cobrado_dia: 0,
          cuotas_objetivo_dia: 0,
          cuotas_cobradas_dia: 0
        })
        setLoading(false)
        return
      }

      // === OBTENER CLIENTES DE TODOS LOS ASESORES ===
      const { data: clientesAsesor } = await supabase
        .from('clientes')
        .select('id')
        .in('asesor_id', asesorIds)

      // === CALCULO COBRANZA ===
      let porcentajeCalculado = 0
      if (clientesAsesor && clientesAsesor.length > 0) {
        const clienteIds = clientesAsesor.map(c => c.id)

        const { data: prestamos } = await supabase
          .from('prestamos')
          .select('id')
          .in('cliente_id', clienteIds)
          .eq('estado', 'activo')

        if (prestamos && prestamos.length > 0) {
          const prestamoIds = prestamos.map(p => p.id)
          
          const { data: cuotasHoy } = await supabase
            .from('cronograma_cuotas')
            .select('id, monto_cuota')
            .in('prestamo_id', prestamoIds)
            .eq('fecha_vencimiento', hoyPeru)

          if (cuotasHoy && cuotasHoy.length > 0) {
            const cuotaIds = cuotasHoy.map(c => c.id)
            const totalProgramado = cuotasHoy.reduce((acc, c) => acc + Number(c.monto_cuota), 0)
            
            const { data: todosLosPagos } = await supabase
              .from('pagos')
              .select('cuota_id, monto_pagado, fecha_pago')
              .in('cuota_id', cuotaIds)

            const startOfDay = new Date(`${hoyPeru}T00:00:00-05:00`).getTime()
            const endOfDay = new Date(`${hoyPeru}T23:59:59-05:00`).getTime()
            
            const pagosPorCuota: Record<string, { hoy: number, antes: number }> = {}
            cuotasHoy.forEach(c => pagosPorCuota[c.id] = { hoy: 0, antes: 0 })

            todosLosPagos?.forEach(p => {
               if (!pagosPorCuota[p.cuota_id]) return
               const timePago = new Date(p.fecha_pago).getTime()
               if (timePago >= startOfDay && timePago <= endOfDay) {
                  pagosPorCuota[p.cuota_id].hoy += Number(p.monto_pagado)
               } else if (timePago < startOfDay) {
                  pagosPorCuota[p.cuota_id].antes += Number(p.monto_pagado)
               }
            })

            let totalRecaudadoHoyEfectivo = 0
            let metaEfectivaHoy = 0
            let cuotasCobradasHoy = 0

            cuotasHoy.forEach(c => {
               const metaCuota = Number(c.monto_cuota)
               const pagos = pagosPorCuota[c.id]
               
               // Cuánto de esta cuota quedaba pendiente para cobrar hoy (si se cobró algo ayer, resta)
               const pendienteHoy = Math.max(0, metaCuota - pagos.antes)
               metaEfectivaHoy += pendienteHoy
               
               // Del total que trajo HOY para esta cuota, solo suma hasta el límite que se debía HOY
               const recaudoRealParaEstaCuota = Math.min(pagos.hoy, pendienteHoy)
               totalRecaudadoHoyEfectivo += recaudoRealParaEstaCuota

               // Si ya se completó el 100% de la cuota (antes + hoy >= meta)
               if (pagos.antes + pagos.hoy >= metaCuota) {
                  cuotasCobradasHoy++
               }
            })

            // El porcentaje real es lo que cobramos exactamente de lo que debíamos cobrar, sin inflar.
            porcentajeCalculado = metaEfectivaHoy > 0 
              ? Math.min(100, (totalRecaudadoHoyEfectivo / metaEfectivaHoy) * 100) 
              : (totalProgramado > 0 ? 100 : 0)

            setRealTimeStats(prev => ({
               ...prev,
               monto_objetivo_dia: metaEfectivaHoy,
               monto_cobrado_dia: totalRecaudadoHoyEfectivo,
               cuotas_objetivo_dia: cuotasHoy.length,
               cuotas_cobradas_dia: cuotasCobradasHoy
            }))
          }
        }
      }
      
      // === RETENCIÓN DE CARTERA ===
      let clientesActivosEnCartera = 0
      if (clientesAsesor && clientesAsesor.length > 0) {
        const clienteIds = clientesAsesor.map(c => c.id)
        const { data: prestamosActivos } = await supabase
          .from('prestamos')
          .select('cliente_id')
          .in('cliente_id', clienteIds)
          .eq('estado', 'activo')
        
        const clientesConPrestamoActivo = new Set(prestamosActivos?.map(p => p.cliente_id) || [])
        clientesActivosEnCartera = clientesConPrestamoActivo.size
      }

      // === COLOCACIÓN POR CLIENTE ===
      let clientesColocadosMes = 0
      let promedioColocacion = 0
      if (clientesAsesor && clientesAsesor.length > 0) {
        const clienteIds = clientesAsesor.map(c => c.id)
        const { data: prestamosNuevos } = await supabase
          .from('prestamos')
          .select('id, cliente_id, monto_total, created_at')
          .in('cliente_id', clienteIds)
          .eq('estado', 'activo')
          .gte('created_at', `${mesActual}-01T00:00:00-05:00`)
        
        if (prestamosNuevos && prestamosNuevos.length > 0) {
          const montoTotal = prestamosNuevos.reduce((acc, p) => acc + Number(p.monto_total || 0), 0)
          promedioColocacion = montoTotal / prestamosNuevos.length
          const clientesUnicos = new Set(prestamosNuevos.map(p => p.cliente_id))
          clientesColocadosMes = clientesUnicos.size
        }
      }

      setRealTimeStats(prev => ({ 
        ...prev, 
        porcentaje_cobro: Math.round(porcentajeCalculado),
        clientes_en_cartera: clientesActivosEnCartera,
        clientes_colocados_mes: clientesColocadosMes,
        promedio_colocacion: Math.round(promedioColocacion)
      }))
      setLoading(false)
    } catch (error) {
      console.error('Error fetching stats:', error)
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const checkAndPayBonus = async (meta: any) => {
    // Si todavía estamos cargando o no hay meta ID, cancelar
    if (loading || !meta.id) return
    // Si ya se pagó hoy o está en proceso, cancelar
    if (bonosPagadosHoy.includes(meta.id)) return
    if (processingMetas.current.has(meta.id)) return

    let cumplida = false
    let montoBonoFinal = meta.bono_monto || 0

    // 1. Meta de Cobranza (%)
    if (meta.meta_cobro !== null && meta.meta_cobro !== undefined) {
      if (realTimeStats.porcentaje_cobro >= meta.meta_cobro && realTimeStats.porcentaje_cobro > 0) {
        cumplida = true
      }
    }
    // 2. Meta de Cantidad de Clientes (Nuevos)
    else if (meta.meta_cantidad_clientes !== null && meta.meta_cantidad_clientes !== undefined) {
      if (realTimeStats.nuevos_clientes >= meta.meta_cantidad_clientes && realTimeStats.nuevos_clientes > 0) {
        cumplida = true
      }
    }
    // 3. Meta de Morosidad Max (%) -> Solo si hay morosidad calculada o actividad
    else if (meta.meta_morosidad_max !== null && meta.meta_morosidad_max !== undefined) {
      // Solo premiar morosidad baja si el porcentaje de cobrabilidad ha tenido actividad
      if (realTimeStats.morosidad_actual <= meta.meta_morosidad_max && realTimeStats.porcentaje_cobro > 0) {
        cumplida = true
      }
    }
    // 4. Meta de Retención de Clientes
    else if (meta.meta_retencion_clientes !== null && meta.meta_retencion_clientes !== undefined) {
      if (realTimeStats.clientes_en_cartera >= meta.meta_retencion_clientes && realTimeStats.clientes_en_cartera > 0) {
        cumplida = true
      }
    }
    // 5. Meta de Colocación por Cliente (Dinámico)
    else if (meta.meta_colocacion_clientes) {
      const montoMin = meta.monto_minimo_prestamo || 500
      if (realTimeStats.promedio_colocacion >= montoMin && realTimeStats.clientes_colocados_mes > 0) {
        cumplida = true
        montoBonoFinal = (meta.bono_por_cliente || 0) * realTimeStats.clientes_colocados_mes
      }
    }

    if (cumplida && montoBonoFinal > 0) {
      processingMetas.current.add(meta.id)
      try {
        const { error } = await supabase.rpc('abonar_bono_meta', {
          p_meta_id: meta.id,
          p_asesor_id: userId,
          p_monto: montoBonoFinal
        })

        if (!error) {
          toast.success(`¡Felicidades! Se ha abonado un bono de S/ ${montoBonoFinal} a tu nómina.`, {
              icon: <Award className="w-5 h-5 text-amber-500" />
          })
          setBonosPagadosHoy(prev => [...prev, meta.id])
          
          // Refresh history to show newly paid bonus
          const { data: histBonos } = await supabase
            .from('bonos_pagados')
            .select('*')
            .eq('asesor_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)
          
          setHistorialBonos(histBonos || [])
        }
      } finally {
        // We keep it in the processing set until the next render cycle 
        // usually setBonosPagadosHoy will handle it, but for safety in same render:
        // we don't delete it immediately if successful to avoid race conditions with next tick
        // actually deleting it is fine as long as bonosPagadosHoy is updated.
        // But to be extra safe against React concurrent re-renders:
        setTimeout(() => {
          processingMetas.current.delete(meta.id)
        }, 3000)
      }
    }
  }

  useEffect(() => {
    if (loading) return
    
    metas.forEach(meta => {
      checkAndPayBonus(meta)
    })
  }, [realTimeStats, metas, loading, checkAndPayBonus])

  if (loading) return <div className="animate-pulse space-y-4">
    <div className="h-32 bg-slate-800 rounded-2xl" />
    <div className="h-64 bg-slate-800 rounded-2xl" />
  </div>

  const metaCobro = metas.find(m => m.meta_cobro !== null && m.meta_cobro !== undefined)
  const metaMora = metas.find(m => m.meta_morosidad_max !== null && m.meta_morosidad_max !== undefined)
  const metaClie = metas.find(m => m.meta_cantidad_clientes !== null && m.meta_cantidad_clientes !== undefined)
  const metaRetencion = metas.find(m => m.meta_retencion_clientes !== null && m.meta_retencion_clientes !== undefined)
  const metaColocClientes = metas.find(m => m.meta_colocacion_clientes !== null && m.meta_colocacion_clientes !== undefined)

  return (
    <div className="space-y-6">
      {/* === PROGRESO DE METAS (solo las asignadas) === */}
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
         <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target className="w-24 h-24 text-blue-500" />
         </div>
         <CardHeader>
            <div className="flex items-center gap-2 mb-2">
               <span className="p-1.5 bg-blue-500/20 rounded-lg">
                  <Award className="w-5 h-5 text-blue-400" />
               </span>
               <CardTitle className="text-xl font-bold text-white">
                 {esSupervisorOAdmin ? 'Rendimiento del Equipo' : 'Tu Progreso de Bonos'}
               </CardTitle>
            </div>
            <CardDescription className="text-slate-400">
              {esSupervisorOAdmin 
                ? `Resultados agregados de ${asesoresInfo.length} asesor${asesoresInfo.length !== 1 ? 'es' : ''}`
                : 'Objetivos en tiempo real'}
            </CardDescription>
         </CardHeader>
         <CardContent className="space-y-6 relative z-10">
            {/* Fila principal: solo metas asignadas */}
            {(metaCobro || metaClie || metaMora) ? (
              <div className={`grid grid-cols-1 ${[metaCobro, metaClie, metaMora].filter(Boolean).length >= 3 ? 'md:grid-cols-3' : [metaCobro, metaClie, metaMora].filter(Boolean).length === 2 ? 'md:grid-cols-2' : ''} gap-6`}>
                {metaCobro && (
                  <MetricBox 
                    label={metaCobro.periodo === 'diario' ? "Cobranza del Día" : "Cobranza"} 
                    value={`${realTimeStats.porcentaje_cobro}%`} 
                    progress={realTimeStats.porcentaje_cobro} 
                    target={`${metaCobro.meta_cobro}%`} 
                    icon={<Percent className="w-4 h-4 text-emerald-400" />}
                    subtitle={`S/ ${realTimeStats.monto_cobrado_dia.toLocaleString()} de S/ ${realTimeStats.monto_objetivo_dia.toLocaleString()} (${realTimeStats.cuotas_cobradas_dia} de ${realTimeStats.cuotas_objetivo_dia} préstamos)`}
                  />
                )}
                {metaClie && (
                  <MetricBox 
                    label="Nuevos Clientes" 
                    value={`${realTimeStats.nuevos_clientes}`} 
                    progress={(realTimeStats.nuevos_clientes / metaClie.meta_cantidad_clientes) * 100} 
                    target={`${metaClie.meta_cantidad_clientes} Clientes`} 
                    icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
                  />
                )}
                {metaMora && (
                  <MetricBox 
                    label="Morosidad" 
                    value={`${realTimeStats.morosidad_actual}%`} 
                    progress={100 - (realTimeStats.morosidad_actual * (100 / (metaMora.meta_morosidad_max || 1)))} 
                    target={`< ${metaMora.meta_morosidad_max}%`} 
                    icon={<ShieldAlert className="w-4 h-4 text-rose-400" />}
                    reverse
                  />
                )}
              </div>
            ) : null}
            {/* Fila adicional: Retención y Colocación (solo si asignadas) */}
            {(metaRetencion || metaColocClientes) && (
              <div className={`grid grid-cols-1 ${metaRetencion && metaColocClientes ? 'md:grid-cols-2' : ''} gap-6`}>
                {metaRetencion && (
                  <MetricBox 
                    label="Retención de Cartera" 
                    value={`${realTimeStats.clientes_en_cartera}`} 
                    progress={Math.min(100, (realTimeStats.clientes_en_cartera / metaRetencion.meta_retencion_clientes) * 100)} 
                    target={`${metaRetencion.meta_retencion_clientes} Clientes`} 
                    icon={<Users className="w-4 h-4 text-purple-400" />}
                  />
                )}
                {metaColocClientes && (
                  <MetricBox 
                    label="Colocación del Mes" 
                    value={`${realTimeStats.clientes_colocados_mes} clientes`} 
                    progress={realTimeStats.clientes_colocados_mes > 0 ? 100 : 0} 
                    target={`S/ ${metaColocClientes.bono_por_cliente || 0}/cliente · Min S/ ${metaColocClientes.monto_minimo_prestamo || 500}`} 
                    icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
                    subtitle={`Promedio: S/ ${realTimeStats.promedio_colocacion} ${realTimeStats.promedio_colocacion >= (metaColocClientes.monto_minimo_prestamo || 500) ? '✅' : '❌'}`}
                  />
                )}
              </div>
            )}
            {/* Si no hay NINGUNA meta asignada */}
            {!metaCobro && !metaClie && !metaMora && !metaRetencion && !metaColocClientes && (
              <div className="text-center py-8">
                <Target className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 font-bold">Sin metas asignadas</p>
                <p className="text-xs text-slate-600 mt-1">Contacta a tu supervisor para recibir tus objetivos.</p>
              </div>
            )}
         </CardContent>
      </Card>

      {/* === BONOS: estado actual + historial === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader>
               <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  Bonos del Periodo
               </CardTitle>
            </CardHeader>
             <CardContent className="space-y-3">
                {metas.filter(m => (m.bono_monto > 0 || m.bono_por_cliente > 0)).map((m, idx) => {
                    const isPaid = bonosPagadosHoy.includes(m.id)
                    let isReached = false
                    let bonoLabel = 'Bono Gestión'
                    let bonoDisplay = `S/ ${m.bono_monto || 0}`

                    if (m.meta_cobro) {
                      bonoLabel = 'Bono Cobranza'
                      isReached = realTimeStats.porcentaje_cobro >= m.meta_cobro
                    } else if (m.meta_retencion_clientes) {
                      bonoLabel = 'Bono Retención'
                      isReached = realTimeStats.clientes_en_cartera >= m.meta_retencion_clientes
                    } else if (m.meta_colocacion_clientes) {
                      bonoLabel = 'Bono Colocación'
                      const montoMin = m.monto_minimo_prestamo || 500
                      isReached = realTimeStats.promedio_colocacion >= montoMin && realTimeStats.clientes_colocados_mes > 0
                      bonoDisplay = isReached 
                        ? `S/ ${(m.bono_por_cliente || 0) * realTimeStats.clientes_colocados_mes} (${realTimeStats.clientes_colocados_mes} × S/ ${m.bono_por_cliente})`
                        : `S/ ${m.bono_por_cliente}/cliente`
                    } else if (m.meta_colocacion) {
                      bonoLabel = 'Bono Colocación'
                    } else if (m.meta_cantidad_clientes) {
                      bonoLabel = 'Bono Clientes'
                    }
                    
                    return (
                        <TierRow 
                            key={idx}
                            label={bonoLabel} 
                            range={m.periodo} 
                            bonus={bonoDisplay} 
                            active={isReached || isPaid}
                            paid={isPaid}
                        />
                    )
                })}
                {metas.filter(m => (m.bono_monto > 0 || m.bono_por_cliente > 0)).length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">No hay bonos específicos asignados</p>
                )}
             </CardContent>
         </Card>

         {/* === DESCUENTOS REALES === */}
         <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader>
               <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                  Descuentos Aplicados
               </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
               {historialDescuentos.length > 0 ? (
                 historialDescuentos.slice(0, 5).map((d, idx) => (
                   <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                     <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-rose-400" />
                        <div>
                           <p className="text-sm font-bold text-white capitalize">{d.tipo}</p>
                           <p className="text-[10px] text-slate-500">
                             {format(new Date(d.fecha + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
                             {d.descripcion && ` · ${d.descripcion}`}
                           </p>
                        </div>
                     </div>
                     <span className="text-rose-400 font-bold text-sm">- S/ {Number(d.descuento_aplicado || 0).toFixed(2)}</span>
                   </div>
                 ))
               ) : (
                 <div className="text-center py-6">
                   <CheckCircle2 className="w-8 h-8 text-emerald-500/30 mx-auto mb-2" />
                   <p className="text-xs text-slate-500">Sin descuentos registrados</p>
                 </div>
               )}
               {historialDescuentos.length > 0 && (
                 <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                   <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total descuentos</span>
                   <span className="text-rose-400 font-black">- S/ {historialDescuentos.reduce((acc, d) => acc + Number(d.descuento_aplicado || 0), 0).toFixed(2)}</span>
                 </div>
               )}
            </CardContent>
         </Card>
      </div>

      {/* === HISTORIAL DE BONOS GANADOS === */}
      <Card className="bg-slate-900/40 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-500" />
            Historial de Bonos Ganados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historialBonos.length > 0 ? (
            <div className="divide-y divide-slate-800">
              {historialBonos.map((b, idx) => (
                <div key={idx} className="flex items-center justify-between py-3 px-1">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Award className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Bono abonado</p>
                      <p className="text-[10px] text-slate-500">
                        {format(new Date(b.created_at), "dd MMM yyyy · HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <span className="text-emerald-400 font-black text-sm">+ S/ {Number(b.monto || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Award className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Aún no hay bonos ganados</p>
              <p className="text-[10px] text-slate-600 mt-1">Los bonos se abonan automáticamente al cumplir metas.</p>
            </div>
          )}
          {historialBonos.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total bonos ganados</span>
              <span className="text-emerald-400 font-black">+ S/ {historialBonos.reduce((acc, b) => acc + Number(b.monto || 0), 0).toFixed(2)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricBox({ label, value, progress, target, icon, reverse = false, subtitle }: any) {
  return (
    <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50 space-y-4">
       <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
             {icon}
             <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-slate-800 border-slate-700 text-slate-400">{target}</Badge>
       </div>
       <div className="space-y-2">
          <div className="flex justify-between items-end">
             <span className="text-2xl font-black text-white">{value}</span>
             <span className="text-[10px] font-bold text-slate-500 mb-1">{Math.round(progress)}%</span>
          </div>
          <Progress 
            value={progress} 
            className="h-2 bg-slate-800" 
            indicatorClassName={reverse ? (progress > 50 ? 'bg-emerald-500' : 'bg-rose-500') : (progress > 80 ? 'bg-emerald-500' : 'bg-blue-500')} 
          />
          {subtitle && (
            <p className="text-[10px] text-slate-500 mt-1">{subtitle}</p>
          )}
       </div>
    </div>
  )
}

function TierRow({ label, range, bonus, active, paid }: { label: string, range: string, bonus: string, active: boolean, paid?: boolean }) {
   return (
      <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
         paid ? 'bg-emerald-500/20 border-emerald-500/60 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]' : 
         active ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-950/30 border-slate-800/50 opacity-60'
      }`}>
         <div className="space-y-0.5">
            <p className={`text-sm font-bold ${paid ? 'text-emerald-400' : active ? 'text-amber-400' : 'text-slate-300'}`}>{label}</p>
            <p className="text-[10px] text-slate-500 uppercase font-bold">{range}</p>
         </div>
         <div className="text-right">
            <p className={`text-sm font-black ${paid ? 'text-emerald-400' : active ? 'text-amber-400' : 'text-slate-400'}`}>{bonus}</p>
            {paid ? (
                <span className="text-[9px] font-black text-emerald-500 uppercase flex items-center gap-1 justify-end">
                    <Wallet className="w-2.5 h-2.5" /> Abonado en Nómina
                </span>
            ) : active ? (
                <span className="text-[9px] font-black text-amber-500 uppercase flex items-center gap-1 justify-end">
                   <Target className="w-2.5 h-2.5" /> Meta Alcanzada
                </span>
            ) : (
                <span className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-1 justify-end">
                   En Progreso
                </span>
            )}
         </div>
      </div>
   )
}
