'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, AlertTriangle, ExternalLink, Calendar, Image as ImageIcon, Search, X, User, Activity, Filter, Shield, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/utils/format'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { UploadEvidenceButton } from '@/components/dashboard/upload-evidence-button'
import { CompleteAuditModal } from '@/components/auditoria/complete-audit-modal'

export function TareasList({ initialTareas, userId, userRol }: { initialTareas: any[], userId: string, userRol?: string }) {
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('todos')
    const [tipoFilter, setTipoFilter] = useState('todos')
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

    const filteredTareas = useMemo(() => {
        return initialTareas?.filter(tarea => {
            const searchLower = searchTerm.toLowerCase()
            const nombreCompleto = tarea.prestamo?.cliente?.nombres || ''
            const dniCliente = tarea.prestamo?.cliente?.dni || ''

            const matchesSearch = searchTerm === '' || 
                nombreCompleto.toLowerCase().includes(searchLower) ||
                dniCliente.includes(searchLower)
            
            const matchesStatus = statusFilter === 'todos' || tarea.estado === statusFilter
            const matchesTipo = (tipoFilter === 'todos' || tarea.tipo === tipoFilter) && 
                tarea.tipo !== 'gestion_asignada' && 
                tarea.tipo !== 'visita_asignada'

            return matchesSearch && matchesStatus && matchesTipo
        })?.sort((a, b) => {
            let dateA = new Date(a.created_at).getTime()
            let dateB = new Date(b.created_at).getTime()

            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
        }) || []
    }, [initialTareas, searchTerm, statusFilter, tipoFilter, sortOrder])

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-6 shadow-lg shadow-black/20 w-full">
                <div className="relative w-full md:flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Buscar cliente, DNI..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-10 pl-9 pr-8 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:bg-slate-900 transition-colors w-full"
                    />
                    {searchTerm && (
                         <Button 
                             variant="ghost" 
                             size="icon" 
                             onClick={() => setSearchTerm('')}
                             className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full"
                             title="Restablecer búsqueda"
                         >
                             <X className="h-3.5 w-3.5" />
                         </Button>
                    )}
                </div>
                
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-10 w-auto min-w-[140px] shrink-0 bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                            <Activity className="w-3 h-3 mr-2 text-emerald-400 shrink-0" />
                            <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="todos">Todos Estados</SelectItem>
                            <SelectItem value="pendiente" className="text-amber-400 focus:text-amber-400">Pendiente</SelectItem>
                            <SelectItem value="completada" className="text-emerald-400 focus:text-emerald-400">Completada</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={tipoFilter} onValueChange={setTipoFilter}>
                        <SelectTrigger className="h-10 w-auto min-w-[140px] shrink-0 bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                            <Filter className="w-3 h-3 mr-2 text-blue-400 shrink-0" />
                            <SelectValue placeholder="Tipos" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="todos">Todos Tipos</SelectItem>
                            <SelectItem value="nuevo_prestamo" className="text-purple-400 focus:text-purple-400">Nuevo Préstamo</SelectItem>
                            <SelectItem value="renovacion" className="text-blue-400 focus:text-blue-400">Renovación</SelectItem>
                            <SelectItem value="refinanciacion" className="text-orange-400 focus:text-orange-400">Refinanciación</SelectItem>
                            <SelectItem value="auditoria_dirigida" className="text-emerald-400 focus:text-emerald-400">Auditoría Dirigida</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex gap-1 shrink-0 bg-slate-950/30 p-1 rounded-lg border border-slate-800/50 w-auto">
                        <div className="flex items-center px-2 text-xs text-slate-500 whitespace-nowrap">
                            <span className="hidden sm:inline">Ordenar: Fecha Creación</span>
                            <span className="sm:hidden">Fecha</span>
                        </div>
                        
                        <div className="w-px bg-slate-800 my-1 mx-1 shrink-0" />

                        <div className="flex items-center shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSortOrder('asc')}
                                className={cn("h-8 w-8 rounded hover:bg-slate-800 shrink-0", sortOrder === 'asc' ? "text-blue-400 bg-blue-950/20" : "text-slate-500")}
                                title="Ascendente (Más antiguos primero)"
                                type="button"
                            >
                                <span className="text-sm">↑</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSortOrder('desc')}
                                className={cn("h-8 w-8 rounded hover:bg-slate-800 shrink-0", sortOrder === 'desc' ? "text-blue-400 bg-blue-950/20" : "text-slate-500")}
                                title="Descendente (Más recientes primero)"
                                type="button"
                            >
                                <span className="text-sm">↓</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex flex-col gap-3">
                {filteredTareas.length > 0 ? (
                    <>
                        {/* -------------------- MOBILE VIEW (CARDS) -------------------- */}
                        <div className="md:hidden space-y-4">
                            {filteredTareas.map(tarea => {
                                const borderColor = tarea.estado === 'completada' ? 'border-l-emerald-500' : 'border-l-amber-500';
                                return (
                                    <div key={tarea.id} className={cn(
                                        "group block bg-slate-900 border border-slate-800/60 rounded-xl relative overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md hover:border-slate-700",
                                        "border-l-[4px]", borderColor
                                    )}>
                                       <div className="flex flex-col p-3 gap-2.5 relative bg-gradient-to-br from-slate-900/50 to-slate-900/10">
                                            <div className="flex items-start justify-between gap-2.5">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="shrink-0">
                                                        <div className="w-9 h-9 rounded-full border border-slate-700 bg-slate-800 text-slate-300 flex items-center justify-center shadow-sm">
                                                            <span className="font-bold text-sm tracking-tight">{tarea.prestamo?.cliente?.nombres?.charAt(0) || 'C'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <h3 className="text-slate-100 font-bold text-[15px] leading-tight truncate pr-1">
                                                            {tarea.prestamo?.cliente?.nombres}
                                                        </h3>
                                                        <div className="flex items-center mt-0.5">
                                                            <Badge variant="outline" className={`px-1.5 py-0 text-[8px] tracking-wider uppercase border text-slate-300 border-slate-600 bg-slate-800/50 leading-tight`}>
                                                                {tarea.tipo.replace('_', ' ')}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex flex-col items-end">
                                                    {tarea.estado === 'completada' ? (
                                                        <Badge className="text-[10px] py-0 h-5 border px-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                                            <CheckCircle2 className="w-3 h-3 mr-1"/> Completada
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="text-[10px] py-0 h-5 border px-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                            <AlertTriangle className="w-3 h-3 mr-1"/> Pendiente
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 mt-0.5 px-0.5 items-end">
                                                <div className="flex flex-col text-left">
                                                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1 leading-none">Monto</span>
                                                    <span className="font-mono text-emerald-400 font-bold text-[15px] leading-none whitespace-nowrap">
                                                        ${formatMoney(tarea.prestamo?.monto)}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col text-right items-end min-w-0">
                                                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1 w-full leading-none">Asesor</span>
                                                    <span className="text-sm text-slate-300 flex items-center justify-end gap-1.5 truncate w-full leading-none">
                                                        <User className="h-3 w-3 text-blue-400 shrink-0" />
                                                        <span className="truncate">{tarea.asesor?.nombre_completo.split(' ')[0]}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-2 mt-1.5 pt-2.5 border-t border-slate-800/40">
                                                 <Link 
                                                    href={`/dashboard/prestamos/${tarea.prestamo_id}?tab=historial`} 
                                                    className="flex items-center gap-1.5 text-[12px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                                 >
                                                    <ExternalLink className="w-3.5 h-3.5" /> Ir al Préstamo
                                                 </Link>
                                                 
                                                 <div>
                                                    {tarea.estado === 'completada' ? (
                                                         <div className="flex items-center gap-2">
                                                            {tarea.evidencia_url?.startsWith('[AUDITORÍA') ? (
                                                                <span className="text-[10px] text-emerald-400 font-mono italic max-w-[120px] truncate">
                                                                   Auditada OK
                                                                </span>
                                                            ) : tarea.evidencia_url ? (
                                                               <div className="w-12 h-8 rounded border border-slate-700 overflow-hidden relative">
                                                                  <ImageLightbox 
                                                                      src={tarea.evidencia_url}
                                                                      alt="Evidencia"
                                                                      thumbnail={ <img src={tarea.evidencia_url} className="w-full h-full object-cover" /> }
                                                                  />
                                                               </div>
                                                            ) : null}
                                                         </div>
                                                     ) : tarea.estado === 'pendiente' && (userId === tarea.asesor_id || (tarea.tipo.includes('auditoria') && (userRol === 'admin' || userRol === 'supervisor'))) ? (
                                                         <div className="transform scale-[0.85] origin-right -my-1">
                                                             {tarea.tipo.includes('auditoria_dirigida') ? (
                                                                 <CompleteAuditModal 
                                                                     tareaId={tarea.id}
                                                                     clienteNombre={tarea.prestamo?.cliente?.nombres}
                                                                     clienteTelefono={tarea.prestamo?.cliente?.telefono} // Necesitamos telefono
                                                                 />
                                                             ) : (
                                                                 <UploadEvidenceButton 
                                                                     tareaId={tarea.id}
                                                                     clienteNombre={tarea.prestamo?.cliente?.nombres || 'Cliente'}
                                                                     compact={true} 
                                                                 />
                                                             )}
                                                         </div>
                                                     ) : (
                                                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                            {tarea.tipo.includes('auditoria') ? <Phone className="w-3 h-3"/> : <ImageIcon className="w-3 h-3"/>}
                                                            {tarea.tipo.includes('auditoria') ? 'Pendiente Llamada' : 'Sin foto'}
                                                        </span>
                                                    )}
                                                 </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* -------------------- HIGHER RES TABLE VIEW -------------------- */}
                        <div className="hidden md:block bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                            {/* Desktop Header */}
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                                <div className="col-span-3">Cliente</div>
                                <div className="col-span-1 text-right">Monto</div>
                                <div className="col-span-2 text-center">Tipo</div>
                                <div className="col-span-2 text-left pl-4">Asesor</div>
                                <div className="col-span-2 text-center">Estado</div>
                                <div className="col-span-1 text-center">Evidencia</div>
                                <div className="col-span-1 text-right">Acciones</div>
                            </div>

                            {/* Content */}
                            <div className="divide-y divide-slate-800/50 text-sm">
                                {filteredTareas.map((tarea) => {
                                    const borderColor = tarea.estado === 'completada' ? '#10b981' : '#f59e0b';
                                    return (
                                        <div 
                                            key={tarea.id} 
                                            style={{
                                                borderLeftWidth: '6px',
                                                borderLeftStyle: 'solid',
                                                borderLeftColor: borderColor
                                            }}
                                            className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-800/40 transition-all items-center group relative pl-[calc(1.5rem-6px)]"
                                        >
                                            <div className="col-span-3 flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg- slate-800 border border-slate-700 flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:scale-105">
                                                    <span className="font-bold text-slate-300 text-xs">{tarea.prestamo?.cliente?.nombres?.charAt(0) || 'C'}</span>
                                                </div>
                                                <div className="min-w-0 flex flex-col justify-center w-full">
                                                    <div className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate mb-1">
                                                        {tarea.prestamo?.cliente?.nombres}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-400 font-mono bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800/50 truncate max-w-[80px]">
                                                            #{tarea.prestamo_id.split('-')[0]}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 flex items-center gap-1" suppressHydrationWarning>
                                                            <Calendar className="w-3 h-3 text-slate-500" />
                                                            {new Date(tarea.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="col-span-1 text-right flex flex-col items-end justify-center min-w-0">
                                                <div className="text-sm font-mono font-bold text-emerald-400 flex items-center gap-0.5">
                                                    ${formatMoney(tarea.prestamo?.monto)}
                                                </div>
                                            </div>

                                            <div className="col-span-2 text-center min-w-0 flex items-center justify-center">
                                                <Badge variant="outline" className={`px-2 py-0.5 h-auto text-[9px] tracking-wider uppercase border text-center whitespace-nowrap
                                                    ${tarea.tipo === 'nuevo_prestamo' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 
                                                      tarea.tipo === 'renovacion' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 
                                                      tarea.tipo.includes('auditoria') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-orange-500/10 text-orange-400 border-orange-500/30'}
                                                `}>
                                                    {tarea.tipo.replace('_', ' ')}
                                                </Badge>
                                            </div>

                                            <div className="col-span-2 text-left pl-4 flex items-center gap-2 min-w-0">
                                                <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                <span className="text-sm text-slate-300 truncate">{tarea.asesor?.nombre_completo.split(' ')[0]}</span>
                                            </div>

                                            <div className="col-span-2 flex justify-center items-center min-w-0">
                                                {tarea.estado === 'completada' ? (
                                                    <Badge className="text-[10px] py-0 h-5 border px-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 w-max">
                                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Completada
                                                    </Badge>
                                                ) : (
                                                    <Badge className="text-[10px] py-0 h-5 border px-2 bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse w-max">
                                                        <AlertTriangle className="w-3 h-3 mr-1" /> Pendiente
                                                    </Badge>
                                                )}
                                            </div>

                                             {/* Evidencia */}
                                             <div className="col-span-1 flex items-center justify-center">
                                                 {tarea.estado === 'completada' ? (
                                                      <div className="flex items-center gap-2">
                                                         {tarea.evidencia_url?.startsWith('[AUDITORÍA') ? (
                                                             <div className="flex flex-col items-center">
                                                                 <Shield className="w-5 h-5 text-emerald-500" />
                                                                 <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-tighter">Auditada OK</span>
                                                             </div>
                                                         ) : (
                                                             <div className="w-12 h-8 rounded border border-emerald-500/30 overflow-hidden relative shadow-sm hover:scale-[1.15] hover:z-50 transition-transform">
                                                                 <ImageLightbox 
                                                                     src={tarea.evidencia_url}
                                                                     alt="Evidencia"
                                                                     thumbnail={ <img src={tarea.evidencia_url} alt="thumbnail" className="w-full h-full object-cover" /> }
                                                                 />
                                                             </div>
                                                         )}
                                                      </div>
                                                 ) : tarea.estado === 'pendiente' && (userId === tarea.asesor_id || (tarea.tipo.includes('auditoria') && (userRol === 'admin' || userRol === 'supervisor'))) ? (
                                                     <div className="transform scale-90">
                                                         {tarea.tipo.includes('auditoria_dirigida') ? (
                                                             <CompleteAuditModal 
                                                                 tareaId={tarea.id}
                                                                 clienteNombre={tarea.prestamo?.cliente?.nombres}
                                                                 clienteTelefono={tarea.prestamo?.cliente?.telefono}
                                                             />
                                                         ) : (
                                                             <UploadEvidenceButton 
                                                                 tareaId={tarea.id}
                                                                 clienteNombre={tarea.prestamo?.cliente?.nombres || 'Cliente'}
                                                                 compact={true} 
                                                             />
                                                         )}
                                                     </div>
                                                 ) : (
                                                     <span className="text-[10px] text-slate-500 flex items-center justify-center gap-1 group-hover:text-amber-500/50 transition-colors">
                                                         {tarea.tipo.includes('auditoria') ? <Phone className="w-3.5 h-3.5 text-blue-400" /> : <AlertTriangle className="w-3 h-3" />}
                                                         {tarea.tipo.includes('auditoria') ? 'Pend. Llamada' : 'Sin foto'}
                                                     </span>
                                                 )}
                                             </div>

                                            {/* Acciones */}
                                            <div className="col-span-1 flex items-center justify-end">
                                                <Link 
                                                    href={`/dashboard/prestamos/${tarea.prestamo_id}?tab=historial`} 
                                                    className="h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-blue-400 hover:bg-blue-900/40 hover:border-blue-700/50 transition-all"
                                                    title="Ir al Préstamo"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Link>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40">
                        <ImageIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-white font-medium pb-2">No hay tareas de evidencia registradas</h3>
                        {(searchTerm !== '' || statusFilter !== 'todos' || tipoFilter !== 'todos') && (
                            <Button 
                                variant="outline" 
                                className="mt-2 text-slate-400 border-slate-700 hover:text-white"
                                onClick={() => {
                                    setSearchTerm('')
                                    setStatusFilter('todos')
                                    setTipoFilter('todos')
                                    setSortOrder('desc')
                                }}
                            >
                                Limpiar filtros
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
