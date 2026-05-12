'use client'
import { useState, useEffect, useTransition } from 'react'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DollarSign, TrendingUp, Search, User, Users, Briefcase, X, CalendarDays, Loader2, Clock, CreditCard, Wallet, ArrowUpRight, ArrowRight, ExternalLink, ChevronDown, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getTodayPeru } from '@/lib/financial-logic'
import { cn } from '@/lib/utils'

interface RecentPaymentsListProps {
    pagos: any[]
    totalRecords: number
    perfiles: any[]
    userRol: 'admin' | 'supervisor' | 'asesor' | 'secretaria'
    userId: string
    stats: {
        totalCobradoHoy: number
        totalGananciaHoy: number
        totalFiltrado: number
        totalGananciaFiltrado: number
        hasFilters: boolean
    }
    activeTipo: 'cobros' | 'renovaciones'
}

const ITEMS_PER_LOAD = 20

const TableSkeleton = () => (
    <div className="animate-pulse space-y-4 p-4">
        {/* Mobile Skeleton */}
        <div className="md:hidden space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-32 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-800/10 to-transparent skew-x-12 animate-shimmer" />
                    <div className="flex gap-4">
                        <div className="h-10 w-10 bg-slate-800 rounded-xl" />
                        <div className="space-y-2 flex-1">
                            <div className="h-4 w-3/4 bg-slate-800 rounded" />
                            <div className="h-3 w-1/2 bg-slate-800 rounded" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
        
        {/* Desktop Skeleton */}
        <div className="hidden md:block space-y-4">
             <div className="flex gap-4 border-b border-slate-800/50 pb-4">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-4 bg-slate-800 rounded flex-1 opacity-50" />)}
             </div>
             {[1,2,3,4,5,6,7,8].map((i) => (
                <div key={i} className="flex gap-4 items-center py-3 border-b border-slate-800/30">
                    <div className="h-10 w-10 rounded-xl bg-slate-800" />
                    <div className="h-4 w-48 bg-slate-800 rounded" />
                    <div className="h-4 flex-1 bg-slate-800 rounded opacity-50" />
                    <div className="h-6 w-20 bg-slate-800 rounded-full" />
                </div>
             ))}
        </div>
    </div>
)

export function RecentPaymentsList({ pagos, totalRecords, perfiles, userRol, userId, stats, activeTipo }: RecentPaymentsListProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [isRangeMode, setIsRangeMode] = useState(Boolean(searchParams.get('fecha_inicio') || searchParams.get('fecha_fin')))
    const [itemsToShow, setItemsToShow] = useState(ITEMS_PER_LOAD)
    
    // --- LOCAL REACTIVE STATE ---
    const [localTipo, setLocalTipo] = useState<'cobros' | 'renovaciones'>(activeTipo)
    const [localSearch, setLocalSearch] = useState(searchParams.get('q') || '')
    const [localAsesor, setLocalAsesor] = useState(searchParams.get('asesor') || 'all')
    const [localSupervisor, setLocalSupervisor] = useState(searchParams.get('supervisor') || 'all')
    const today = getTodayPeru()
    const [localFecha, setLocalFecha] = useState(searchParams.get('fecha') || today)
    const [localFechaInicio, setLocalFechaInicio] = useState(searchParams.get('fecha_inicio') || today)
    const [localFechaFin, setLocalFechaFin] = useState(searchParams.get('fecha_fin') || today)
    const [localTurno, setLocalTurno] = useState(searchParams.get('turno') || 'all')
    const [localMetodo, setLocalMetodo] = useState(searchParams.get('metodo') || 'all')
    const [localPagoPor, setLocalPagoPor] = useState(searchParams.get('pago_por') || 'all')

    // --- SYNC LOCAL STATE WITH URL ---
    useEffect(() => {
        setLocalTipo(activeTipo)
        setLocalSearch(searchParams.get('q') || '')
        setLocalAsesor(searchParams.get('asesor') || 'all')
        setLocalSupervisor(searchParams.get('supervisor') || 'all')
        setLocalFecha(searchParams.get('fecha') || today)
        setLocalFechaInicio(searchParams.get('fecha_inicio') || today)
        setLocalFechaFin(searchParams.get('fecha_fin') || today)
        setLocalTurno(searchParams.get('turno') || 'all')
        setLocalMetodo(searchParams.get('metodo') || 'all')
        setLocalPagoPor(searchParams.get('pago_por') || 'all')
    }, [searchParams, today, activeTipo])




    const handleClearFilters = () => {
        setLocalSearch('')
        setLocalAsesor('all')
        setLocalSupervisor('all')
        setLocalFecha(today)
        setLocalFechaInicio(today)
        setLocalFechaFin(today)
        setLocalTurno('all')
        setLocalMetodo('all')
        setLocalPagoPor('all')
        setLocalTipo('cobros')
        setIsRangeMode(false)

        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('tipo', 'cobros')
            params.set('p_page', '1')
            params.delete('q')
            params.delete('asesor')
            params.delete('supervisor')
            params.delete('fecha')
            params.delete('fecha_inicio')
            params.delete('fecha_fin')
            params.delete('turno')
            params.delete('metodo')
            params.delete('pago_por')
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const applyFilters = () => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('p_page', '1')
            params.set('tipo', localTipo)

            if (localSearch) params.set('q', localSearch)
            else params.delete('q')

            if (localAsesor !== 'all') params.set('asesor', localAsesor)
            else params.delete('asesor')

            if (localSupervisor !== 'all') params.set('supervisor', localSupervisor)
            else params.delete('supervisor')

            if (localTurno !== 'all') params.set('turno', localTurno)
            else params.delete('turno')

            if (localMetodo !== 'all') params.set('metodo', localMetodo)
            else params.delete('metodo')

            if (localPagoPor !== 'all') params.set('pago_por', localPagoPor)
            else params.delete('pago_por')

            if (isRangeMode) {
                params.set('fecha_inicio', localFechaInicio)
                params.set('fecha_fin', localFechaFin)
                params.delete('fecha')
            } else {
                params.set('fecha', localFecha)
                params.delete('fecha_inicio')
                params.delete('fecha_fin')
            }

            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const toggleDateMode = () => {
        const nextMode = !isRangeMode
        setIsRangeMode(nextMode)
        if (nextMode) {
            setLocalFechaInicio(localFecha || today)
            setLocalFechaFin(localFecha || today)
        } else {
            setLocalFecha(localFechaInicio || today)
        }
    }

    const hasActiveFilters = !!(localSearch || localAsesor !== 'all' || localSupervisor !== 'all' ||
                            localTurno !== 'all' || localMetodo !== 'all' || localPagoPor !== 'all' ||
                            localTipo !== 'cobros' ||
                            (isRangeMode && (localFechaInicio !== today || localFechaFin !== today)) ||
                            (!isRangeMode && localFecha !== today))

    const supervisores = perfiles.filter(p => p.rol === 'supervisor')
    const asesores = perfiles.filter(p => {
        if (userRol === 'admin') {
            if (localSupervisor !== 'all') {
                return p.rol === 'asesor' && p.supervisor_id === localSupervisor
            }
            return p.rol === 'asesor'
        }
        if (userRol === 'supervisor') {
            return p.rol === 'asesor' && p.supervisor_id === userId
        }
        return p.id === userId
    })

    const pagoPorOptions = perfiles.filter(p => {
        if (userRol === 'admin' || userRol === 'secretaria') return true
        if (userRol === 'supervisor') {
            return p.id === userId || p.supervisor_id === userId || ['admin', 'supervisor', 'secretaria'].includes(p.rol)
        }
        if (userRol === 'asesor') {
            return p.id === userId || ['admin', 'supervisor', 'secretaria'].includes(p.rol)
        }
        return false
    })

    return (
        <div className="space-y-6 mt-8">
            {/* KPI Cards Section */}
            <div className={cn(
                "grid grid-cols-2 gap-3 md:gap-4",
                (stats.hasFilters && userRol === 'admin') ? "md:grid-cols-4" : 
                (stats.hasFilters || userRol === 'admin') ? "md:grid-cols-2" : "md:grid-cols-1"
            )}>
                {/* Cobrado Hoy */}
                <div className={cn(
                    "relative overflow-hidden bg-slate-900/50 border border-slate-800/60 rounded-2xl p-4 md:p-5 transition-all group hover:border-emerald-500/30",
                    isPending && "opacity-60 blur-[0.5px]"
                )}>
                    {isPending && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent animate-shimmer" />}
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-2 md:p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
                            <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Cobrado Hoy</p>
                            <h3 className="text-lg md:text-2xl font-black text-white tracking-tight">S/ {stats.totalCobradoHoy.toFixed(2)}</h3>
                        </div>
                    </div>
                </div>

                {/* Ganancia Hoy (Admin Only) */}
                {userRol === 'admin' && (
                    <div className={cn(
                        "relative overflow-hidden bg-slate-900/50 border border-slate-800/60 rounded-2xl p-4 md:p-5 transition-all group hover:border-purple-500/30",
                        isPending && "opacity-60 blur-[0.5px]"
                    )}>
                        {isPending && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent animate-shimmer" />}
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="p-2 md:p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors">
                                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-purple-500" />
                            </div>
                            <div>
                                <p className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Ganancia Hoy</p>
                                <h3 className="text-lg md:text-2xl font-black text-purple-400 tracking-tight">S/ {stats.totalGananciaHoy.toFixed(2)}</h3>
                            </div>
                        </div>
                    </div>
                )}

                {/* Total en Búsqueda (Only if filters active) */}
                {stats.hasFilters && (
                    <div className={cn(
                        "relative overflow-hidden bg-slate-900/50 border border-slate-800/60 rounded-2xl p-4 md:p-5 transition-all group hover:border-blue-500/30 animate-in fade-in slide-in-from-right-4 duration-500",
                        isPending && "opacity-60 blur-[0.5px]"
                    )}>
                        {isPending && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/5 to-transparent animate-shimmer" />}
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="p-2 md:p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                                <Search className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Total Filtrado</p>
                                <h3 className="text-lg md:text-2xl font-black text-white tracking-tight">S/ {stats.totalFiltrado.toFixed(2)}</h3>
                            </div>
                        </div>
                    </div>
                )}

                {/* Ganancia Búsqueda (Admin + Filters) */}
                {stats.hasFilters && userRol === 'admin' && (
                    <div className={cn(
                        "relative overflow-hidden bg-slate-900/50 border border-slate-800/60 rounded-2xl p-4 md:p-5 transition-all group hover:border-indigo-500/30 animate-in fade-in slide-in-from-right-4 duration-500",
                        isPending && "opacity-60 blur-[0.5px]"
                    )}>
                        {isPending && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent animate-shimmer" />}
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="p-2 md:p-3 bg-indigo-500/10 rounded-xl group-hover:bg-indigo-500/20 transition-colors">
                                <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-indigo-500" />
                            </div>
                            <div>
                                <p className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Ganancia Filtrada</p>
                                <h3 className="text-lg md:text-2xl font-black text-indigo-400 tracking-tight">S/ {stats.totalGananciaFiltrado.toFixed(2)}</h3>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-4 mb-2">
                <h2 className="section-title mb-0">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    Pagos Recientes
                </h2>
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest hidden md:block">
                    Filtrado por Rol: {userRol}
                </div>
            </div>

            <div className="sticky top-[var(--sat)] z-30 flex flex-col md:flex-row md:items-center gap-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-4 w-full">
                {/* Admin Tabs (tipo) */}
                {userRol === 'admin' && (
                    <div className="flex bg-slate-950/60 p-1 rounded-2xl border border-slate-800/80 shadow-inner md:w-auto w-full">
                        <button
                            onClick={() => setLocalTipo('cobros')}
                            className={cn(
                                "flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2",
                                localTipo === 'cobros'
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/30"
                                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                            )}
                        >
                            <DollarSign className={cn("w-3.5 h-3.5", localTipo === 'cobros' ? "text-white" : "text-slate-600")} />
                            Cobros
                        </button>
                        <button
                            onClick={() => setLocalTipo('renovaciones')}
                            className={cn(
                                "flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2",
                                localTipo === 'renovaciones'
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/30"
                                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                            )}
                        >
                            <RotateCcw className={cn("w-3.5 h-3.5", localTipo === 'renovaciones' ? "text-white" : "text-slate-600")} />
                            Renovaciones
                        </button>
                    </div>
                )}

                {/* Search */}
                <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Buscar cliente, asesor..."
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        className={cn(
                            "h-10 pl-9 pr-8 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full focus:bg-slate-900 transition-all",
                            localSearch && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
                            isPending && "opacity-70"
                        )}
                    />
                    {localSearch && (
                        <button
                            onClick={() => setLocalSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-all z-10"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {/* Mobile-only action buttons: between search and filters */}
                <div className="flex items-center gap-2 md:hidden">
                    <Button
                        onClick={applyFilters}
                        disabled={!hasActiveFilters}
                        size="sm"
                        className={cn(
                            "h-10 flex-1 flex items-center justify-center gap-2 rounded-xl transition-all font-bold text-xs uppercase tracking-wider",
                            hasActiveFilters
                                ? "bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow-lg shadow-blue-900/30"
                                : "bg-slate-800/50 border border-slate-700 text-slate-600 cursor-not-allowed"
                        )}
                    >
                        <Search className="w-4 h-4" />
                        Aplicar
                    </Button>
                    <Button
                        onClick={handleClearFilters}
                        disabled={!hasActiveFilters}
                        size="icon"
                        variant="ghost"
                        className={cn(
                            "h-10 w-10 rounded-xl transition-all",
                            hasActiveFilters
                                ? "text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                                : "text-slate-700 border border-slate-800 cursor-not-allowed"
                        )}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Filters row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 w-full custom-scrollbar">

                    {/* Date picker */}
                    <div className={cn(
                        "flex items-center bg-slate-950/50 border border-slate-700 rounded-2xl p-1 gap-1 pr-3 transition-all shrink-0",
                        ((isRangeMode && (localFechaInicio !== today || localFechaFin !== today)) || (!isRangeMode && localFecha !== today)) && "border-blue-500/50 bg-blue-500/5 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                    )}>
                        {userRol === 'admin' && (
                            <button
                                onClick={toggleDateMode}
                                title={isRangeMode ? "Cambiar a fecha única" : "Cambiar a rango de fechas"}
                                className={cn(
                                    "h-10 w-10 shrink-0 flex items-center justify-center rounded-xl transition-all border",
                                    isRangeMode
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-blue-400"
                                        : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white"
                                )}
                            >
                                <ArrowRight className={cn("w-4 h-4 transition-transform", isRangeMode ? "rotate-180" : "")} />
                            </button>
                        )}

                        {isRangeMode ? (
                            <div className="flex flex-1 items-center gap-1 min-w-0">
                                <div className="relative flex-1 min-w-0 group/date">
                                    <span className="absolute left-8 top-1.5 text-[7px] font-black text-slate-500 uppercase tracking-tighter pointer-events-none">Desde</span>
                                    <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 group-hover/date:text-blue-400 transition-colors pointer-events-none" />
                                    <Input
                                        type="date"
                                        value={localFechaInicio}
                                        onChange={(e) => setLocalFechaInicio(e.target.value)}
                                        onClick={(e) => e.currentTarget.showPicker()}
                                        className="h-10 pl-8 pr-8 pt-3 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[125px] focus-visible:ring-0 [color-scheme:dark] cursor-pointer"
                                    />
                                </div>
                                <div className="h-4 w-[1px] bg-slate-800 shrink-0" />
                                <div className="relative flex-1 min-w-0 group/date">
                                    <span className="absolute left-8 top-1.5 text-[7px] font-black text-slate-500 uppercase tracking-tighter pointer-events-none">Hasta</span>
                                    <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 group-hover/date:text-blue-400 transition-colors pointer-events-none" />
                                    <Input
                                        type="date"
                                        value={localFechaFin}
                                        onChange={(e) => setLocalFechaFin(e.target.value)}
                                        onClick={(e) => e.currentTarget.showPicker()}
                                        className="h-10 pl-8 pr-8 pt-3 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[125px] focus-visible:ring-0 [color-scheme:dark] cursor-pointer"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="relative flex-1 min-w-0 group/date">
                                <span className="absolute left-9 top-1.5 text-[7px] font-black text-slate-500 uppercase tracking-tighter pointer-events-none">Fecha de Consulta</span>
                                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-hover/date:text-blue-400 transition-colors pointer-events-none" />
                                <Input
                                    type="date"
                                    value={localFecha}
                                    onChange={(e) => setLocalFecha(e.target.value)}
                                    onClick={(e) => e.currentTarget.showPicker()}
                                    className="h-10 pl-9 pr-8 pt-3 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[160px] focus-visible:ring-0 [color-scheme:dark] cursor-pointer"
                                />
                            </div>
                        )}
                    </div>

                    {userRol === 'admin' && supervisores.length > 0 && (
                        <Select value={localSupervisor} onValueChange={(val) => { setLocalSupervisor(val); setLocalAsesor('all') }}>
                            <SelectTrigger className={cn(
                                "h-10 w-[180px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 transition-all",
                                localSupervisor !== 'all' && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
                                isPending && "opacity-70"
                            )}>
                                <div className="flex items-center gap-2 truncate">
                                    <Users className={cn("w-3.5 h-3.5 shrink-0", localSupervisor !== 'all' ? "text-blue-400" : "text-purple-400")} />
                                    <SelectValue placeholder="Supervisor" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                <SelectItem value="all">Todos Supervisores</SelectItem>
                                {supervisores.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {(userRol === 'admin' || userRol === 'supervisor') && asesores.length > 0 && (
                        <Select value={localAsesor} onValueChange={setLocalAsesor}>
                            <SelectTrigger className={cn(
                                "h-10 w-[180px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 transition-all",
                                localAsesor !== 'all' && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
                                isPending && "opacity-70"
                            )}>
                                <div className="flex items-center gap-2 truncate">
                                    <User className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                                    <SelectValue placeholder="Asesor" />
                                </div>
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                <SelectItem value="all">Todos Asesores</SelectItem>
                                {asesores.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <Select value={localPagoPor} onValueChange={setLocalPagoPor}>
                        <SelectTrigger className={cn(
                            "h-10 w-[180px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 transition-all",
                            localPagoPor !== 'all' && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
                            isPending && "opacity-70"
                        )}>
                            <div className="flex items-center gap-2 truncate">
                                <Briefcase className={cn("w-3.5 h-3.5 shrink-0", localPagoPor !== 'all' ? "text-blue-400" : "text-indigo-400")} />
                                <SelectValue placeholder="Pagado Por" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="all">Todos - Pagado Por</SelectItem>
                            {pagoPorOptions.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nombre_completo}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={localTurno} onValueChange={setLocalTurno}>
                        <SelectTrigger className={cn(
                            "h-10 w-[140px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 shrink-0 transition-all",
                            localTurno !== 'all' && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
                            isPending && "opacity-70"
                        )}>
                            <div className="flex items-center gap-2 truncate">
                                <Clock className={cn("w-3.5 h-3.5 shrink-0", localTurno !== 'all' ? "text-blue-400" : "text-amber-400")} />
                                <SelectValue placeholder="Turno" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="all">Todos Turnos</SelectItem>
                            <SelectItem value="Turno 1">Turno 1 (AM)</SelectItem>
                            <SelectItem value="Turno 2">Turno 2 (PM)</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={localMetodo} onValueChange={setLocalMetodo}>
                        <SelectTrigger className={cn(
                            "h-10 w-[160px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 shrink-0 transition-all",
                            localMetodo !== 'all' && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
                            isPending && "opacity-70"
                        )}>
                            <div className="flex items-center gap-2 truncate">
                                <CreditCard className={cn("w-3.5 h-3.5 shrink-0", localMetodo !== 'all' ? "text-blue-400" : "text-emerald-400")} />
                                <SelectValue placeholder="Método" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="all">Todos Métodos</SelectItem>
                            <SelectItem value="Efectivo">Efectivo</SelectItem>
                            <SelectItem value="Transferencia">Transferencia</SelectItem>
                            <SelectItem value="Yape">Yape</SelectItem>
                            <SelectItem value="Plin">Plin</SelectItem>
                            <SelectItem value="Otros">Otros</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Desktop-only action buttons: at end of filter row */}
                    <div className="hidden md:flex items-center gap-1.5 shrink-0 ml-auto">
                        <Button
                            onClick={applyFilters}
                            disabled={!hasActiveFilters}
                            size="icon"
                            className={cn(
                                "h-10 w-10 rounded-xl transition-all",
                                hasActiveFilters
                                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
                                    : "bg-slate-800/50 border border-slate-700 text-slate-600 cursor-not-allowed"
                            )}
                            title="Aplicar filtros"
                        >
                            <Search className="w-4 h-4" />
                        </Button>
                        <Button
                            onClick={handleClearFilters}
                            disabled={!hasActiveFilters}
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "h-10 w-10 rounded-xl transition-all",
                                hasActiveFilters
                                    ? "text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                                    : "text-slate-700 border border-slate-800 cursor-not-allowed"
                            )}
                            title="Limpiar filtros"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="relative bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-500 items-center">
                    <div className="col-span-6">Detalle del Pago / Fecha</div>
                    <div className="col-span-3 text-right">Monto</div>
                    <div className="col-span-2 text-right">Método</div>
                    <div className="col-span-1 text-center"></div>
                </div>

                <div className="divide-y divide-slate-800/40">
                    {isPending ? (
                        <div className="p-0 animate-in fade-in duration-500">
                            <TableSkeleton />
                        </div>
                    ) : (
                    <>
                    {pagos?.slice(0, itemsToShow).map((pago) => {
                        const prestamoId = pago.cronograma_cuotas?.prestamo_id || pago.cronograma_cuotas?.prestamos?.id
                        return (
                        <div key={pago.id} className="group px-4 md:px-6 py-3 md:py-4 hover:bg-slate-800/30 transition-all items-center border-b border-slate-800/20 last:border-0">
                            {/* DESKTOP */}
                            <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                                <div className="col-span-6 flex items-center gap-3">
                                    <div className={cn(
                                        "h-9 w-9 rounded-xl flex items-center justify-center shadow-inner shrink-0 transition-transform group-hover:scale-110",
                                        pago.metodo_pago === 'Efectivo' ? "bg-emerald-500/10 text-emerald-500" :
                                        pago.metodo_pago === 'Transferencia' ? "bg-blue-500/10 text-blue-500" :
                                        "bg-purple-500/10 text-purple-500"
                                    )}>
                                        {pago.metodo_pago === 'Efectivo' ? <Wallet className="h-4 w-4" /> :
                                         pago.metodo_pago === 'Transferencia' ? <ArrowUpRight className="h-4 w-4" /> :
                                         <CreditCard className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">
                                                {pago.cronograma_cuotas?.prestamos?.clientes?.nombres || 'Cliente no identificado'}
                                            </p>
                                            <span className={cn(
                                                "text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shrink-0",
                                                pago.turno_calculado === 'Turno 1' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
                                            )}>
                                                {pago.turno_calculado === 'Turno 1' ? '🌅 AM' : '🌆 PM'}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 font-mono">
                                            {format(new Date(pago.fecha_pago), 'dd MMM HH:mm', { locale: es })} • {pago.perfiles?.nombre_completo || 'Sistema'} • Cuota #{pago.cronograma_cuotas?.numero_cuota || '-'}
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-3 text-right">
                                    <div className="text-base font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                        +S/ {pago.monto_pagado}
                                    </div>
                                    {userRol === 'admin' && pago.interes_cobrado > 0 && (
                                        <div className="text-[10px] font-bold text-purple-400/80 uppercase tracking-tighter">
                                            Ganancia: S/ {pago.interes_cobrado}
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-2 text-right text-xs text-slate-400 font-medium">
                                    {pago.metodo_pago || '-'}
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    {prestamoId && (
                                        <Link
                                            href={`/dashboard/prestamos/${prestamoId}?tab=historial`}
                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all"
                                            title="Ver préstamo"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                            {/* MOBILE */}
                            <div className="flex md:hidden items-center gap-3">
                                <div className={cn(
                                    "h-9 w-9 rounded-xl flex items-center justify-center shadow-inner shrink-0",
                                    pago.metodo_pago === 'Efectivo' ? "bg-emerald-500/10 text-emerald-500" :
                                    pago.metodo_pago === 'Transferencia' ? "bg-blue-500/10 text-blue-500" :
                                    "bg-purple-500/10 text-purple-500"
                                )}>
                                    {pago.metodo_pago === 'Efectivo' ? <Wallet className="h-4 w-4" /> :
                                     pago.metodo_pago === 'Transferencia' ? <ArrowUpRight className="h-4 w-4" /> :
                                     <CreditCard className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-bold text-slate-200 truncate">
                                            {pago.cronograma_cuotas?.prestamos?.clientes?.nombres || 'Sin nombre'}
                                        </p>
                                        <span className={cn(
                                            "text-[8px] px-1 py-0.5 rounded-full font-black uppercase shrink-0",
                                            pago.turno_calculado === 'Turno 1' ? "bg-amber-500/10 text-amber-500" : "bg-indigo-500/10 text-indigo-500"
                                        )}>
                                            {pago.turno_calculado === 'Turno 1' ? 'AM' : 'PM'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                        {format(new Date(pago.fecha_pago), 'dd MMM HH:mm', { locale: es })} • {pago.perfiles?.nombre_completo || 'Sistema'} • #{pago.cronograma_cuotas?.numero_cuota || '-'} • {pago.metodo_pago}
                                    </div>
                                </div>
                                <div className="text-right shrink-0 flex items-center gap-2">
                                    <div>
                                        <div className="text-sm font-bold text-emerald-400">+S/ {pago.monto_pagado}</div>
                                        {userRol === 'admin' && pago.interes_cobrado > 0 && (
                                            <div className="text-[9px] font-bold text-purple-400/80">G: S/ {pago.interes_cobrado}</div>
                                        )}
                                    </div>
                                    {prestamoId && (
                                        <Link
                                            href={`/dashboard/prestamos/${prestamoId}?tab=historial`}
                                            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    )})}
                    
                    {(!pagos || pagos.length === 0) && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <div className="w-14 h-14 bg-slate-800/50 rounded-full flex items-center justify-center mb-3 border border-slate-800">
                                <span className="text-xl">⏳</span>
                            </div>
                            <h3 className="font-medium text-slate-400">Sin movimientos</h3>
                            <p className="text-sm text-slate-600 mt-1 text-center max-w-[180px]">
                                Los pagos históricos aparecerán aquí
                            </p>
                        </div>
                    )}
                    </>
                    )}
                </div>

                {/* Pagination / Load More */}
                <div className="mt-6 mb-4 border-t border-slate-800/50 pt-6 flex flex-col items-center gap-6">
                    {itemsToShow < totalRecords && pagos.length > 0 && (
                        <div className="flex flex-col items-center gap-4">
                            <Button
                                onClick={() => setItemsToShow(prev => prev + ITEMS_PER_LOAD)}
                                className="group flex items-center gap-2 bg-slate-800/50 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-white px-8 py-2 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95"
                            >
                                <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                                Cargar 20 más
                            </Button>
                        </div>
                    )}

                    {totalRecords > 0 && (
                        <div className="flex flex-col items-center gap-2 opacity-60">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Mostrando {Math.min(itemsToShow, totalRecords)} de {totalRecords}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Recuento</span>
                                <span className="text-sm font-black text-slate-300">{totalRecords}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
