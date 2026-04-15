'use client'
import { useState, useEffect, useTransition } from 'react'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DollarSign, TrendingUp, Search, User, Users, Briefcase, X, CalendarDays, Loader2, Clock, CreditCard, Wallet } from 'lucide-react'
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
    userRol: 'admin' | 'supervisor' | 'asesor'
    userId: string
}

export function RecentPaymentsList({ pagos, totalRecords, currentPage, pageSize, perfiles, userRol, userId }: RecentPaymentsListProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    
    const totalPages = Math.ceil(totalRecords / pageSize)

    const handlePageChange = (page: number) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('p_page', String(page))
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const handleFilterChange = (key: string, value: string) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('p_page', '1') // Reset to page 1 on filter change
            if (value && value !== 'all') {
                params.set(key, value)
            } else {
                params.delete(key)
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

    const currentSearch = searchParams.get('q') || ''
    const currentAsesor = searchParams.get('asesor') || 'all'
    const currentSupervisor = searchParams.get('supervisor') || 'all'
    const currentFecha = searchParams.get('fecha') || ''
    const currentTurno = searchParams.get('turno') || 'all'
    const currentMetodo = searchParams.get('metodo') || 'all'


    const [searchValue, setSearchValue] = useState(currentSearch)
    
    useEffect(() => {
        setSearchValue(searchParams.get('q') || '')
    }, [searchParams.get('q')])

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchValue !== (searchParams.get('q') || '')) {
                handleSearch(searchValue)
            }
        }, 500)
        return () => clearTimeout(timeout)
    }, [searchValue])

    // Filter available perfiles based on role
    const supervisores = perfiles.filter(p => p.rol === 'supervisor')
    const asesores = perfiles.filter(p => {
        if (userRol === 'admin') {
            // If supervisor is selected, only show advisors in that team
            if (currentSupervisor !== 'all') {
                return p.rol === 'asesor' && p.supervisor_id === currentSupervisor
            }
            return p.rol === 'asesor'
        }
        if (userRol === 'supervisor') {
            return p.rol === 'asesor' && p.supervisor_id === userId
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

            {/* Main Filter Bar - Replicating Loans Panel Design */}
            <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-4 w-full">
                
                {/* Search Input */}
                <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px]">
                    {isPending ? (
                        <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin z-10" />
                    ) : (
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    )}
                    <Input
                        placeholder="Buscar cliente..."
                        className="h-10 pl-9 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:bg-slate-900 transition-colors h-10 pr-8"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                    />
                    {(searchValue || currentSupervisor !== 'all' || currentAsesor !== 'all' || currentFecha) && (
                        <button 
                            onClick={() => {
                                startTransition(() => {
                                    setSearchValue('')
                                    const params = new URLSearchParams(searchParams.toString())
                                    params.delete('q')
                                    params.delete('supervisor')
                                    params.delete('asesor')
                                    params.delete('fecha')
                                    router.push(`${pathname}?${params.toString()}`)
                                })
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-all"
                            title="Limpiar filtros"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}


                </div>

                {/* Filters Row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    
                     {/* Date: Fecha Pago (Principal) */}
                    <div className="relative shrink-0">
                        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400 pointer-events-none z-10" />
                        <Input
                            type="date"
                            value={currentFecha}
                            onChange={(e) => handleFilterChange('fecha', e.target.value)}
                            title="Filtrar por fecha de pago"
                            className="h-10 pl-10 pr-2 bg-slate-950/50 border-slate-700 text-[11px] text-slate-300 uppercase font-bold focus:bg-slate-900 border-emerald-500/20 transition-all w-[160px] [color-scheme:dark]"
                        />
                    </div>


                    {/* Turno Filter */}
                    <Select value={currentTurno} onValueChange={(v) => handleFilterChange('turno', v)}>
                        <SelectTrigger className="h-10 w-auto min-w-[120px] shrink-0 bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 transition-colors hover:border-slate-600">
                            <Clock className={cn("h-3 w-3 mr-2 shrink-0", 
                                currentTurno === '1' ? 'text-amber-400' : 
                                currentTurno === '2' ? 'text-indigo-400' : 'text-slate-400'
                            )} />
                            <SelectValue placeholder="Turno" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="all">Cualquier Turno</SelectItem>
                            <SelectItem value="1">🌅 Turno Mañana (AM)</SelectItem>
                            <SelectItem value="2">🌆 Turno Tarde (PM)</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Metodo Filter */}
                    <Select value={currentMetodo} onValueChange={(v) => handleFilterChange('metodo', v)}>
                        <SelectTrigger className="h-10 w-auto min-w-[130px] shrink-0 bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3 transition-colors hover:border-slate-600">
                            <Wallet className={cn("h-3 w-3 mr-2 shrink-0", 
                                currentMetodo === 'Efectivo' ? 'text-emerald-400' : 
                                currentMetodo !== 'all' ? 'text-blue-400' : 'text-slate-400'
                            )} />
                            <SelectValue placeholder="Método" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="all">Todos los Métodos</SelectItem>
                            <SelectItem value="Efectivo">💵 Efectivo</SelectItem>
                            <SelectItem value="Yape">📱 Yape</SelectItem>
                            <SelectItem value="Plin">💠 Plin</SelectItem>
                            <SelectItem value="Transferencia">🏦 Transferencia</SelectItem>
                        </SelectContent>
                    </Select>
                    
                    {/* Admin Only: Supervisor Filter */}
                    {userRol === 'admin' && (
                        <Select value={currentSupervisor} onValueChange={(v) => handleFilterChange('supervisor', v)}>
                            <SelectTrigger className="h-10 w-auto min-w-[160px] shrink-0 bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                                <Users className="h-3 h-3 mr-2 text-purple-400 shrink-0" />
                                <SelectValue placeholder="Supervisor" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">Todos los supervisores</SelectItem>
                                {supervisores.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {/* Admin & Supervisor: Advisor Filter */}
                    {(userRol === 'admin' || userRol === 'supervisor') && (
                        <Select value={currentAsesor} onValueChange={(v) => handleFilterChange('asesor', v)}>
                            <SelectTrigger className="h-10 w-auto min-w-[160px] shrink-0 bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3">
                                <Briefcase className="h-3 h-3 mr-2 text-blue-400 shrink-0" />
                                <SelectValue placeholder="Asesor" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">Todos los asesores</SelectItem>
                                {asesores.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <div className="content-card relative min-h-[100px]">
                {/* Central Loader Overlay */}
                {isPending && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/5 backdrop-blur-[1px] animate-in fade-in duration-200">
                        <div className="bg-slate-900/80 p-3 rounded-full border border-white/5 shadow-2xl">
                            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        </div>
                    </div>
                )}

                <div className={`divide-y divide-slate-800/50 transition-opacity duration-300 ${isPending ? 'opacity-40 grayscale-[0.2]' : 'opacity-100'}`}>
                    {pagos.map((pago: any) => (
                        <div key={pago.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between gap-4 group cursor-default">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition-all">
                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                    <div className="font-medium text-slate-200 text-sm group-hover:text-white transition-colors flex items-center gap-2">
                                        {pago.cronograma_cuotas?.prestamos?.clientes?.nombres || 'Cliente'}
                                        {pago.metodo_pago && (
                                            <span className={cn(
                                                "text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold",
                                                pago.metodo_pago === 'Efectivo' 
                                                ? "bg-emerald-500/20 text-emerald-400" 
                                                : "bg-blue-500/20 text-blue-400"
                                            )}>
                                                {pago.metodo_pago}
                                            </span>
                                        )}
                                        {/* Dynamic Turn Badge */}
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider flex items-center gap-1 ${
                                            pago.turno_calculado === 'Turno 1' 
                                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                        }`}>
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
                            
                            <div className="text-right">
                                <div className="text-base font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                    +${pago.monto_pagado}
                                </div>
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

                {/* Pagination */}
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
