'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Users, ChevronDown, Calculator, BadgePercent, AlertCircle, TrendingUp, History, Wallet } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface NominaPageClientProps {
  trabajadores: { id: string; nombre_completo: string; rol: string }[]
  defaultUserId: string
}

export function NominaPageClient({ trabajadores, defaultUserId }: NominaPageClientProps) {
  const [selectedId, setSelectedId] = useState<string>(trabajadores[0]?.id || defaultUserId)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [payrollData, setPayrollData] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  
  const supabase = createClient()
  const selectedTrabajador = trabajadores.find(t => t.id === selectedId)
  const today = new Date()

  useEffect(() => {
    async function fetchNomina() {
      setLoading(true)

      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()

      const [payrollRes, perfilRes, historyRes] = await Promise.all([
        supabase
          .from('nomina_personal')
          .select('*')
          .eq('trabajador_id', selectedId)
          .eq('mes', currentMonth)
          .eq('anio', currentYear)
          .single(),
        supabase
          .from('perfiles')
          .select('sueldo_base, nombre_completo')
          .eq('id', selectedId)
          .single(),
        supabase
          .from('nomina_personal')
          .select('*')
          .eq('trabajador_id', selectedId)
          .order('anio', { ascending: false })
          .order('mes', { ascending: false })
          .limit(6)
      ])

      setPayrollData(payrollRes.data)
      setPerfil(perfilRes.data)
      setHistory(historyRes.data || [])
      setLoading(false)
    }

    fetchNomina()
  }, [selectedId])

  const totalCalculated = (payrollData?.sueldo_base || perfil?.sueldo_base || 0) + 
                          (payrollData?.bonos || 0) - 
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

  return (
    <div className="space-y-6">
      {/* Selector de Trabajador */}
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
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    t.rol === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                    t.rol === 'supervisor' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-800 text-slate-500'
                  }`}>
                    {rolLabel(t.rol)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contenido de Nómina */}
      {loading ? (
        <div className="animate-pulse space-y-6">
          <div className="h-64 bg-slate-800 rounded-2xl" />
          <div className="h-40 bg-slate-800 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-12 xl:col-span-8 space-y-6">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden border-t-4 border-t-blue-500">
              <CardHeader className="bg-slate-800/20 border-b border-slate-800">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-xl font-bold text-white">
                      Resumen de Pago <span className="text-blue-400">— {selectedTrabajador?.nombre_completo}</span>
                    </CardTitle>
                    <CardDescription>Corte al {format(today, 'dd/MM/yyyy')}</CardDescription>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      payrollData?.estado === 'pagado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-500'
                    }`}>
                      {payrollData?.estado === 'pagado' ? 'PAGO REALIZADO' : 'CÁLCULO EN CURSO'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <PayItem label="Sueldo Base" amount={payrollData?.sueldo_base || perfil?.sueldo_base || 0} icon={<Calculator className="w-4 h-4 text-slate-400" />} />
                  <PayItem label="Bonos Ganados" amount={payrollData?.bonos || 0} icon={<BadgePercent className="w-4 h-4 text-emerald-400" />} plus />
                  <PayItem label="Descuentos" amount={payrollData?.descuentos || 0} icon={<AlertCircle className="w-4 h-4 text-rose-500" />} minus />
                  <PayItem label="Adelantos" amount={payrollData?.adelantos || 0} icon={<TrendingUp className="w-4 h-4 text-blue-400" />} minus />
                </div>

                <div className="mt-8 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="text-center md:text-left">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Neto a Recibir</p>
                    <h2 className="text-4xl font-black text-white">S/ {totalCalculated.toFixed(2)}</h2>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 inline-flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-xs text-slate-400">Los bonos se actualizan según el progreso de metas.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="p-6 rounded-2xl bg-blue-600/5 border border-blue-500/10">
              <h4 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Nota Importante
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Las tardanzas y faltas se descuentan semanalmente. Los bonos se abonan automáticamente al cumplir metas. Consulta el <Link href="/dashboard/metas" className="text-blue-400 underline">panel de metas</Link> para más detalles.
              </p>
            </div>
          </div>

          <div className="lg:col-span-12 xl:col-span-4">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
              <CardHeader className="bg-slate-800/30 border-b border-slate-800/50">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-slate-400" />
                  Historial de Boletas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-800">
                  {history.map((p: any) => (
                    <div key={p.id} className="p-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white uppercase">{format(new Date(p.anio, p.mes - 1), 'MMMM yyyy', { locale: es })}</p>
                        <p className="text-[10px] text-slate-500">Monto Final: S/ {(p.sueldo_base + p.bonos - p.descuentos - p.adelantos).toFixed(2)}</p>
                      </div>
                      <Badge variant="outline" className={p.estado === 'pagado' ? 'text-emerald-400 border-emerald-900/50' : 'text-amber-500 border-amber-900/50'}>
                        {p.estado}
                      </Badge>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="p-10 text-center">
                      <p className="text-slate-600 text-sm">Sin historial disponible.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function PayItem({ label, amount, icon, plus, minus }: any) {
  return (
    <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50 space-y-3">
      <div className="flex items-center gap-2">
        <span className="p-1 bg-slate-900 rounded">{icon}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-xl font-bold ${plus ? 'text-emerald-400' : minus ? 'text-rose-400' : 'text-slate-200'}`}>
        {plus && '+ '} {minus && '- '} S/ {amount.toFixed(2)}
      </p>
    </div>
  )
}
