'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { 
  CheckCircle2, 
  XCircle, 
  Search, 
  Clock, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Landmark, 
  Smartphone,
  Eye
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface CuadreHistoryTableProps {
  history: any[]
}

export function CuadreHistoryTable({ history }: CuadreHistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.perfiles?.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || item.estado === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl backdrop-blur-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input 
            placeholder="Buscar por asesor..." 
            className="pl-10 bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:ring-blue-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          <button 
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all border whitespace-nowrap ${statusFilter === 'all' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'}`}
          >
            TODOS
          </button>
          <button 
            onClick={() => setStatusFilter('aprobado')}
            className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all border whitespace-nowrap ${statusFilter === 'aprobado' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'}`}
          >
            APROBADOS
          </button>
          <button 
            onClick={() => setStatusFilter('rechazado')}
            className={`px-3 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all border whitespace-nowrap ${statusFilter === 'rechazado' ? 'bg-rose-500/10 border-rose-500/50 text-rose-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'}`}
          >
            RECHAZADOS
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((item) => {
            const isExpanded = expandedId === item.id;
            const isApproved = item.estado === 'aprobado';
            
            return (
              <Card 
                key={item.id} 
                className={`bg-slate-900/50 border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-blue-500/50 shadow-lg shadow-blue-500/5' : 'border-slate-800 hover:border-slate-700'}`}
              >
                <div 
                  className={`p-3 md:p-4 cursor-pointer sm:flex items-center justify-between ${isExpanded ? 'bg-slate-800/20' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className="flex items-start md:items-center gap-3 md:gap-4 mb-3 sm:mb-0">
                    <div className={`p-2 rounded-lg shrink-0 ${isApproved ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {isApproved ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> : <XCircle className="w-4 h-4 md:w-5 md:h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs md:text-sm font-bold text-white uppercase truncate max-w-[150px] md:max-w-none">
                          {item.perfiles?.nombre_completo}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-black uppercase tracking-widest shrink-0 ${
                          item.tipo_cuadre === 'final' ? 'bg-rose-500/20 text-rose-400' : 
                          item.tipo_cuadre === 'parcial_mañana' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {item.tipo_cuadre === 'final' ? 'DÍA' : 
                           item.tipo_cuadre === 'parcial_mañana' ? 'MAÑANA' : 
                           'PARCIAL'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 md:mt-1">
                        <span className="text-[10px] md:text-[11px] text-slate-500 flex items-center gap-1 font-medium whitespace-nowrap">
                          <Clock className="w-3 h-3" />
                          {format(new Date(item.created_at), "dd MMM, HH:mm", { locale: es })}
                        </span>
                        <span className="text-[10px] md:text-[11px] text-slate-300 font-black whitespace-nowrap">
                          {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(item.saldo_entregado)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-slate-800 sm:border-0 pt-2 sm:pt-0">
                    <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${isApproved ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {item.estado}
                    </span>
                    <div className="flex items-center gap-1">
                       <span className="text-[10px] text-slate-500 sm:hidden">Detalles</span>
                       {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="p-4 pt-0 border-t border-slate-800 bg-slate-950/20">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                      {/* Breakdown */}
                      <div className="space-y-4">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Desglose</p>
                         <div className="space-y-2">
                            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                               <div className="flex items-center gap-2">
                                  <Landmark className="w-3 h-3 text-emerald-400" />
                                  <span className="text-xs text-slate-400">Efectivo:</span>
                               </div>
                               <span className="text-xs font-bold text-white">S/ {item.monto_cobrado_efectivo}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50 border border-slate-800">
                               <div className="flex items-center gap-2">
                                  <Smartphone className="w-3 h-3 text-blue-400" />
                                  <span className="text-xs text-slate-400">Digital:</span>
                               </div>
                               <span className="text-xs font-bold text-white">S/ {item.monto_cobrado_digital}</span>
                            </div>
                         </div>
                      </div>

                      {/* Admin Info */}
                      <div className="space-y-4">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Procesado por</p>
                         <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <span className="text-xs text-slate-300 italic block mb-1">
                               {isApproved ? 'ID del Administrador:' : 'Estado:'}
                            </span>
                            <span className="text-xs font-bold text-blue-400 break-all">
                               {isApproved ? item.admin_id : 'No aprobado'}
                            </span>
                         </div>
                      </div>

                      {/* Observations or extra info */}
                      <div className="space-y-4">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Información adicional</p>
                         <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-slate-400">Total Entregado:</span>
                                <span className="text-xs font-bold text-emerald-400">S/ {item.saldo_entregado}</span>
                            </div>
                            <div className="h-px bg-slate-800 my-2" />
                            <p className="text-[10px] text-slate-500 leading-relaxed italic">
                               {isApproved 
                                 ? "Este cuadre fue validado y los fondos han sido transferidos a las cuentas correspondientes." 
                                 : "Este cuadre fue rechazado por inconsistencias en la información proporcionada."}
                            </p>
                         </div>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })
        ) : (
          <div className="py-20 text-center bg-slate-900/50 border border-slate-800 border-dashed rounded-xl">
             <Filter className="w-12 h-12 text-slate-700 mx-auto mb-4" />
             <p className="text-slate-500 font-medium">No se encontraron resultados para tu búsqueda.</p>
          </div>
        )}
      </div>
    </div>
  )
}
