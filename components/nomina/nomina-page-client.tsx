'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
    Calendar, 
    ArrowLeft, 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    History, 
    RotateCcw, 
    CheckCircle, 
    AlertCircle, 
    PlusCircle, 
    Search,
    BellRing,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Calculator,
    BadgePercent,
    Wallet,
    Banknote,
    UserMinus,
    FileText,
    User,
    Users,
    ChevronDown,
    DownloadCloud,
    ExternalLink,
    Clock
} from 'lucide-react'
import { cn } from "@/lib/utils"
import { createClient } from '@/utils/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PagoModal } from './pago-modal'
import { LiquidacionModal } from './liquidacion-modal'
import { AdelantoModal } from './adelanto-modal'
import { BoletaPDF } from './boleta-pdf'

interface NominaPageClientProps {
  trabajadores: { id: string; nombre_completo: string; rol: string }[]
  defaultUserId: string
  currentRole: string
}

export function NominaPageClient({ trabajadores, defaultUserId, currentRole }: NominaPageClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const paramId = searchParams.get('u')
  const [selectedId, setSelectedId] = useState<string>(paramId || trabajadores[0]?.id || defaultUserId)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [payrollData, setPayrollData] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'financiero' | 'asistencia'>('financiero')
  const [actividadFinanciera, setActividadFinanciera] = useState<any[]>([])
  const [actividadAsistencia, setActividadAsistencia] = useState<any[]>([])

  // Estados de Modales (Unificados)
  const [showPagoModal, setShowPagoModal] = useState(false)
  const [showAdelantoModal, setShowAdelantoModal] = useState(false)
  const [showLiquidacionModal, setShowLiquidacionModal] = useState(false)
  const [showBoletaPDF, setShowBoletaPDF] = useState(false)
  const [selectedBoleta, setSelectedBoleta] = useState<any>(null)

  // Paginación
  const [currentPageActividad, setCurrentPageActividad] = useState(1)
  const [currentPageBoletas, setCurrentPageBoletas] = useState(1)
  const itemsPerPage = 5
  
  const supabase = createClient()
  const selectedTrabajador = trabajadores.find(t => t.id === selectedId)
  const today = new Date()

  const viewBoleta = (boleta: any) => {
    setSelectedBoleta(boleta)
    setShowBoletaPDF(true)
  }

  const [feriados, setFeriados] = useState<any[]>([])

  // Detección de Último Día Hábil con Feriados
  const isClosingDay = () => {
      const today = new Date()
      // 1. Obtener último día del mes
      let lastWorkDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      
      // 2. Retroceder hasta encontrar un día HÁBIL (No domingo y no feriado)
      while (lastWorkDay.getMonth() === today.getMonth()) {
          const isSunday = lastWorkDay.getDay() === 0
          const isHoliday = feriados.some(f => {
              const fDate = new Date(f.fecha)
              return fDate.getDate() === lastWorkDay.getDate() && 
                     fDate.getMonth() === lastWorkDay.getMonth()
          })

          if (!isSunday && !isHoliday) {
              // Este es el último día hábil real
              break
          }
          // Seguir retrocediendo
          lastWorkDay.setDate(lastWorkDay.getDate() - 1)
      }

      // 3. Hoy es el día de cierre si coincide con ese último día hábil
      return today.getDate() === lastWorkDay.getDate() && 
             today.getMonth() === lastWorkDay.getMonth()
  }

  const showClosingAlert = isClosingDay()

  async function fetchNomina() {
    setLoading(true)

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

    const [payrollRes, perfilRes, historyRes, auditRes, feriadosRes, asistenciaRes] = await Promise.all([
      supabase
        .from('nomina_personal')
        .select('*')
        .eq('trabajador_id', selectedId)
        .eq('mes', today.getMonth() + 1)
        .eq('anio', today.getFullYear())
        .maybeSingle(),
      supabase
        .from('perfiles')
        .select('*')
        .eq('id', selectedId)
        .single(),
      supabase
        .from('nomina_personal')
        .select('*')
        .eq('trabajador_id', selectedId)
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
        .limit(12),
       supabase
        .from('transacciones_personal')
        .select('*')
        .eq('trabajador_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(200),
       supabase
        .from('feriados')
        .select('*')
        .gte('fecha', startOfMonth)
        .lte('fecha', endOfMonth),
       supabase
        .from('asistencia_personal')
        .select('*')
        .eq('usuario_id', selectedId)
        .gt('descuento_tardanza', 0)
        .gte('fecha', startOfMonth)
        .lte('fecha', endOfMonth)
    ])

    setFeriados(feriadosRes.data || [])
    setPayrollData(payrollRes.data)
    setPerfil(perfilRes.data)
    setHistory(historyRes.data || [])
    
    // Transacciones reales (pagos, bonos, adelantos, ajustes financieros)
    const transaccionesReales = (auditRes.data || []).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    
    // Registros de asistencia que generaron descuentos (trazabilidad)
    const registrosAsistencia = (asistenciaRes.data || []).map((a: any) => ({
        id: `asist-${a.id}`,
        tipo: 'asistencia_tardanza',
        monto: a.descuento_tardanza,
        descripcion: `Tardanza - ${format(new Date(a.fecha + 'T12:00:00'), 'dd/MM/yyyy')}`,
        created_at: a.created_at,
        metadatos: { 
            tipo: 'tardanza', 
            fecha: a.fecha, 
            minutos: a.minutos_tardanza,
            detalle: `Entrada: ${a.tardanza_entrada || 0}m, Tarde: ${a.tardanza_turno_tarde || 0}m, Cierre: ${a.tardanza_cierre || 0}m`
        }
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setActividadFinanciera(transaccionesReales)
    setActividadAsistencia(registrosAsistencia)
    setLoading(false)
}

  useEffect(() => {
    fetchNomina()
    
    // Persistir en URL
    const params = new URLSearchParams(searchParams.toString())
    if (selectedId) {
      params.set('u', selectedId)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [selectedId])

  const frecuencia = perfil?.frecuencia_pago || 'mensual'
  const divisor = frecuencia === 'semanal' ? 4 : frecuencia === 'quincenal' ? 2 : 1
  const sueldoBaseProporcional = (payrollData?.sueldo_base || perfil?.sueldo_base || 0) / divisor
  
  // Pagos completados: lectura directa de la tabla
  const pagosCompletados = payrollData?.pagos_completados || 0

  // Total pagado este mes (sumado desde la tabla de transacciones para visualización)
  const totalPagadoAcumulado = actividadFinanciera
    .filter((a: any) => ['pago', 'bono'].includes(a.tipo))
    .reduce((acc: number, curr: any) => acc + parseFloat(curr.monto || 0), 0)

  const totalCalculated = sueldoBaseProporcional + 
    ((pagosCompletados + 1) === divisor ? (payrollData?.bonos || 0) : 0) - 
    (payrollData?.descuentos || 0) - 
    (payrollData?.adelantos || 0)

  const rolLabel = (rol: string) => {
    switch(rol) {
      case 'admin': return 'Admin'
      case 'supervisor': return 'Supervisor'
      case 'asesor': return 'Asesor'
      default: return rol
    }
  }

  const frecuenciaLabel = (f: string) => {
    switch(f) {
      case 'semanal': return 'Semanal'
      case 'quincenal': return 'Quincenal'
      case 'mensual': return 'Mensual'
      default: return 'Mensual'
    }
  }

  return (
    <div className="space-y-6">
      {/* Selector de Trabajador */}
      {trabajadores.length > 1 && (
        <div className="relative">
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="w-full md:w-auto flex items-center justify-between gap-4 px-5 py-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-200 group"
          >
            <div className="flex items-center gap-3">
              <span className="p-2 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/30 transition-colors">
                <User className="w-5 h-5 text-blue-400" />
              </span>
              <div className="text-left">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Viendo nómina de</p>
                <p className="text-white font-bold text-lg leading-tight">
                  {selectedTrabajador?.nombre_completo || 'Seleccionar'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTrabajador && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold uppercase">
                  {rolLabel(selectedTrabajador.rol)}
                </span>
              )}
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {isOpen && (
            <div className="absolute z-50 top-full mt-2 w-full md:w-[420px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider px-2">
                  <Users className="w-3.5 h-3.5" />
                  Personal ({trabajadores.length})
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {trabajadores.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedId(t.id)
                      setIsOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-800/80 transition-colors ${
                      selectedId === t.id ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                      selectedId === t.id ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {t.nombre_completo.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <span className={`font-medium ${selectedId === t.id ? 'text-blue-400' : 'text-slate-300'}`}>
                        {t.nombre_completo}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-black">{rolLabel(t.rol)}</span>
                      </div>
                    </div>
                    {selectedId === t.id && <CheckCircle className="w-4 h-4 text-blue-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contenido de Nómina */}
      {loading ? (
        <div className="animate-pulse space-y-6">
          <div className="h-64 bg-slate-800 rounded-2xl" />
          <div className="h-40 bg-slate-800 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-12 xl:col-span-8 space-y-6">
            
            {/* Alerta de Cierre de Mes */}
            {showClosingAlert && (
                <div className="bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-blue-600/20 border border-blue-500/30 rounded-2xl p-4 backdrop-blur-md flex items-center gap-4 animate-pulse">
                    <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/40">
                        <BellRing className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white tracking-tight">¡Día de Cierre de Nómina Detectado!</h4>
                        <p className="text-xs text-blue-200/80 font-medium">Hoy es el último día hábil del mes. No olvides liquidar la cuota final y los bonos de producción.</p>
                    </div>
                </div>
            )}

            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden border-t-4 border-t-blue-500">
              <CardHeader className="bg-slate-800/20 border-b border-slate-800">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-xl font-bold text-white">
                      Resumen de Pago <span className="text-blue-400">— {selectedTrabajador?.nombre_completo}</span>
                    </CardTitle>
                    <CardDescription>
                      Corte al {format(today, 'dd/MM/yyyy')}
                      {perfil?.frecuencia_pago && (
                        <span className="ml-2 text-blue-400 font-bold uppercase">· {frecuenciaLabel(perfil.frecuencia_pago)}</span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    {payrollData?.estado === 'pagado' ? (
                       <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[10px] tracking-widest px-4 py-1.5">
                        MES PAGADO TOTALMENTE
                       </Badge>
                    ) : (
                       <div className="inline-flex flex-col items-end">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Pagos completados</span>
                         <div className="flex gap-1">
                           {[...Array(divisor)].map((_, i) => (
                             <div key={i} className={`w-6 h-1.5 rounded-full ${i < pagosCompletados ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                           ))}
                         </div>
                         <p className="text-[9px] font-bold text-emerald-400 mt-1 uppercase tracking-widest">
                           {pagosCompletados} DE {divisor} PAGADOS
                         </p>
                       </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  <PayItem label="Sueldo Base" amount={payrollData?.sueldo_base || perfil?.sueldo_base || 0} icon={<Calculator className="w-3.5 h-3.5 text-blue-400" />} />
                  <PayItem label="Bonos" amount={payrollData?.bonos || 0} icon={<BadgePercent className="w-3.5 h-3.5 text-emerald-400" />} plus />
                  <PayItem 
                    label="Descuentos" 
                    amount={payrollData?.descuentos || 0} 
                    icon={<AlertCircle className="w-3.5 h-3.5 text-rose-500" />} 
                    minus 
                    onClick={() => document.getElementById('detalle-actividad')?.scrollIntoView({ behavior: 'smooth' })}
                    active={payrollData?.descuentos > 0}
                  />
                  <PayItem label="Adelantos" amount={payrollData?.adelantos || 0} icon={<TrendingUp className="w-3.5 h-3.5 text-amber-500" />} minus />
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="text-center md:text-left">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Neto Próximo Pago</p>
                    <h2 className="text-4xl font-black text-white">S/ {Math.max(0, totalCalculated).toFixed(2)}</h2>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 inline-flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-xs text-slate-400">El sistema restará los adelantos automáticamente de tu próximo pago.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Botones de Acción (Solo Admin) */}
            {currentRole === 'admin' && (
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setShowPagoModal(true)}
                  disabled={payrollData?.estado === 'pagado'}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all group disabled:opacity-40 text-center"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-400 text-xs">Realizar Pago</p>
                    <p className="text-[9px] text-slate-500 hidden sm:block">Cuota {pagosCompletados + 1}</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowAdelantoModal(true)}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 hover:border-amber-500/30 transition-all group text-center"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <PlusCircle className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-bold text-amber-400 text-xs">Registrar Adelanto</p>
                    <p className="text-[9px] text-slate-500 hidden sm:block">Desembolso extraordinario</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowLiquidacionModal(true)}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all group text-center"
                >
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <UserMinus className="w-4 h-4 text-rose-400" />
                  </div>
                  <div>
                    <p className="font-bold text-rose-400 text-xs">Liquidación</p>
                    <p className="text-[9px] text-slate-500 hidden sm:block">Baja de personal</p>
                  </div>
                </button>
              </div>
            )}

            {/* Monto pagado acumulado */}
            {totalPagadoAcumulado > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-400">Total Pagado este Mes</p>
                    <p className="text-[10px] text-slate-500">Suma de cuotas depositadas en Abril</p>
                  </div>
                </div>
                <span className="text-lg font-black text-emerald-400">S/ {totalPagadoAcumulado.toFixed(2)}</span>
              </div>
            )}

            {/* Historial Detallado de Actividad */}
            <Card id="detalle-actividad" className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <History className="w-4 h-4 text-blue-400" />
                        Historial de Movimientos
                    </h3>
                    
                    <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-800/50">
                        <button 
                            onClick={() => { setActiveTab('financiero'); setCurrentPageActividad(1); }}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                activeTab === 'financiero' 
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" 
                                    : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            Financiero
                        </button>
                        <button 
                            onClick={() => { setActiveTab('asistencia'); setCurrentPageActividad(1); }}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                activeTab === 'asistencia' 
                                    ? "bg-amber-600 text-white shadow-lg shadow-amber-900/40" 
                                    : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            Asistencia
                        </button>
                    </div>
                </div>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-800/50">
                        {(() => {
                            const currentData = activeTab === 'financiero' ? actividadFinanciera : actividadAsistencia;
                            return currentData.length > 0 ? currentData.slice((currentPageActividad - 1) * itemsPerPage, currentPageActividad * itemsPerPage).map((item: any, idx: number) => (
                                <div key={item.id} className="p-4 flex items-start gap-4 hover:bg-slate-800/20 transition-colors">
                                <div className="mt-1">
                                    <div className={`w-2 h-2 rounded-full ${
                                        item.tipo === 'pago' ? 'bg-emerald-500' : 
                                        item.tipo === 'adelanto' ? 'bg-amber-500' :
                                        item.tipo === 'descuento' ? 'bg-rose-500' :
                                        item.tipo === 'bono' ? 'bg-purple-500' :
                                        item.tipo === 'liquidacion' ? 'bg-blue-600' : 'bg-slate-500'
                                    }`} />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex justify-between">
                                        <p className="text-xs font-bold text-white uppercase tracking-tight">
                                            {item.descripcion}
                                        </p>
                                        <span className="text-[10px] text-slate-500 font-medium">
                                            {format(new Date(item.created_at), "PPP p", { locale: es })}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[11px] text-slate-400">
                                            Monto: <strong className={`${
                                                (item.tipo === 'descuento' || item.tipo === 'asistencia_tardanza')
                                                    ? 'text-rose-400' : 'text-slate-200'
                                            }`}>
                                                {(item.tipo === 'descuento' || item.tipo === 'asistencia_tardanza') ? '- ' : ''}S/ {parseFloat(item.monto || 0).toFixed(2)}
                                            </strong>
                                        </span>
                                        {item.metadatos?.cuenta && (
                                            <span className="text-[11px] text-slate-500 italic">
                                                — vía {item.metadatos.cuenta}
                                            </span>
                                        )}
                                        {item.metadatos?.cuota && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold">
                                                Cuota {item.metadatos.cuota}
                                            </span>
                                        )}
                                        {item.tipo === 'pago' && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                                                Confirmado
                                            </span>
                                        )}
                                        {item.tipo === 'bono' && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">
                                                Bono Producción
                                            </span>
                                        )}
                                        {(item.tipo === 'descuento' || item.tipo === 'asistencia_tardanza') && (
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "text-[10px] px-1.5 py-0.5 rounded font-bold",
                                                    item.tipo === 'asistencia_tardanza' ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                                                )}>
                                                    {item.metadatos?.tipo === 'tardanza' ? 'Tardanza' : 'Amortización'}
                                                </span>
                                                {item.metadatos?.minutos && (
                                                    <span className="text-[10px] text-slate-500 font-medium">
                                                        ({item.metadatos.minutos} min)
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="p-8 text-center bg-slate-900/30">
                                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                                    <History className="w-6 h-6 text-slate-600" />
                                </div>
                                <p className="text-sm text-slate-500 font-medium tracking-tight">
                                    {activeTab === 'financiero' 
                                        ? "No se registran pagos o adelantos para este trabajador." 
                                        : "No se registran tardanzas para este trabajador."}
                                </p>
                            </div>
                        ); })()}
                    </div>
                </CardContent>
                
                {((activeTab === 'financiero' ? actividadFinanciera.length : actividadAsistencia.length)) > itemsPerPage && (
                    <div className="p-4 border-t border-slate-800/50 flex items-center justify-between bg-slate-900/50">
                       <div className="flex flex-col">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em]">Página</span>
                          <span className="text-xs font-black text-blue-400">
                            {currentPageActividad.toString().padStart(2, '0')} <span className="text-slate-700">/</span> {Math.ceil((activeTab === 'financiero' ? actividadFinanciera.length : actividadAsistencia.length) / itemsPerPage).toString().padStart(2, '0')}
                          </span>
                       </div>
                       <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 w-10 p-0 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-all" 
                            disabled={currentPageActividad === 1} 
                            onClick={(e) => { e.stopPropagation(); setCurrentPageActividad(prev => prev - 1) }}
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 w-10 p-0 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-all" 
                            disabled={currentPageActividad === Math.ceil((activeTab === 'financiero' ? actividadFinanciera.length : actividadAsistencia.length) / itemsPerPage)} 
                            onClick={(e) => { e.stopPropagation(); setCurrentPageActividad(prev => prev + 1) }}
                          >
                            <ChevronRight className="w-5 h-5" />
                          </Button>
                       </div>
                    </div>
                )}
            </Card>
          </div>

          <div className="lg:col-span-12 xl:col-span-4 h-full">
            <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-xl overflow-hidden flex flex-col min-h-[500px] border-t-2 border-t-blue-500/30">
              <CardHeader className="p-5 border-b border-white/5 bg-blue-500/5">
                <CardTitle className="text-xs font-black text-blue-400 flex items-center justify-between gap-2 uppercase tracking-[0.2em]">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Historial de Boletas
                  </div>
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px]">
                    {history.length} DOCS
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 gap-3">
                  {history.slice((currentPageBoletas - 1) * itemsPerPage, currentPageBoletas * itemsPerPage).map((p: any) => (
                    <div 
                      key={p.id} 
                      onClick={() => viewBoleta(p)}
                      className="group relative p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-blue-500/50 transition-all duration-300 cursor-pointer overflow-hidden"
                    >
                      {/* Efecto de Brillo Neón en Hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/0 via-transparent to-blue-600/0 group-hover:from-blue-600/5 group-hover:to-indigo-600/5 transition-opacity duration-500" />
                      
                      <div className="relative flex items-center gap-4">
                        {/* Icono de Documento Estilizado */}
                        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 group-hover:border-blue-500/30 transition-all duration-300 shadow-inner">
                          <div className="relative">
                            <FileText className="w-6 h-6 text-slate-500 group-hover:text-blue-400 transition-colors" />
                            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-black text-white uppercase tracking-tight truncate">
                              {new Date(p.anio, p.mes - 1, 1).toLocaleString('es-ES', { month: 'long' }).toUpperCase()} {p.anio}
                            </p>
                            <Badge className={`${
                              p.estado === 'pagado' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            } text-[8px] font-black px-1.5 py-0 border leading-none h-4 uppercase`}>
                              {p.estado}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              <Wallet className="w-3 h-3" />
                              S/ {(p.sueldo_base || 0).toFixed(2)}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              <Clock className="w-3 h-3" />
                              {p.mes}/{p.anio}
                            </div>
                          </div>
                        </div>

                        {/* Botón de Acción Radial */}
                        <div className="flex items-center gap-2">
                           <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 group-hover:text-blue-400 group-hover:border-blue-500/50 group-hover:bg-blue-500/10 transition-all duration-300 shadow-lg">
                              <ExternalLink className="w-3.5 h-3.5" />
                           </div>
                        </div>
                      </div>

                      {/* Línea de progreso/decorativa inferior (Radiactiva) */}
                      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-blue-500 to-indigo-500 group-hover:w-full transition-all duration-500" />
                    </div>
                  ))}
                  
                  {history.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 rounded-3xl border border-dashed border-slate-800 bg-slate-950/20">
                      <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
                        <History className="w-8 h-8 text-slate-700" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sin historial</p>
                        <p className="text-[10px] text-slate-600 mt-1">No hay boletas generadas para este periodo.</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>

              {history.length > itemsPerPage && (
                <div className="p-4 border-t border-white/5 flex items-center justify-between mt-auto bg-slate-900/50">
                   <div className="flex flex-col">
                      <span className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em]">Página</span>
                      <span className="text-xs font-black text-blue-400">
                        {currentPageBoletas.toString().padStart(2, '0')} <span className="text-slate-700">/</span> {Math.ceil(history.length / itemsPerPage).toString().padStart(2, '0')}
                      </span>
                   </div>
                   <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-10 w-10 p-0 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-all" 
                        disabled={currentPageBoletas === 1} 
                        onClick={(e) => { e.stopPropagation(); setCurrentPageBoletas(prev => prev - 1) }}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-10 w-10 p-0 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition-all" 
                        disabled={currentPageBoletas === Math.ceil(history.length / itemsPerPage)} 
                        onClick={(e) => { e.stopPropagation(); setCurrentPageBoletas(prev => prev + 1) }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                   </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Modales */}
      <PagoModal
        open={showPagoModal}
        onOpenChange={setShowPagoModal}
        nomina={payrollData}
        trabajador={{ 
            id: selectedId, 
            nombre_completo: selectedTrabajador?.nombre_completo || '', 
            frecuencia_pago: perfil?.frecuencia_pago 
        }}
        onSuccess={fetchNomina}
      />

      <AdelantoModal
        open={showAdelantoModal}
        onOpenChange={setShowAdelantoModal}
        trabajador={selectedTrabajador ? { id: selectedId, nombre_completo: selectedTrabajador.nombre_completo } : { id: '', nombre_completo: '' }}
        onSuccess={fetchNomina}
      />

      <LiquidacionModal
        open={showLiquidacionModal}
        onOpenChange={setShowLiquidacionModal}
        trabajador={perfil ? { id: selectedId, ...perfil } : null}
        nominaActual={payrollData}
        onSuccess={fetchNomina}
      />

      <BoletaPDF
        open={showBoletaPDF}
        onOpenChange={setShowBoletaPDF}
        nomina={selectedBoleta}
        trabajador={{ nombre_completo: selectedTrabajador?.nombre_completo || '', rol: selectedTrabajador?.rol }}
      />
    </div>
  )
}

function PayItem({ label, amount, icon, plus, minus, onClick, active }: any) {
  return (
    <div 
        onClick={onClick}
        className={`p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50 space-y-3 transition-all ${
            onClick ? 'cursor-pointer hover:border-slate-600 hover:bg-slate-900' : ''
        } ${active && onClick ? 'ring-1 ring-blue-500/30' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <span className="p-1 bg-slate-900 rounded">{icon}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        </div>
        {active && onClick && (
            <span className="text-[8px] font-black text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded uppercase tracking-tighter">Detalle</span>
        )}
      </div>
      <p className={`text-xl font-bold ${plus ? 'text-emerald-400' : minus ? 'text-rose-400' : 'text-slate-200'}`}>
        {plus && '+ '} {minus && '- '} S/ {amount.toFixed(2)}
      </p>
    </div>
  )
}
