'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { FileText, Clock, CheckCircle, XCircle, AlertCircle, Eye, Users, Calendar, DollarSign, Search, X, Filter, ArrowUp, ArrowDown, MapPin, Activity, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const estadoConfig: Record<string, { label: string, color: string, icon: any }> = {
    'pendiente_supervision': { label: 'Pendiente Supervisión', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
    'en_correccion': { label: 'En Corrección', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: AlertCircle },
    'pre_aprobado': { label: 'Pre-Aprobado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Eye },
    'aprobado': { label: 'Aprobado', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
    'rechazado': { label: 'Rechazado', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export function SolicitudesList({ initialSolicitudes, perfil }: { initialSolicitudes: any[], perfil: any }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    // --- URL STATE MANAGEMENT ---
    const searchTerm = searchParams.get('search') || ''
    const statusFilter = searchParams.get('status') || 'todos'
    const sortField = (searchParams.get('sortBy') as 'created_at' | 'fecha_aprobacion' | 'fecha_inicio') || 'created_at'
    const sortOrder = (searchParams.get('order') as 'desc' | 'asc') || 'desc'

    // Debounce State for Search
    const [localSearch, setLocalSearch] = useState(searchTerm)

    // Sync local search with URL if it changes externally
    useEffect(() => {
        setLocalSearch(searchParams.get('search') || '')
    }, [searchParams])

    // Debounce Search Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            const current = searchParams.get('search') || ''
            if (localSearch !== current) {
                updateParams({ search: localSearch || null })
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [localSearch])

    const updateParams = (updates: Record<string, string | null>) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null || value === 'todos') {
                    params.delete(key)
                } else {
                    params.set(key, value)
                }
            })
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const filteredSolicitudes = useMemo(() => {
        return initialSolicitudes?.filter(solicitud => {
            const searchLower = searchTerm.toLowerCase()
            const nombreCompleto = solicitud.cliente?.nombres || solicitud.prospecto_nombres || ''
            const dniCliente = solicitud.cliente?.dni || solicitud.prospecto_dni || ''

            const matchesSearch = searchTerm === '' || 
                nombreCompleto.toLowerCase().includes(searchLower) ||
                dniCliente.includes(searchLower)
            
            const matchesStatus = statusFilter === 'todos' || solicitud.estado_solicitud === statusFilter

            return matchesSearch && matchesStatus
        })?.sort((a, b) => {
            let dateA = new Date(a.created_at).getTime()
            let dateB = new Date(b.created_at).getTime()

            if (sortField === 'fecha_aprobacion') {
                dateA = a.fecha_aprobacion ? new Date(a.fecha_aprobacion).getTime() : 0 
                dateB = b.fecha_aprobacion ? new Date(b.fecha_aprobacion).getTime() : 0 
            } else if (sortField === 'fecha_inicio') {
                dateA = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : 0
                dateB = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : 0
            }

            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
        }) || []
    }, [initialSolicitudes, searchTerm, statusFilter, sortField, sortOrder])

    return (
        <div className="space-y-4 pb-32">
            {/* Filters */}
            <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-6 shadow-lg shadow-black/20 w-full">
                <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Buscar cliente, DNI..."
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        className="h-10 pl-9 pr-8 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:bg-slate-900 transition-colors w-full"
                    />
                    {localSearch && (
                         <Button 
                             variant="ghost" 
                             size="icon" 
                             onClick={() => setLocalSearch('')}
                             className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full"
                             title="Restablecer búsqueda"
                         >
                             <X className="h-3.5 w-3.5" />
                         </Button>
                    )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    <Select value={statusFilter} onValueChange={(val) => updateParams({ status: val })}>
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
                        <Select value={sortField} onValueChange={(val) => updateParams({ sortBy: val })}>
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
                                onClick={() => updateParams({ order: 'asc' })}
                                className={cn("h-8 w-8 rounded hover:bg-slate-800 shrink-0", sortOrder === 'asc' ? "text-blue-400 bg-blue-950/20" : "text-slate-500")}
                                title="Ascendente (Más antiguos primero)"
                                type="button"
                            >
                                <span className="text-sm">↑</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => updateParams({ order: 'desc' })}
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

            <div className="relative min-h-[400px]">
                {/* Loader centralizado */}
                {isPending && (
                    <div className="absolute inset-x-0 top-20 z-50 flex items-center justify-center animate-in fade-in duration-300">
                        <div className="bg-slate-950/40 backdrop-blur-md p-4 rounded-full border border-white/5 shadow-2xl">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    </div>
                )}

                <div className={cn(
                    "md:bg-slate-900/50 md:border md:border-slate-800 md:rounded-2xl md:overflow-hidden bg-transparent border-0 space-y-4 md:space-y-0 transition-all duration-300",
                    isPending ? "opacity-40 blur-[1px] pointer-events-none" : "opacity-100 placeholder-blur-0"
                )}>
                {filteredSolicitudes.length === 0 ? (
                    <div className="text-center py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40">
                        <FileText className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                        <p className="text-slate-500 font-medium pb-2">No se encontraron solicitudes</p>
                        {perfil?.rol === 'asesor' && statusFilter === 'todos' && searchTerm === '' && (
                            <Link href="/dashboard/solicitudes/nueva">
                                <Button variant="outline" className="mt-4">
                                    Crear tu primera solicitud
                                </Button>
                            </Link>
                        )}
                        {(localSearch !== '' || statusFilter !== 'todos') && (
                            <Button 
                                variant="outline" 
                                className="mt-2 text-slate-400 border-slate-700 hover:text-white"
                                onClick={() => {
                                    setLocalSearch('')
                                    updateParams({
                                        search: null,
                                        status: 'todos',
                                        sortBy: 'created_at',
                                        order: 'desc'
                                    })
                                }}
                            >
                                Limpiar filtros
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Header */}
                        <div 
                            className="hidden md:grid gap-4 px-6 py-3 bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-500 items-center"
                            style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
                        >
                            <div className="col-span-3">Cliente</div>
                            <div className="col-span-2 text-right">Monto</div>
                            <div className="col-span-2 text-center">Fecha</div>
                            <div className="col-span-2 text-left pl-4">Asesor</div>
                            <div className="col-span-2 text-center">Estado</div>
                            <div className="col-span-1 text-right">Acción</div>
                        </div>

                        {/* Content */}
                        <div className="flex flex-col gap-4 md:gap-0 md:block">
                            {filteredSolicitudes.map((solicitud, index) => {
                                const config = estadoConfig[solicitud.estado_solicitud] || estadoConfig['pendiente_supervision']
                                const IconComponent = config.icon
                                const isLast = index === filteredSolicitudes.length - 1

                                return (
                                    <div key={solicitud.id} className={cn(
                                        "group flex flex-col md:block",
                                        !isLast && "md:border-b md:border-slate-800/60" // línea de separación en desktop
                                    )}>
                                        {/* ================== MOBILE VIEW ================== */}
                                        <div className={cn("md:hidden p-3 rounded-xl border border-slate-800/60 bg-slate-900 shadow-sm transition-all duration-200 border-l-[4px]", 
                                            solicitud.estado_solicitud === 'aprobado' ? "border-l-emerald-500" :
                                            solicitud.estado_solicitud === 'rechazado' ? "border-l-red-500" :
                                            solicitud.estado_solicitud === 'en_correccion' ? "border-l-orange-500" :
                                            "border-l-amber-500"
                                        )}>
                                            <div className="flex flex-col py-0.5 gap-2 relative">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                                                            <span className="font-bold text-slate-300 text-xs">{(solicitud.cliente?.nombres || solicitud.prospecto_nombres)?.charAt(0) || '?'}</span>
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <h3 className="text-slate-100 font-bold text-sm leading-tight truncate">
                                                                    {solicitud.cliente?.nombres || solicitud.prospecto_nombres || 'Desconocido'}
                                                                </h3>
                                                                {!solicitud.cliente && solicitud.prospecto_nombres && (
                                                                    <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-purple-500/10 text-purple-400 border-purple-500/30 font-medium">PROSPECTO</Badge>
                                                                )}
                                                            </div>
                                                             <span className="text-[10px] text-slate-500 font-mono mt-0.5">{solicitud.cliente?.dni || solicitud.prospecto_dni || '---'}</span>
                                                         </div>
                                                    </div>
                                                    <div className="shrink-0 text-right flex flex-col items-end gap-1">
                                                         <Badge className={cn('text-[10px] py-0 h-5 border px-1.5 flex items-center gap-1', config.color)}>
                                                             <IconComponent className="w-3 h-3" />
                                                             {config.label}
                                                         </Badge>
                                                          <span className="text-[9px] text-slate-500 font-mono" suppressHydrationWarning>
                                                              {new Date(solicitud.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                          </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 mt-1.5 px-1 items-end">
                                                    {/* Monto - Izquierda */}
                                                    <div className="flex flex-col text-left">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Monto</span>
                                                        <span className="font-mono text-emerald-400 font-bold text-xs whitespace-nowrap">
                                                            <span className="text-emerald-500 mr-0.5 -mt-0.5 font-bold">S/ </span>
                                                            {solicitud.monto_solicitado.toLocaleString('en-US')}
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Plan - Centro */}
                                                    <div className="flex flex-col text-center items-center">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Plan</span>
                                                        <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                                                            <Calendar className="h-3 w-3 text-slate-500 shrink-0" />
                                                            <span className="truncate">{solicitud.cuotas} {solicitud.modalidad.substring(0,3)}.</span>
                                                        </span>
                                                    </div>

                                                    {/* Asesor - Derecha */}
                                                    <div className="flex flex-col text-right items-end min-w-0">
                                                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-0.5 text-right w-full">Asesor</span>
                                                        <span className="text-xs text-slate-300 flex items-center justify-end gap-1 truncate w-full">
                                                            <Users className="h-3 w-3 text-blue-400 shrink-0" />
                                                            <span className="truncate">{solicitud.asesor?.nombre_completo.split(' ')[0]}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {solicitud.observacion_supervisor && solicitud.estado_solicitud === 'en_correccion' && (
                                                    <div className="mt-1 text-[10px] bg-orange-900/20 border border-orange-700/30 rounded p-1.5 text-orange-300">
                                                        <strong>Obs:</strong> {solicitud.observacion_supervisor}
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2 mt-2">
                                                    {solicitud.estado_solicitud === 'aprobado' && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            className="flex-1 bg-emerald-900/20 border-emerald-500/30 text-emerald-400 h-8 text-[11px] hover:bg-emerald-500/20"
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                const phone = (solicitud.cliente?.telefono || solicitud.prospecto_telefono)?.replace(/\D/g, '') || ''
                                                                const monto = solicitud.monto_solicitado.toLocaleString('en-US')
                                                                const clienteNombre = solicitud.cliente?.nombres || solicitud.prospecto_nombres
                                                                const message = encodeURIComponent(`Hola ${clienteNombre}, le saludamos de ProFinanzas. Le informamos que su solicitud de préstamo por un monto de S/ ${monto} ha sido APROBADA y desembolsada. ¡Felicidades!`)
                                                                window.open(`https://wa.me/51${phone}?text=${message}`, '_blank')
                                                            }}
                                                        >
                                                            <svg className="w-3 h-3 mr-1 fill-current" viewBox="0 0 24 24">
                                                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.565.928 3.178 1.416 4.856 1.417 5.341 0 9.69-4.348 9.693-9.691.002-2.59-1.01-5.025-2.847-6.865-1.838-1.837-4.271-2.847-6.863-2.848-5.341 0-9.69 4.349-9.692 9.691-.001 1.831.515 3.614 1.491 5.162l-.994 3.63 3.712-.974zm11.367-7.46c-.066-.11-.244-.176-.511-.309-.267-.133-1.583-.781-1.827-.87-.245-.089-.423-.133-.6.133-.177.266-.689.87-.845 1.047-.156.177-.311.199-.578.066-.267-.133-1.127-.416-2.146-1.326-.793-.707-1.329-1.58-1.485-1.847-.156-.266-.016-.411.117-.544.12-.119.267-.31.4-.466.133-.155.177-.266.267-.443.089-.178.044-.333-.022-.466-.067-.133-.6-1.446-.822-1.979-.217-.518-.434-.447-.6-.456-.153-.008-.328-.01-.502-.01-.174 0-.457.065-.696.327-.24.262-.915.894-.915 2.178 0 1.284.934 2.525 1.065 2.702.131.177 1.836 2.805 4.448 3.931.621.267 1.106.427 1.484.547.623.198 1.19.17 1.637.104.498-.074 1.583-.647 1.805-1.27.222-.623.222-1.157.156-1.27z" />
                                                            </svg>
                                                            Notificar
                                                        </Button>
                                                    )}
                                                    <Link href={`/dashboard/solicitudes/${solicitud.id}`} className={cn(solicitud.estado_solicitud === 'aprobado' ? "flex-1" : "w-full")}>
                                                        <Button size="sm" variant="outline" className="w-full bg-slate-900 border-slate-700 text-slate-300 h-8 text-[11px] hover:text-white">
                                                            <Eye className="w-3 h-3 mr-1" /> Ver Detalles
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ================== DESKTOP VIEW ================== */}
                                        <div 
                                            className={cn("hidden md:grid gap-4 px-6 py-4 items-center hover:bg-slate-800/30 transition-colors border-l-4", 
                                                solicitud.estado_solicitud === 'aprobado' ? "border-l-emerald-500" :
                                                solicitud.estado_solicitud === 'rechazado' ? "border-l-red-500" :
                                                solicitud.estado_solicitud === 'en_correccion' ? "border-l-orange-500" :
                                                "border-l-amber-500",
                                                !isLast && "mb-[1px]" // avoid double borders visually overlapping 
                                            )}
                                            style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
                                        >
                                            {/* Cliente */}
                                            <div className="col-span-3 flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                                                    <span className="font-bold text-slate-300 text-xs">{(solicitud.cliente?.nombres || solicitud.prospecto_nombres)?.charAt(0) || '?'}</span>
                                                </div>
                                                <div className="min-w-0 flex flex-col justify-center">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm font-medium text-slate-200 truncate leading-tight">
                                                            {solicitud.cliente?.nombres || solicitud.prospecto_nombres || 'Desconocido'}
                                                        </div>
                                                        {!solicitud.cliente && solicitud.prospecto_nombres && (
                                                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/30 font-medium">PROSPECTO</Badge>
                                                        )}
                                                    </div>
                                                     <div className="text-[10px] text-slate-500 font-mono mt-0.5">{solicitud.cliente?.dni || solicitud.prospecto_dni || '---'}</div>
                                                 </div>
                                            </div>

                                            {/* Monto */}
                                            <div className="col-span-2 text-right flex flex-col items-end justify-center min-w-0">
                                                <div className="text-sm font-mono font-bold text-emerald-400">S/ {solicitud.monto_solicitado.toLocaleString('en-US')}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">{solicitud.cuotas} {solicitud.modalidad}</div>
                                            </div>

                                            {/* Fecha */}
                                            <div className="col-span-2 flex flex-col items-center justify-center text-center">
                                                <span className="text-xs font-medium text-slate-300">
                                                    {new Date(solicitud.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono" suppressHydrationWarning>
                                                    {new Date(solicitud.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>

                                            {/* Asesor */}
                                            <div className="col-span-2 text-left pl-4 flex items-center gap-2 min-w-0">
                                                <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                <span className="text-sm text-slate-300 truncate">{solicitud.asesor?.nombre_completo}</span>
                                            </div>

                                            {/* Estado */}
                                            <div className="col-span-2 flex justify-center items-center min-w-0">
                                                 <Badge className={cn('text-[10px] py-0 h-5 border px-2 flex items-center gap-1 w-max', config.color)}>
                                                     <IconComponent className="h-3 w-3" />
                                                     {config.label}
                                                 </Badge>
                                            </div>

                                            {/* Acciones */}
                                            <div className="col-span-1 flex justify-end items-center gap-2 text-right">
                                                {solicitud.estado_solicitud === 'aprobado' && (
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-8 w-8 p-0 rounded-lg text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all"
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            const phone = (solicitud.cliente?.telefono || solicitud.prospecto_telefono)?.replace(/\D/g, '') || ''
                                                            const monto = solicitud.monto_solicitado.toLocaleString('en-US')
                                                            const clienteNombre = solicitud.cliente?.nombres || solicitud.prospecto_nombres
                                                            const message = encodeURIComponent(`Hola ${clienteNombre}, le saludamos de ProFinanzas. Le informamos que su solicitud de préstamo por un monto de S/ ${monto} ha sido APROBADA y desembolsada. ¡Felicidades!`)
                                                            window.open(`https://wa.me/51${phone}?text=${message}`, '_blank')
                                                        }}
                                                    >
                                                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.565.928 3.178 1.416 4.856 1.417 5.341 0 9.69-4.348 9.693-9.691.002-2.59-1.01-5.025-2.847-6.865-1.838-1.837-4.271-2.847-6.863-2.848-5.341 0-9.69 4.349-9.692 9.691-.001 1.831.515 3.614 1.491 5.162l-.994 3.63 3.712-.974zm11.367-7.46c-.066-.11-.244-.176-.511-.309-.267-.133-1.583-.781-1.827-.87-.245-.089-.423-.133-.6.133-.177.266-.689.87-.845 1.047-.156.177-.311.199-.578.066-.267-.133-1.127-.416-2.146-1.326-.793-.707-1.329-1.58-1.485-1.847-.156-.266-.016-.411.117-.544.12-.119.267-.31.4-.466.133-.155.177-.266.267-.443.089-.178.044-.333-.022-.466-.067-.133-.6-1.446-.822-1.979-.217-.518-.434-.447-.6-.456-.153-.008-.328-.01-.502-.01-.174 0-.457.065-.696.327-.24.262-.915.894-.915 2.178 0 1.284.934 2.525 1.065 2.702.131.177 1.836 2.805 4.448 3.931.621.267 1.106.427 1.484.547.623.198 1.19.17 1.637.104.498-.074 1.583-.647 1.805-1.27.222-.623.222-1.157.156-1.27z" />
                                                        </svg>
                                                    </Button>
                                                )}
                                                <Link href={`/dashboard/solicitudes/${solicitud.id}`}>
                                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-white transition-all">
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </Link>
                                            </div>
                                            
                                            {solicitud.observacion_supervisor && solicitud.estado_solicitud === 'en_correccion' && (
                                                <div className="col-span-12 mt-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex gap-2 items-start">
                                                    <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                                                    <div>
                                                        <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-0.5">Observación del Supervisor</p>
                                                        <p className="text-xs text-orange-200">{solicitud.observacion_supervisor}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}
                </div>
            </div>
        </div>
    )
}
