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
  const [bonosPagadosMes, setBonosPagadosMes] = useState<string[]>([])
  const [historialBonos, setHistorialBonos] = useState<any[]>([])
  const [historialDescuentos, setHistorialDescuentos] = useState<any[]>([])
  const [asesoresInfo, setAsesoresInfo] = useState<any[]>([])
  const [feriadosSet, setFeriadosSet] = useState<Set<string>>(new Set())
  const processingMetas = useRef(new Set<string>())

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

      // Cargar Feriados
      try {
        const resFer = await fetch('/api/feriados')
        if (resFer.ok) {
          const fers = await resFer.json()
          setFeriadosSet(new Set(fers.map((f: any) => f.fecha)))
        }
      } catch (e) {
        console.error('Error fetching feriados:', e)
      }

      const { data: todosBonosMes } = await supabase
        .from('bonos_pagados')
        .select('*')
        .eq('asesor_id', userId)
        .gte('fecha', `${mesActualStr}-01`)

      const pagadosHoy = todosBonosMes?.filter(p => p.fecha === hoyPeruStr && p.estado === 'aprobado').map(p => p.meta_id) || []
      
      // Calcular Lunes de esta semana para filtrado semanal
      const d = new Date(hoyPeruStr + 'T12:00:00')
      const day = d.getDay()
      const diffLunes = d.getDate() - day + (day === 0 ? -6 : 1)
      const lunesActual = new Date(d.setDate(diffLunes)).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      
      const pagadosSemana = todosBonosMes?.filter(p => p.fecha >= lunesActual && p.estado === 'aprobado').map(p => p.meta_id) || []
      const pagadosMes = todosBonosMes?.filter(p => p.estado === 'aprobado').map(p => p.meta_id) || []
      const pendientesORechazados = todosBonosMes?.filter(p => ['pendiente', 'rechazado'].includes(p.estado)) || []

      setBonosPagadosHoy(pagadosHoy)
      setBonosPagadosSemana(pagadosSemana)
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

      const hoyPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
      const mesActual = hoyPeru.slice(0, 7)

      let promedioColocacion = 0
      let asesorIds: string[] = []

      if (esSupervisorOAdmin) {
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
        setLoading(false)
        return
      }

      const { data: clientesAsesor } = await supabase
        .from('clientes')
        .select('id, bloqueado_renovacion, created_at')
        .in('asesor_id', asesorIds)

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
            .select('id, monto_cuota, monto_pagado')
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
            let cuotasObjetivoDiaCount = 0
            cuotasHoy.forEach((c: any) => {
              const metaCuota = Number(c.monto_cuota)
              const pagos = pagosPorCuota[c.id]
              const totalPagadoAcumulado = Number(c.monto_pagado || 0)
              const pagadoAntes = Math.max(0, totalPagadoAcumulado - pagos.hoy)
              const pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes)
              if (pendienteAlInicio <= 0.01) return
              metaEfectivaHoy += pendienteAlInicio
              cuotasObjetivoDiaCount++
              const recaudoHoyEfectivo = Math.min(pagos.hoy, pendienteAlInicio)
              totalRecaudadoHoyEfectivo += recaudoHoyEfectivo
              if (pagos.hoy > 0 && (totalPagadoAcumulado >= metaCuota)) {
                cuotasCobradasHoy++
              }
            })

            porcentajeCalculado = metaEfectivaHoy > 0
              ? Math.min(100, (totalRecaudadoHoyEfectivo / metaEfectivaHoy) * 100)
              : (totalProgramado > 0 ? 100 : 0)

            setRealTimeStats(prev => ({
              ...prev,
              monto_objetivo_dia: metaEfectivaHoy,
              monto_cobrado_dia: totalRecaudadoHoyEfectivo,
              cuotas_objetivo_dia: cuotasObjetivoDiaCount,
              cuotas_cobradas_dia: cuotasCobradasHoy
            }))
          }
        }
      }

      let clientesActivosNoBloqueados = 0
      let clientesBloqueados = 0
      let totalFinalClients = 0

      if (clientesAsesor && clientesAsesor.length > 0) {
        const clienteIds = clientesAsesor.map(c => c.id)
        const { data: prestamosActivos } = await supabase
          .from('prestamos')
          .select('cliente_id')
          .in('cliente_id', clienteIds)
          .eq('estado', 'activo')

        const idsConPrestamoActivo = new Set(prestamosActivos?.map(p => p.cliente_id) || [])
        const { data: detallesClientes } = await supabase
          .from('clientes')
          .select('id, bloqueado_renovacion')
          .in('id', Array.from(idsConPrestamoActivo))

        totalFinalClients = idsConPrestamoActivo.size
        clientesActivosNoBloqueados = detallesClientes?.filter(c => !c.bloqueado_renovacion).length || 0
        clientesBloqueados = totalFinalClients - clientesActivosNoBloqueados
      }

      let clientesNuevos = []
      let capitalNetoComisionable = 0
      let netosComisionablesCount = 0
      let usadosParcheCount = 0
      let huecoCalculado = 0

      const metaReten = metasData?.find(m => m.meta_retencion_clientes > 0)
      if (metaReten) {
        huecoCalculado = Math.max(0, metaReten.meta_retencion_clientes - clientesActivosNoBloqueados)
      }

      // 1. Obtener préstamos de la cartera
      const { data: allRecentLoans } = await supabase
        .from('prestamos')
        .select(`
          id, 
          cliente_id, 
          monto, 
          interes, 
          created_at, 
          estado, 
          created_by,
          clientes!inner (
            asesor_id
          ),
          cronograma_cuotas (
            id,
            fecha_vencimiento,
            monto_cuota,
            monto_pagado,
            estado
          )
        `)
        .eq('clientes.asesor_id', userId)
        .in('estado', ['activo', 'desembolsado', 'vigente', 'aprobado', 'finalizado'])

      // 2. Obtener RECAUDACIÓN REAL (Dinero físico cobrado por el asesor)
      const getPeriodStartDate = (period: 'semanal' | 'mensual') => {
        const now = new Date()
        const start = new Date(now)
        if (period === 'semanal') {
          const day = now.getDay()
          const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Lunes
          start.setDate(diff)
        } else {
          start.setDate(1) // Día 1 del mes
        }
        start.setHours(0,0,0,0)
        return start
      }

      const startOfPeriod = getPeriodStartDate('mensual')
      const { data: pagosPeriodo } = await supabase
        .from('pagos')
        .select('monto_pagado, created_at')
        .eq('registrado_por', userId)
        .gte('created_at', startOfPeriod.toISOString())

      const totalRecaudadoReal = pagosPeriodo?.reduce((acc, p) => acc + Number(p.monto_pagado || 0), 0) || 0

      const prestamosNuevos = (allRecentLoans?.filter(p => {
        const fecha = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
        return fecha.startsWith(mesActual)
      }) || []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      if (prestamosNuevos.length > 0) {
        const clientesUnicosNuevos = new Set()
        const prestamosNuevosFiltrados = prestamosNuevos.filter(p => {
          if (clientesUnicosNuevos.has(p.cliente_id)) return false
          clientesUnicosNuevos.add(p.cliente_id)
          return true
        })

        clientesNuevos = prestamosNuevosFiltrados
        let gapToCover = huecoCalculado
        prestamosNuevosFiltrados.forEach((p, idx) => {
          if (gapToCover > 0) {
            gapToCover--
            usadosParcheCount++
          } else {
            capitalNetoComisionable += Number(p.monto || 0)
            netosComisionablesCount++
          }
        })

        const montoTotalBruto = prestamosNuevos.reduce((acc, p) => acc + Number(p.monto || 0), 0)
        promedioColocacion = prestamosNuevos.length > 0 ? montoTotalBruto / prestamosNuevos.length : 0
      }

      // --- CÁLCULO DE MOROSIDAD BANCARIA (Sincronizado con Panel de Préstamos) ---
      let totalCapitalOriginal = 0
      let totalCapitalVencido = 0
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

      allRecentLoans?.filter(p => p.estado === 'activo').forEach(p => {
        const montoCapital = parseFloat(p.monto) || 0
        totalCapitalOriginal += montoCapital
        
        const cuotas = p.cronograma_cuotas || []
        const numCuotas = cuotas.length || 1
        const capitalPorCuota = montoCapital / numCuotas
        
        cuotas.filter((c: any) => c.fecha_vencimiento <= todayStr && c.estado !== 'pagado').forEach((c: any) => {
            const montoCuota = parseFloat(c.monto_cuota) || 0
            const montoPagado = parseFloat(c.monto_pagado) || 0
            const pendiente = Math.max(0, montoCuota - montoPagado)
            
            if (pendiente > 0.01) {
                const proporcionPendiente = montoCuota > 0 ? pendiente / montoCuota : 1
                totalCapitalVencido += capitalPorCuota * proporcionPendiente
            }
        })
      })

      const tasaMorosidadOficial = totalCapitalOriginal > 0 ? (totalCapitalVencido / totalCapitalOriginal) * 100 : 0

      setRealTimeStats(prev => ({
        ...prev,
        porcentaje_cobro: Math.round(porcentajeCalculado),
        morosidad_actual: tasaMorosidadOficial,
        clientes_en_cartera: clientesActivosNoBloqueados,
        clientes_finales_bloqueados: clientesBloqueados,
        hueco_calculado: huecoCalculado,
        clientes_colocados_mes: netosComisionablesCount,
        capital_colocado: prestamosNuevos.reduce((acc, p) => acc + Number(p.monto || 0), 0),
        recaudacion_total: totalRecaudadoReal,
        nuevos_clientes: netosComisionablesCount,
        promedio_colocacion: Math.round(promedioColocacion),
        detalles_retencion: {
          totales: totalFinalClients,
          bloqueados: clientesBloqueados,
          activos_validos: clientesActivosNoBloqueados,
          hueco: huecoCalculado
        },
        detalles_colocacion: {
          nuevos_totales: clientesNuevos.length,
          usados_parche: usadosParcheCount,
          netos_comisionables: netosComisionablesCount,
          capital_neto_comisionable: capitalNetoComisionable
        }
      }))
      setLoading(false)
    } catch (error) {
      console.error('Error fetching stats:', error)
      setLoading(false)
    }
  }, [userId, supabase, esSupervisorOAdmin, userRole])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const checkAndPayBonus = useCallback(async (meta: any) => {
    if (loading || !meta.id) return
    const hoyPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const today = new Date(hoyPeru + 'T12:00:00')
    let lastWorkingDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    if (lastWorkingDayOfMonth.getDay() === 0) lastWorkingDayOfMonth.setDate(lastWorkingDayOfMonth.getDate() - 1)
    const isLastWorkingDay = today.getDate() === lastWorkingDayOfMonth.getDate()
    if (meta.periodo === 'mensual' && !isLastWorkingDay) return
    const isSaturday = today.getDay() === 6
    if (meta.periodo === 'semanal' && !isSaturday) return
    if (meta.periodo === 'diario' && bonosPagadosHoy.includes(meta.id)) return
    if (meta.periodo === 'semanal' && bonosPagadosSemana.includes(meta.id)) return
    if (meta.periodo === 'mensual' && bonosPagadosMes.includes(meta.id)) return
    if (bonosPendientes.some(p => p.meta_id === meta.id)) return
    if (processingMetas.current.has(meta.id)) return

    // --- REGLA DE DOMINGOS Y FERIADOS ---
    if (!esDiaHabil(hoyPeru, feriadosSet)) return

    let cumplida = false
    let montoBonoFinal = meta.bono_monto || 0

    if (meta.meta_cobro !== null && meta.meta_cobro !== undefined) {
      if (realTimeStats.porcentaje_cobro >= meta.meta_cobro && realTimeStats.porcentaje_cobro > 0) cumplida = true
    } else if (meta.meta_cantidad_clientes !== null && meta.meta_cantidad_clientes !== undefined) {
      if (realTimeStats.nuevos_clientes >= meta.meta_cantidad_clientes && realTimeStats.nuevos_clientes > 0) cumplida = true
    }
    // Meta de Morosidad Max (%) y Escalones
    else if (meta.meta_morosidad_max !== null && meta.meta_morosidad_max !== undefined) {
      if (realTimeStats.morosidad_actual <= meta.meta_morosidad_max && realTimeStats.porcentaje_cobro > 0) {
        cumplida = true
      }
    }
    // Meta de Morosidad por Escalones
    else if (meta.escalones_mora) {
      const escalones = typeof meta.escalones_mora === 'string' ? JSON.parse(meta.escalones_mora) : meta.escalones_mora
      // Ordenar escalones de menor a mayor mora para encontrar el primero que cumple
      const sortedEsc = [...escalones].sort((a,b) => parseFloat(a.mora) - parseFloat(b.mora))
      
      const escalonCumplido = sortedEsc.find(esc => realTimeStats.morosidad_actual <= parseFloat(esc.mora))
      if (escalonCumplido && realTimeStats.porcentaje_cobro > 0) {
        cumplida = true
        montoBonoFinal = parseFloat(escalonCumplido.bono)
      }
    }
    else if (meta.meta_retencion_clientes !== null && meta.meta_retencion_clientes !== undefined) {
      if (realTimeStats.clientes_en_cartera >= meta.meta_retencion_clientes && realTimeStats.clientes_en_cartera > 0) cumplida = true
    } else if (meta.meta_colocacion_clientes) {
      const montoMin = meta.monto_minimo_prestamo || 500
      if (realTimeStats.promedio_colocacion >= montoMin && realTimeStats.clientes_colocados_mes > 0) {
        cumplida = true
        montoBonoFinal = (meta.bono_por_cliente || 0) * realTimeStats.clientes_colocados_mes
      }
    }

    if (cumplida && montoBonoFinal > 0) {
      processingMetas.current.add(meta.id)
      try {
        // --- ENVÍO SEGURO VÍA API (RLS FIX) ---
        const response = await fetch('/api/metas/bono', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meta_id: meta.id,
            monto: montoBonoFinal,
            fecha: hoyPeru,
            detalles_calculo: {
              formula: meta.meta_retencion_clientes ? 'RETENCIÓN' : meta.meta_colocacion_clientes ? 'COLOCACIÓN' : 'KPI',
              valor: montoBonoFinal
            }
          })
        })

        const result = await response.json()

        if (!response.ok) {
          toast.error(`Error al enviar bono: ${result.error || 'Error desconocido'}`)
          processingMetas.current.delete(meta.id)
          return
        }

        toast.success(`Meta alcanzada. El bono de S/ ${montoBonoFinal} ha sido enviado al Administrador.`, { 
          icon: <Clock className="w-5 h-5 text-amber-500" /> 
        })
        setBonosPendientes(prev => [...prev, { meta_id: meta.id, monto: montoBonoFinal, estado: 'pendiente' }])
      } catch (err: any) {
        toast.error('Error de conexión al enviar el bono.')
        processingMetas.current.delete(meta.id)
      } finally {
        setTimeout(() => processingMetas.current.delete(meta.id), 5000)
      }
    }
  }, [loading, userId, bonosPagadosHoy, bonosPagadosSemana, bonosPagadosMes, bonosPendientes, realTimeStats, supabase])

  useEffect(() => {
    if (loading) return
    metas.forEach(meta => checkAndPayBonus(meta))
  }, [realTimeStats, metas, loading, checkAndPayBonus])

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
                  value={`S/ ${(metaColocClientes.bono_por_cliente || 0) * realTimeStats.clientes_colocados_mes}`}
                  target={`Meta: S/ ${metaColocClientes.bono_por_cliente || 0}/cli`}
                  progress={realTimeStats.clientes_colocados_mes > 0 ? 100 : 0}
                  icon={<DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
                  subtitle={`Total Comis: S/ ${realTimeStats.clientes_colocados_mes} | Promedio: S/ ${realTimeStats.promedio_colocacion}`}
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
                            isPaidMonth

              const bonoInfo = bonosPendientes.find(p => p.meta_id === m.id)
              const isPending = bonoInfo?.estado === 'pendiente'
              const isRejected = bonoInfo?.estado === 'rechazado'
              const rejectionReason = bonoInfo?.motivo_rechazo
              
              // --- EVALUACIÓN DE META ---
              let label = 'Meta'
              let isReached = false
              let bonoDisplay = `S/ ${m.bono_monto || 0}`
              
              const isWorkingDay = esDiaHabil(hoyPeru, feriadosSet)

              if (isWorkingDay) {
                if (m.meta_cobro !== null && m.meta_cobro !== undefined) {
                  label = 'Bono Cobranza'
                  isReached = realTimeStats.porcentaje_cobro >= m.meta_cobro && realTimeStats.porcentaje_cobro > 0
                } else if (m.meta_retencion_clientes !== null && m.meta_retencion_clientes !== undefined) {
                  label = 'Bono Retención'
                  isReached = realTimeStats.clientes_en_cartera >= m.meta_retencion_clientes && realTimeStats.porcentaje_cobro > 0
                } else if (m.meta_cantidad_clientes !== null && m.meta_cantidad_clientes !== undefined) {
                  label = 'Bono Nuevos Clientes'
                  isReached = realTimeStats.nuevos_clientes >= m.meta_cantidad_clientes && realTimeStats.nuevos_clientes > 0
                } else if (m.meta_colocacion_clientes) {
                  label = 'Bono por Cliente'
                  const montoMin = m.monto_minimo_prestamo || 500
                  isReached = realTimeStats.clientes_colocados_mes > 0 && realTimeStats.promedio_colocacion >= montoMin
                  bonoDisplay = `S/ ${(m.bono_por_cliente || 0) * realTimeStats.clientes_colocados_mes}`
                } else if (m.meta_morosidad_max !== null && m.meta_morosidad_max !== undefined) {
                  label = 'Bono Morosidad'
                  isReached = realTimeStats.morosidad_actual <= m.meta_morosidad_max && realTimeStats.porcentaje_cobro > 0
                } else if (m.escalones_mora) {
                  label = 'Bono Morosidad'
                  const escalones = typeof m.escalones_mora === 'string' ? JSON.parse(m.escalones_mora) : m.escalones_mora
                  const sortedEsc = [...escalones].sort((a,b) => parseFloat(a.mora) - parseFloat(b.mora))
                  const esc = sortedEsc.find(e => realTimeStats.morosidad_actual <= parseFloat(e.mora))
                  isReached = !!esc && realTimeStats.porcentaje_cobro > 0
                  bonoDisplay = esc ? `S/ ${esc.bono}` : 'S/ 0'
                }
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
  return (
    <div className="bg-slate-950/40 border border-slate-800 p-3 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-900 rounded-lg">{icon}</div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        </div>
        <Badge variant="outline" className="text-[9px] bg-slate-900 border-slate-800 text-slate-400 px-2 py-0">Meta: {target}</Badge>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-end">
          <span className="text-xl font-black text-white">{value}</span>
          <span className="text-[9px] font-bold text-slate-500">{Math.round(Math.min(100, progress))}%</span>
        </div>
        <Progress
          value={progress}
          className="h-1.5 bg-slate-800"
          indicatorClassName={reverse ? (progress > 50 ? 'bg-emerald-500' : 'bg-rose-500') : (progress > 80 ? 'bg-emerald-500' : 'bg-blue-500')}
        />
        {subtitle && (
          <p className="text-[9px] text-slate-500 italic mt-1">{subtitle}</p>
        )}
      </div>
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
