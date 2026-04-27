'use client'
import { useState, useEffect, useTransition } from 'react'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DollarSign, TrendingUp, Search, User, Users, Briefcase, X, CalendarDays, Loader2, Clock, CreditCard, Wallet, ArrowUpRight, ArrowRight } from 'lucide-react'
import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface RecentPaymentsListProps {
    pagos: any[]
    totalRecords: number
    currentPage: number
    pageSize: number
    perfiles: any[]
    userRol: 'admin' | 'supervisor' | 'asesor' | 'secretaria'
    userId: string
}

export function RecentPaymentsList({ pagos, totalRecords, currentPage, pageSize, perfiles, userRol, userId }: RecentPaymentsListProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    
    const [isRangeMode, setIsRangeMode] = useState(Boolean(searchParams.get('fecha_inicio') || searchParams.get('fecha_fin')))
    
    const currentSearch = searchParams.get('q') || ''
    const currentAsesor = searchParams.get('asesor') || 'all'
    const currentSupervisor = searchParams.get('supervisor') || 'all'
    const currentFecha = searchParams.get('fecha') || ''
    const currentFechaInicio = searchParams.get('fecha_inicio') || ''
    const currentFechaFin = searchParams.get('fecha_fin') || ''
    const currentTurno = searchParams.get('turno') || 'all'
    const currentMetodo = searchParams.get('metodo') || 'all'
    const currentPagoPor = searchParams.get('pago_por') || 'all'

    const [searchValue, setSearchValue] = useState(currentSearch)
    const [tempFecha, setTempFecha] = useState(currentFecha)
    const [tempFechaInicio, setTempFechaInicio] = useState(currentFechaInicio)
    const [tempFechaFin, setTempFechaFin] = useState(currentFechaFin)
    
    useEffect(() => {
        setSearchValue(searchParams.get('q') || '')
    }, [searchParams.get('q')])

    useEffect(() => {
        setTempFecha(currentFecha)
    }, [currentFecha])

    useEffect(() => {
        setTempFechaInicio(currentFechaInicio)
    }, [currentFechaInicio])

    useEffect(() => {
        setTempFechaFin(currentFechaFin)
    }, [currentFechaFin])

    useEffect(() => {
        const timeout = setTimeout(() => {
            // Only apply if at least one date has changed from the searchParams
            const hasChanged = isRangeMode 
                ? (tempFechaInicio !== (searchParams.get('fecha_inicio') || '') || tempFechaFin !== (searchParams.get('fecha_fin') || ''))
                : (tempFecha !== (searchParams.get('fecha') || ''))
            
            if (hasChanged) {
                applyDates()
            }
        }, 800)
        return () => clearTimeout(timeout)
    }, [tempFecha, tempFechaInicio, tempFechaFin, isRangeMode])

    const totalPages = Math.ceil(totalRecords / pageSize)

    const handlePageChange = (page: number) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('p_page', String(page))
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const applyDates = (forcedMode?: boolean) => {
        const mode = forcedMode !== undefined ? forcedMode : isRangeMode
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('p_page', '1')
            if (mode) {
                if (tempFechaInicio) params.set('fecha_inicio', tempFechaInicio)
                if (tempFechaFin) params.set('fecha_fin', tempFechaFin)
                params.delete('fecha')
            } else {
                if (tempFecha) params.set('fecha', tempFecha)
                params.delete('fecha_inicio')
                params.delete('fecha_fin')
            }
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const handleFilterChange = (key: string, value: string) => {
        if (key !== 'fecha' && key !== 'fecha_inicio' && key !== 'fecha_fin') {
            startTransition(() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('p_page', '1')
                if (value && value !== 'all') {
                    params.set(key, value)
                } else {
                    params.delete(key)
                }
                router.push(`${pathname}?${params.toString()}`, { scroll: false })
            })
        }
    }

    const toggleDateMode = () => {
        const nextMode = !isRangeMode
        setIsRangeMode(nextMode)
        
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            if (nextMode) {
                const current = tempFecha || new Date().toISOString().split('T')[0]
                params.set('fecha_inicio', current)
                params.set('fecha_fin', current)
                params.delete('fecha')
                setTempFechaInicio(current)
                setTempFechaFin(current)
            } else {
                const current = tempFechaInicio || new Date().toISOString().split('T')[0]
                params.set('fecha', current)
                params.delete('fecha_inicio')
                params.delete('fecha_fin')
                setTempFecha(current)
            }
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const handleSearch = (q: string) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('p_page', '1')
            if (q) {
                params.set('q', q)
            } else {
                params.delete('q')
            }
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchValue !== (searchParams.get('q') || '')) {
                handleSearch(searchValue)
            }
        }, 500)
        return () => clearTimeout(timeout)
    }, [searchValue])

    const supervisores = perfiles.filter(p => p.rol === 'supervisor')
    const asesores = perfiles.filter(p => {
        if (userRol === 'admin') {
            if (currentSupervisor !== 'all') {
                return p.rol === 'asesor' && p.supervisor_id === currentSupervisor
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
        <div className="space-y-4 mt-8">
            <div className="flex items-center justify-between gap-4 mb-2">
                <h2 className="section-title mb-0">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    Pagos Recientes
                </h2>
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest hidden md:block">
                    Filtrado por Rol: {userRol}
                </div>
            </div>

            <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-4 w-full">
                
                <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px]">
                    {isPending ? (
                        <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin z-10" />
                    ) : (
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    )}
                    <Input
                        placeholder="Buscar cliente, asesor..."
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="h-10 pl-9 pr-8 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full focus:bg-slate-900 transition-colors"
                    />
                    {searchValue && (
                        <button 
                            onClick={() => setSearchValue('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-all z-10"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 w-full custom-scrollbar">
                    
                <div className="flex items-center bg-slate-950/50 border border-slate-700 rounded-2xl p-1 gap-1 pr-3">
                    {userRol === 'admin' && (
                        <button
                            onClick={toggleDateMode}
                            title={isRangeMode ? "Cambiar a fecha única" : "Cambiar a rango de fechas"}
                            className={cn(
                                "h-9 w-9 shrink-0 flex items-center justify-center rounded-xl transition-all border",
                                isRangeMode 
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-blue-400" 
                                    : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white"
                            )}
                        >
                            <ArrowRight className={cn("w-4 h-4 transition-transform", isRangeMode ? "rotate-180" : "")} />
                        </button>
                    )}

                    {isRangeMode ? (
                        <div className="flex items-center gap-0.5">
                            <div className="relative">
                                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                                <Input
                                    type="date"
                                    value={tempFechaInicio}
                                    onChange={(e) => setTempFechaInicio(e.target.value)}
                                    className="h-9 pl-8 pr-2 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[135px] focus-visible:ring-0 [color-scheme:dark]"
                                />
                            </div>
                            <span className="text-slate-700 font-bold px-1">/</span>
                            <div className="relative">
                                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                                <Input
                                    type="date"
                                    value={tempFechaFin}
                                    onChange={(e) => setTempFechaFin(e.target.value)}
                                    className="h-9 pl-8 pr-2 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[135px] focus-visible:ring-0 [color-scheme:dark]"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="relative">
                            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                type="date"
                                value={tempFecha}
                                onChange={(e) => setTempFecha(e.target.value)}
                                className="h-9 pl-9 pr-2 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[160px] focus-visible:ring-0 [color-scheme:dark]"
                            />
                        </div>
                    )}
                </div>

                    {userRol === 'admin' && supervisores.length > 0 && (
                        <Select value={currentSupervisor} onValueChange={(val) => handleFilterChange('supervisor', val)}>
                            <SelectTrigger className="h-10 w-[180px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                                <div className="flex items-center gap-2 truncate">
                                    <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
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
                        <Select value={currentAsesor} onValueChange={(val) => handleFilterChange('asesor', val)}>
                            <SelectTrigger className="h-10 w-[180px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                                <div className="flex items-center gap-2 truncate">
                                    <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
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

                    <Select value={currentTurno} onValueChange={(val) => handleFilterChange('turno', val)}>
                        <SelectTrigger className="h-10 w-[140px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 shrink-0">
                            <div className="flex items-center gap-2 truncate">
                                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <SelectValue placeholder="Turno" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="all">Todos Turnos</SelectItem>
                            <SelectItem value="Turno 1">Turno 1 (AM)</SelectItem>
                            <SelectItem value="Turno 2">Turno 2 (PM)</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={currentMetodo} onValueChange={(val) => handleFilterChange('metodo', val)}>
                        <SelectTrigger className="h-10 w-[160px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 shrink-0">
                            <div className="flex items-center gap-2 truncate">
                                <CreditCard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
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

                    <Select value={currentPagoPor} onValueChange={(val) => handleFilterChange('pago_por', val)}>
                        <SelectTrigger className="h-10 w-[180px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                            <div className="flex items-center gap-2 truncate">
                                <Briefcase className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <SelectValue placeholder="Cobrado Por" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="all">Cualquier Usuario</SelectItem>
                            {pagoPorOptions.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nombre_completo}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
                <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-500 items-center">
                    <div className="col-span-5 md:col-span-6">Detalle del Pago / Fecha</div>
                    <div className="col-span-3 text-right">Monto</div>
                    <div className="col-span-4 md:col-span-3 text-right">Método</div>
                </div>

                <div className="divide-y divide-slate-800/40">
                    {pagos?.map((pago) => (
                        <div key={pago.id} className="group grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-800/30 transition-all cursor-default items-center">
                            <div className="col-span-9 md:col-span-9 flex items-center gap-4">
                                <div className={cn(
                                    "h-10 w-10 rounded-xl flex items-center justify-center shadow-inner shrink-0 transition-transform group-hover:scale-110",
                                    pago.metodo_pago === 'Efectivo' ? "bg-emerald-500/10 text-emerald-500" :
                                    pago.metodo_pago === 'Transferencia' ? "bg-blue-500/10 text-blue-500" :
                                    "bg-purple-500/10 text-purple-500"
                                )}>
                                    {pago.metodo_pago === 'Efectivo' ? <Wallet className="h-5 w-5" /> :
                                     pago.metodo_pago === 'Transferencia' ? <ArrowUpRight className="h-5 w-5" /> :
                                     <CreditCard className="h-5 w-5" />}
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
                                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                                        Cobro: {format(new Date(pago.fecha_pago), 'dd MMM HH:mm', { locale: es })} • 
                                        {pago.perfiles?.nombre_completo || 'Sistema'} • 
                                        Vence: {pago.cronograma_cuotas?.fecha_vencimiento ? format(new Date(pago.cronograma_cuotas.fecha_vencimiento), 'dd MMM', { locale: es }) : '-'} • 
                                        Cuota #{pago.cronograma_cuotas?.numero_cuota || '-'}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="col-span-3 md:col-span-3 text-right">
                                <div className="text-base font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                    +S/ {pago.monto_pagado}
                                </div>
                                {userRol === 'admin' && pago.interes_cobrado > 0 && (
                                    <div className="text-[10px] font-bold text-purple-400/80 uppercase tracking-tighter">
                                        Ganancia: S/ {pago.interes_cobrado}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    
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
                </div>

                <div className="p-4 border-t border-slate-800">
                    <PaginationControlled 
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        totalRecords={totalRecords}
                        pageSize={pageSize}
                    />
                </div>
            </div>
        </div>
    )
}
