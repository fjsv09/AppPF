'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScoreIndicator } from '@/components/ui/score-indicator'
import { 
    CheckCircle2, XCircle, Clock, AlertTriangle, Eye, 
    MessageSquare, Loader2, RefreshCw, User, CalendarDays,
    DollarSign, ChevronRight, Calculator,
    Search, X, Filter, MapPin, Activity
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, getFrequencyBadgeStyles } from '@/lib/utils'
import { formatMoney } from '@/utils/format'

interface Solicitud {
    id: string
    prestamo_id: string
    cliente_id: string
    monto_solicitado: number
    interes: number
    cuotas: number
    modalidad: string
    fecha_inicio_propuesta: string
    score_al_solicitar: number
    resumen_comportamiento: any
    monto_maximo_permitido: number
    monto_minimo_permitido: number
    requiere_excepcion: boolean
    tipo_excepcion: string | null
    estado_solicitud: string
    observacion_supervisor: string | null
    motivo_rechazo: string | null
    created_at: string
    cliente: { id: string; nombres: string; dni: string }
    prestamo: { id: string; monto: number; estado: string; estado_mora: string; frecuencia: string }
    asesor: { id: string; nombre_completo: string }
    supervisor?: { id: string; nombre_completo: string }
}

interface RenovacionesSolicitudesProps {
    solicitudes: Solicitud[]
    userRole: 'asesor' | 'supervisor' | 'admin'
    userId: string
}

const estadoConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    'pendiente_supervision': { 
        label: 'Pendiente Supervisión', 
        icon: Clock, 
        color: 'text-amber-400',
        bg: 'bg-amber-500/20 border-amber-500/30'
    },
    'en_correccion': { 
        label: 'En Corrección', 
        icon: MessageSquare, 
        color: 'text-orange-400',
        bg: 'bg-orange-500/20 border-orange-500/30'
    },
    'pre_aprobado': { 
        label: 'Pre-Aprobado', 
        icon: CheckCircle2, 
        color: 'text-blue-400',
        bg: 'bg-blue-500/20 border-blue-500/30'
    },
    'aprobado': { 
        label: 'Aprobado', 
        icon: CheckCircle2, 
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20 border-emerald-500/30'
    },
    'rechazado': { 
        label: 'Rechazado', 
        icon: XCircle, 
        color: 'text-red-400',
        bg: 'bg-red-500/20 border-red-500/30'
    }
}

export function RenovacionesSolicitudes({ solicitudes, userRole, userId }: RenovacionesSolicitudesProps) {
    const router = useRouter()
    const [actionDialog, setActionDialog] = useState<{
        type: 'preprobar' | 'observar' | 'aprobar' | 'rechazar' | null
        solicitud: Solicitud | null
    }>({ type: null, solicitud: null })
    const [loading, setLoading] = useState(false)
    const [inputText, setInputText] = useState('')

    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('todos')
    const [sortField, setSortField] = useState<'created_at' | 'fecha_inicio' | 'fecha_aprobacion'>('created_at')
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

    const filteredSolicitudes = useMemo(() => {
        return solicitudes?.filter(sol => {
            const searchLower = searchTerm.toLowerCase()
            const matchesSearch = 
                sol.cliente?.nombres?.toLowerCase().includes(searchLower) ||
                sol.cliente?.dni?.includes(searchLower)
            
            const matchesStatus = statusFilter === 'todos' || sol.estado_solicitud === statusFilter

            return matchesSearch && matchesStatus
        })?.sort((a, b) => {
            let dateA = new Date(a.created_at).getTime()
            let dateB = new Date(b.created_at).getTime()

            if (sortField === 'fecha_aprobacion') {
                dateA = 0 
                dateB = 0 
            } else if (sortField === 'fecha_inicio') {
                dateA = a.fecha_inicio_propuesta ? new Date(a.fecha_inicio_propuesta).getTime() : 0
                dateB = b.fecha_inicio_propuesta ? new Date(b.fecha_inicio_propuesta).getTime() : 0
            }

            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
        }) || []
    }, [solicitudes, searchTerm, statusFilter, sortField, sortOrder])

    const handleAction = async () => {
        if (!actionDialog.type || !actionDialog.solicitud) return
        
        setLoading(true)
        try {
            const endpoint = `/api/renovaciones/${actionDialog.solicitud.id}/${actionDialog.type}`
            const body: any = {}
            
            if (actionDialog.type === 'observar') {
                body.observacion = inputText
            } else if (actionDialog.type === 'rechazar') {
                body.motivo = inputText
            } else if (actionDialog.type === 'preprobar') {
                body.observacion = inputText || null
                if (actionDialog.solicitud.requiere_excepcion) {
                    body.aprobar_excepcion = true
                }
            }

            const response = await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.error || 'Error procesando acción')
            }

            toast.success(
                actionDialog.type === 'preprobar' ? 'Solicitud pre-aprobada' :
                actionDialog.type === 'observar' ? 'Observación enviada' :
                actionDialog.type === 'aprobar' ? 'Renovación aprobada' :
                'Solicitud rechazada'
            )
            
            setActionDialog({ type: null, solicitud: null })
            setInputText('')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const openAction = (type: typeof actionDialog.type, solicitud: Solicitud) => {
        setActionDialog({ type, solicitud })
        setInputText('')
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-6 shadow-lg shadow-black/20 w-full">
                <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px]">
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
                            <SelectItem value="pendiente_supervision" className="text-yellow-400 focus:text-yellow-400">Pendiente Supervisión</SelectItem>
                            <SelectItem value="pre_aprobado" className="text-blue-400 focus:text-blue-400">Pre-Aprobado</SelectItem>
                            <SelectItem value="en_correccion" className="text-orange-400 focus:text-orange-400">En Corrección</SelectItem>
                            <SelectItem value="aprobado" className="text-emerald-400 focus:text-emerald-400">Aprobado</SelectItem>
                            <SelectItem value="rechazado" className="text-red-400 focus:text-red-400">Rechazado</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex gap-1 shrink-0 bg-slate-950/30 p-1 rounded-lg border border-slate-800/50 w-auto">
                        <Select value={sortField} onValueChange={(val) => setSortField(val as 'created_at' | 'fecha_aprobacion' | 'fecha_inicio')}>
                            <SelectTrigger className="h-10 w-auto min-w-[110px] bg-transparent border-0 text-slate-300 focus:ring-0 text-xs px-2 shrink-0">
                                <span className="text-slate-500 mr-1 hidden sm:inline">Ordenar:</span>
                                <SelectValue placeholder="Ordenar" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                                <SelectItem value="created_at" className="cursor-pointer">Fecha Creación</SelectItem>
                                <SelectItem value="fecha_inicio" className="cursor-pointer">Fecha Inicio</SelectItem>
                                <SelectItem value="fecha_aprobacion" className="cursor-pointer">Fecha Aprobación</SelectItem>
                            </SelectContent>
                        </Select>
                        
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

            {filteredSolicitudes.length === 0 ? (
                <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-800 p-12 text-center">
                    <RefreshCw className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-400 mb-2">
                        No hay solicitudes de renovación
                    </h3>
                    <p className="text-slate-500 text-sm">
                        {userRole === 'asesor' 
                            ? 'Las solicitudes que crees aparecerán aquí'
                            : 'Las solicitudes pendientes de revisión aparecerán aquí'}
                    </p>
                    {(searchTerm !== '' || statusFilter !== 'todos') && (
                        <Button 
                            variant="outline" 
                            className="mt-4 text-slate-400 border-slate-700 hover:text-white"
                            onClick={() => {
                                setSearchTerm('')
                                setStatusFilter('todos')
                                setSortField('created_at')
                                setSortOrder('desc')
                            }}
                        >
                            Limpiar filtros
                        </Button>
                    )}
                </div>
            ) : (
                <>
                    {/* -------------------- MOBILE VIEW (CARDS) -------------------- */}
                    <div className="md:hidden space-y-4">
                        {filteredSolicitudes.map((sol) => {
                    const estado = estadoConfig[sol.estado_solicitud] || estadoConfig['pendiente_supervision']
                    
                    return (
                        <div
                            key={sol.id}
                            className={cn(
                                "group block bg-slate-900 border border-slate-800/60 rounded-xl relative overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md hover:border-slate-700",
                                sol.estado_solicitud === 'aprobado' ? "border-l-[4px] border-l-emerald-500" :
                                sol.estado_solicitud === 'rechazado' ? "border-l-[4px] border-l-red-500" :
                                sol.estado_solicitud === 'en_correccion' ? "border-l-[4px] border-l-orange-500" :
                                "border-l-[4px] border-l-amber-500"
                            )}
                        >
                            <div className="flex flex-col py-3 px-4 gap-3 relative bg-gradient-to-br from-slate-900/50 to-slate-900/10 hover:bg-slate-800/20 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="shrink-0">
                                            <div className="w-10 h-10 rounded-full border border-slate-700 bg-slate-800 text-slate-300 flex items-center justify-center shadow-sm">
                                                <span className="font-bold text-sm">{sol.cliente?.nombres?.charAt(0)}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <h3 className="text-slate-100 font-bold text-base leading-tight truncate pr-1">
                                                {sol.cliente?.nombres}
                                            </h3>
                                            <div className="flex items-center gap-1.5 text-xs mt-0.5">
                                                <span className="font-mono text-slate-500">{sol.cliente?.dni}</span>
                                                <span className="text-slate-600">•</span>
                                                <span className={cn(
                                                    "font-mono font-medium text-[10px] px-1.5 py-0.5 rounded-md border",
                                                    sol.score_al_solicitar >= 80 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" :
                                                    sol.score_al_solicitar >= 60 ? "text-blue-400 border-blue-500/20 bg-blue-500/10" :
                                                    sol.score_al_solicitar >= 40 ? "text-amber-400 border-amber-500/20 bg-amber-500/10" :
                                                    "text-red-400 border-red-500/20 bg-red-500/10"
                                                )}>
                                                    Score: {sol.score_al_solicitar}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        <Badge className={cn('text-[10px] py-0 h-5 border px-1.5', estado.bg, estado.color)}>
                                            {estado.label}
                                        </Badge>
                                        <span className="text-[9px] text-slate-500 font-mono" suppressHydrationWarning>
                                            {new Date(sol.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {sol.requiere_excepcion && (
                                            <Badge className="bg-amber-500/10 border-amber-500/20 text-amber-500 text-[9px] py-0 h-4">
                                                <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Exc
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 mt-1.5 px-1 items-end">
                                    <div className="flex flex-col text-left">
                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Monto</span>
                                        <span className="font-mono text-emerald-400 font-bold text-sm whitespace-nowrap">
                                            <DollarSign className="inline w-3.5 h-3.5 text-emerald-500 mr-0.5 -mt-0.5" />
                                            {sol.monto_solicitado.toLocaleString('en-US')}
                                        </span>
                                    </div>
                                    <div className="flex flex-col text-center items-center">
                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Plan</span>
                                        <div className="flex items-center justify-center gap-1.5">
                                            <CalendarDays className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                            <span className="text-slate-400">{sol.cuotas}</span>
                                            <Badge 
                                                variant="outline" 
                                                className={cn(
                                                    "text-[8px] h-3.5 px-1 border-0 font-bold uppercase",
                                                    getFrequencyBadgeStyles(sol.modalidad)
                                                )}
                                            >
                                                {sol.modalidad.substring(0,3)}.
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex flex-col text-right items-end min-w-0">
                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5 text-right w-full">Asesor</span>
                                        <span className="text-xs text-slate-300 flex items-center justify-end gap-1 truncate w-full">
                                            <User className="h-3 w-3 text-blue-400 shrink-0" />
                                            <span className="truncate">{sol.asesor?.nombre_completo.split(' ')[0]}</span>
                                        </span>
                                    </div>
                                </div>

                                {sol.observacion_supervisor && sol.estado_solicitud === 'en_correccion' && (
                                    <div className="mt-1 text-[10px] bg-orange-900/20 border border-orange-700/30 rounded p-1.5 text-orange-300">
                                        <strong>Obs:</strong> {sol.observacion_supervisor}
                                    </div>
                                )}
                                {sol.motivo_rechazo && (
                                    <div className="mt-1 text-[10px] bg-red-900/20 border border-red-700/30 rounded p-1.5 text-red-300">
                                        <strong>Rechazo:</strong> {sol.motivo_rechazo}
                                    </div>
                                )}

                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/40">
                                    <Button size="sm" variant="outline" className="flex-1 bg-slate-900 border-slate-700 text-slate-300 h-8 text-[11px] hover:text-white" onClick={() => router.push(`/dashboard/renovaciones/${sol.id}`)}>
                                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver Caso
                                    </Button>
                                    {userRole === 'supervisor' && sol.estado_solicitud === 'pendiente_supervision' && (
                                        <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-8 text-[11px]" onClick={() => openAction('preprobar', sol)}>
                                            Pre-aprobar
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* -------------------- HIGHER RES TABLE VIEW -------------------- */}
            <div className="hidden md:block bg-slate-950/40 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    <div className="min-w-[1200px]">
                        {/* Desktop Header */}
                        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                            <div className="col-span-3">Cliente</div>
                            <div className="col-span-2 text-right">Solicitado</div>
                            <div className="col-span-2 text-center">Fecha</div>
                            <div className="col-span-2 text-left pl-4">Asesor</div>
                            <div className="col-span-1 text-center">Estado</div>
                            <div className="col-span-2 text-right">Acciones</div>
                        </div>

                        {/* Content */}
                        <div className="divide-y divide-slate-800/50 text-sm">
                            {filteredSolicitudes.map((sol) => {
                                const estado = estadoConfig[sol.estado_solicitud] || estadoConfig['pendiente_supervision']
                                const IconEstado = estado.icon

                                return (
                                    <div 
                                        key={sol.id} 
                                        style={{
                                            borderLeftWidth: '6px',
                                            borderLeftStyle: 'solid',
                                            borderLeftColor: sol.estado_solicitud === 'aprobado' ? '#10b981' :
                                                sol.estado_solicitud === 'rechazado' ? '#ef4444' :
                                                sol.estado_solicitud === 'en_correccion' ? '#f97316' : '#fbbf24'
                                        }}
                                        className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-800/40 transition-all items-center group relative pl-[calc(1.5rem-6px)]"
                                    >
                                        {/* Cliente */}
                                        <div className="col-span-3 flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 shadow-lg transition-transform group-hover:scale-105">
                                                <span className="font-bold text-slate-300 text-xs">{sol.cliente?.nombres?.charAt(0)}</span>
                                            </div>
                                            <div className="min-w-0 flex flex-col justify-center">
                                                <div className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate leading-tight">{sol.cliente?.nombres}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-slate-500 font-mono bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800/50 truncate">
                                                        {sol.cliente?.dni}
                                                    </span>

                                                </div>
                                            </div>
                                        </div>

                                        {/* Solicitado */}
                                        <div className="col-span-2 text-right flex flex-col items-end justify-center min-w-0">
                                            <div className="text-sm font-mono font-bold text-slate-300">${sol.monto_solicitado.toLocaleString('en-US')}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-end gap-1 leading-tight">
                                                <span>{sol.cuotas}</span>
                                                <Badge 
                                                    variant="outline" 
                                                    className={cn(
                                                        "text-[8px] h-3.5 px-1 border-0 font-bold uppercase",
                                                        getFrequencyBadgeStyles(sol.modalidad)
                                                    )}
                                                >
                                                    {sol.modalidad}
                                                </Badge>
                                                <span>al {sol.interes}%</span>
                                            </div>
                                        </div>

                                        {/* Fecha */}
                                        <div className="col-span-2 flex flex-col items-center justify-center text-center">
                                            <span className="text-xs font-medium text-slate-300">
                                                {new Date(sol.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono" suppressHydrationWarning>
                                                {new Date(sol.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        {/* Asesor */}
                                        <div className="col-span-2 text-left pl-4 flex items-center gap-2 min-w-0">
                                            <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                            <span className="text-sm text-slate-300 truncate">{sol.asesor?.nombre_completo}</span>
                                        </div>

                                        {/* Estado */}
                                        <div className="col-span-1 flex justify-center items-center min-w-0">
                                            <div className="flex flex-col gap-1 items-center justify-center">
                                                <Badge className={cn('text-[10px] py-0 h-5 border px-2 flex items-center gap-1 w-max', estado.bg, estado.color)}>
                                                    {estado.label}
                                                </Badge>
                                                {sol.requiere_excepcion && (
                                                    <Badge className="bg-amber-500/10 border-amber-500/20 text-amber-400 text-[9px] py-0 h-4 flex items-center w-max">
                                                        <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Exc
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Acciones */}
                                        <div className="col-span-2 flex items-center justify-end gap-1.5">
                                            {userRole === 'supervisor' && sol.estado_solicitud === 'pendiente_supervision' && (
                                                <>
                                                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-orange-600/50 text-orange-400 hover:bg-orange-900/40" onClick={() => openAction('observar', sol)} title="Enviar Observaciones">
                                                        <MessageSquare className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" className="h-8 w-8 p-0 bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600/40" onClick={() => openAction('preprobar', sol)} title="Pre-aprobar">
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                            {userRole === 'admin' && sol.estado_solicitud === 'pre_aprobado' && (
                                                <>
                                                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-red-600/50 text-red-400 hover:bg-red-900/40" onClick={() => openAction('rechazar', sol)} title="Rechazar">
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" className="h-8 w-8 p-0 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/40" onClick={() => openAction('aprobar', sol)} title="Aprobar Renovación">
                                                        <CheckCircle2 className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-700/50 transition-all" onClick={() => router.push(`/dashboard/renovaciones/${sol.id}`)} title="Ver Detalle">
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        
                                        {sol.observacion_supervisor && sol.estado_solicitud === 'en_correccion' && (
                                            <div className="col-span-12 mt-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex gap-2 items-start opacity-90">
                                                <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                                                <div>
                                                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-0.5">Observación del Supervisor</p>
                                                    <p className="text-xs text-orange-200">{sol.observacion_supervisor}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Diálogo de acción */}
            <Dialog 
                open={actionDialog.type !== null} 
                onOpenChange={(open) => !open && setActionDialog({ type: null, solicitud: null })}
            >
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle>
                            {actionDialog.type === 'preprobar' && 'Pre-aprobar Solicitud'}
                            {actionDialog.type === 'observar' && 'Enviar Observaciones'}
                            {actionDialog.type === 'aprobar' && 'Aprobar Renovación'}
                            {actionDialog.type === 'rechazar' && 'Rechazar Solicitud'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            {actionDialog.solicitud?.cliente?.nombres} - ${formatMoney(actionDialog.solicitud?.monto_solicitado)}
                        </DialogDescription>
                    </DialogHeader>

                    {actionDialog.solicitud?.requiere_excepcion && actionDialog.type === 'preprobar' && (
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-amber-400 font-medium text-sm">Esta solicitud requiere excepción</p>
                                <p className="text-slate-400 text-xs mt-0.5">
                                    Tipo: {actionDialog.solicitud.tipo_excepcion}. Al pre-aprobar, estarás autorizando la excepción.
                                </p>
                            </div>
                        </div>
                    )}

                    {(actionDialog.type === 'observar' || actionDialog.type === 'rechazar') && (
                        <div className="grid gap-2">
                            <Label>
                                {actionDialog.type === 'observar' ? 'Observaciones' : 'Motivo de rechazo'}
                            </Label>
                            <Textarea
                                value={inputText}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                                placeholder={
                                    actionDialog.type === 'observar' 
                                        ? 'Describe las correcciones necesarias...'
                                        : 'Explica el motivo del rechazo...'
                                }
                                className="bg-slate-950 border-slate-800 min-h-[100px]"
                            />
                        </div>
                    )}

                    {actionDialog.type === 'preprobar' && (
                        <div className="grid gap-2">
                            <Label>Observaciones (opcional)</Label>
                            <Textarea
                                value={inputText}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                                placeholder="Agregar comentarios para el admin..."
                                className="bg-slate-950 border-slate-800 min-h-[80px]"
                            />
                        </div>
                    )}

                    {actionDialog.type === 'aprobar' && (
                        <div className="text-center py-4">
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                            <p className="text-slate-300">
                                ¿Confirmas aprobar esta renovación?
                            </p>
                            <p className="text-slate-500 text-sm mt-1">
                                Se creará el nuevo préstamo y se cerrará el anterior.
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setActionDialog({ type: null, solicitud: null })}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleAction}
                            disabled={loading || ((actionDialog.type === 'observar' || actionDialog.type === 'rechazar') && !inputText.trim())}
                            className={cn(
                                actionDialog.type === 'rechazar' ? 'bg-red-600 hover:bg-red-500' :
                                actionDialog.type === 'aprobar' ? 'bg-emerald-600 hover:bg-emerald-500' :
                                'bg-blue-600 hover:bg-blue-500'
                            )}
                        >
                            {loading ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                            ) : (
                                <>
                                    {actionDialog.type === 'preprobar' && 'Pre-aprobar'}
                                    {actionDialog.type === 'observar' && 'Enviar Observaciones'}
                                    {actionDialog.type === 'aprobar' && 'Aprobar'}
                                    {actionDialog.type === 'rechazar' && 'Rechazar'}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                </>
            )}
        </div>
    )
}
