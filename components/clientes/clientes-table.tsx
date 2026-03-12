'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Search, Phone, ChevronLeft, ChevronRight, Calendar, Loader2 } from 'lucide-react'
import { cn } from "@/lib/utils"

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

interface ClientesTableProps {
    clientes: any[]
    perfiles?: any[] 
    userRol?: 'admin' | 'supervisor' | 'asesor'
    userId?: string
}

type FilterTab = 'todos' | 'activos' | 'con_deuda' | 'sin_prestamos' | 'inactivos'

const ITEMS_PER_PAGE = 10

const formatMoney = (value: number): string => {
    return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function ClientesTable({ clientes, perfiles = [], userRol = 'asesor', userId = '' }: ClientesTableProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    // 1. Get Filters from URL
    const activeFilter = (searchParams.get('tab') as FilterTab) || 'todos'
    const searchQuery = searchParams.get('q') || ''
    const filtroSupervisor = searchParams.get('supervisor') || 'todos'
    const filtroAsesor = searchParams.get('asesor') || 'todos'
    const currentPage = Number(searchParams.get('page')) || 1

    // 2. Local state for Search Input (Debounce)
    const [localSearch, setLocalSearch] = useState(searchQuery)
    const [fechaFiltro, setFechaFiltro] = useState<string>('')

    // 3. Helper to update URL
    const updateParams = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null) params.delete(key)
            else params.set(key, value)
        })
        
        startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    // 4. Sync local search with URL
    useEffect(() => {
        setLocalSearch(searchQuery)
    }, [searchQuery])

    // Debounce Search Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchQuery) {
                updateParams({ q: localSearch || null, page: '1' })
            }
        }, 600)
        return () => clearTimeout(timer)
    }, [localSearch, searchQuery])

    // ... (logic for supervisores/asesores/tabs/filtering mostly same but using derived vars)

    // Obtener supervisores (para admin)
    const supervisores = useMemo(() => {
        return perfiles.filter(p => p.rol === 'supervisor')
    }, [perfiles])

    // Obtener asesores filtrados
    const asesores = useMemo(() => {
        if (filtroSupervisor !== 'todos') {
            return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === filtroSupervisor)
        }
        if (userRol === 'supervisor') {
            return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === userId)
        }
        return perfiles.filter(p => p.rol === 'asesor')
    }, [perfiles, filtroSupervisor, userRol, userId])

    // Tabs
    const tabs = useMemo(() => [
        { id: 'todos' as FilterTab, label: 'Todos', count: clientes.length },
        { id: 'activos' as FilterTab, label: 'Activos', count: clientes.filter(c => c.estado === 'activo').length },
        { id: 'con_deuda' as FilterTab, label: 'Con Deuda', count: clientes.filter(c => c.stats.totalDebt > 0).length },
        { id: 'sin_prestamos' as FilterTab, label: 'Sin Préstamos', count: clientes.filter(c => c.stats.activeLoansCount === 0).length },
        { id: 'inactivos' as FilterTab, label: 'Inactivos', count: clientes.filter(c => c.estado !== 'activo').length },
    ], [clientes])

    // Filtering Logic
    const filteredClientes = useMemo(() => {
        let result = clientes

        // Supervisor
        if (userRol === 'admin' && filtroSupervisor !== 'todos') {
             const advisorIds = perfiles
                .filter(p => p.supervisor_id === filtroSupervisor)
                .map(p => p.id)
             result = result.filter(c => advisorIds.includes(c.asesor_id))
        }

        // Asesor
        if (filtroAsesor !== 'todos') {
            result = result.filter(c => c.asesor_id === filtroAsesor)
        }

        // Tabs
        switch (activeFilter) {
            case 'activos': result = result.filter(c => c.estado === 'activo'); break;
            case 'con_deuda': result = result.filter(c => c.stats.totalDebt > 0); break;
            case 'sin_prestamos': result = result.filter(c => c.stats.activeLoansCount === 0); break;
            case 'inactivos': result = result.filter(c => c.estado !== 'activo'); break;
        }

        // Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            result = result.filter(c => 
                c.nombres?.toLowerCase().includes(query) ||
                c.dni?.includes(query) ||
                c.telefono?.includes(query)
            )
        }

        return result
    }, [clientes, activeFilter, searchQuery, filtroSupervisor, filtroAsesor, userRol, perfiles])

    // Pagination Logic...
    const totalPages = Math.ceil(filteredClientes.length / ITEMS_PER_PAGE)
    const paginatedClientes = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredClientes.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredClientes, currentPage])

    const handleFilterChange = (val: string) => updateParams({ tab: val, page: '1' })
    const handleSearchChange = (val: string) => setLocalSearch(val)
    const handleSupervisorChange = (val: string) => updateParams({ supervisor: val, page: '1' })
    const handleAsesorChange = (val: string) => updateParams({ asesor: val, page: '1' })
    const handlePageChange = (page: number) => updateParams({ page: String(page) })
    
    const totalDebt = filteredClientes.reduce((acc, c) => acc + (c.stats.totalDebt || 0), 0)

    return (
        <div className="space-y-4">
             {/* Main Filter Bar: Search + Status + Date + Supervisor + Advisor */}
             <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-4 w-full">
                {/* Search */}
                <div className="relative w-full md:flex-1 md:max-w-none">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Buscar cliente..."
                        value={localSearch}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="h-10 pl-9 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full focus:bg-slate-900 transition-colors"
                    />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    {/* Status Filter (Dropdown) */}
                    <div className="w-auto shrink-0">
                        <Select 
                            value={activeFilter} 
                            onValueChange={(val) => handleFilterChange(val)}
                        >
                             <SelectTrigger className={cn("h-10 w-auto min-w-[130px] bg-slate-900/50 border-slate-700 text-slate-200 focus:ring-1 focus:ring-slate-600 px-3", isPending && "opacity-70 cursor-wait")}>
                                {isPending && <Loader2 className="w-3 h-3 mr-2 animate-spin text-slate-400" />}
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                {tabs.map((tab) => (
                                    <SelectItem key={tab.id} value={tab.id} className="focus:bg-slate-800 focus:text-white">
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <span>{tab.label}</span>
                                            <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-[10px] px-1.5 h-5 min-w-[1.25rem] flex items-center justify-center">
                                                {tab.count}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Filter (Visual) */}
                    <div className="w-auto shrink-0">
                        <input
                            type="date"
                            value={fechaFiltro}
                            onChange={(e) => setFechaFiltro(e.target.value)}
                            className="w-auto bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-md px-3 py-2 h-10 focus:outline-none focus:ring-2 focus:ring-slate-600 appearance-none [&::-webkit-calendar-picker-indicator]:invert-[0.5]"
                        />
                    </div>

                    {/* Supervisor Filter (Admin) */}
                    {userRol === 'admin' && supervisores.length > 0 && (
                        <div className="w-auto shrink-0">
                            <Select value={filtroSupervisor} onValueChange={handleSupervisorChange}>
                                <SelectTrigger className={cn("h-10 w-auto min-w-[160px] bg-slate-900/50 border-slate-700 text-slate-200 focus:ring-1 focus:ring-slate-600 px-3", isPending && "opacity-70 cursor-wait")}>
                                    {isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin text-purple-400" /> : <Users className="w-4 h-4 mr-2 text-purple-400" />}
                                    <SelectValue placeholder="Supervisor" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="todos">Todos los supervisores</SelectItem>
                                    {supervisores.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Asesor Filter (Admin/Supervisor) */}
                    {asesores.length > 0 && (
                        <div className="w-auto shrink-0">
                            <Select value={filtroAsesor} onValueChange={handleAsesorChange}>
                                <SelectTrigger className={cn("h-10 w-auto min-w-[160px] bg-slate-900/50 border-slate-700 text-slate-200 focus:ring-1 focus:ring-slate-600 px-3", isPending && "opacity-70 cursor-wait")}>
                                    {isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin text-blue-400" /> : <Users className="w-4 h-4 mr-2 text-blue-400" />}
                                    <SelectValue placeholder="Asesor" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="todos">Todos los asesores</SelectItem>
                                    {asesores.map(a => (
                                        <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>

            {/* Table View */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                {/* Table Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-3 bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    <div className="col-span-3">Cliente</div>
                    <div className="col-span-2">DNI</div>
                    <div className="col-span-2">Teléfono</div>
                    <div className="col-span-2 text-right">Deuda</div>
                    <div className="col-span-1 text-center">Préstamos</div>
                    <div className="col-span-2 text-right">Estado</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-slate-800/50">
                    {isPending ? (
                        <div className="p-0">
                            <TableSkeleton />
                        </div>
                    ) : (
                    <>
                    {paginatedClientes.map((cliente) => {
                         const asesorName = (userRol === 'admin' || userRol === 'supervisor') 
                            ? perfiles.find(p => p.id === cliente.asesor_id)?.nombre_completo 
                            : null

                         return (
                        <div 
                            key={cliente.id} 
                            onClick={() => router.push(`/dashboard/clientes/${cliente.id}`)}
                            className="contents"
                        >
                            <div className={`group grid grid-cols-12 gap-2 md:gap-4 px-4 py-3 md:px-6 md:py-4 hover:bg-slate-800/30 transition-colors cursor-pointer items-center
                                ${cliente.stats.totalDebt > 0 ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-slate-600'}`}>
                                
                                {/* Cliente (Mobile: Col 1-9, Desktop: Col 1-3) */}
                                <div className="col-span-8 md:col-span-3 flex items-center gap-3">
                                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-xs md:text-sm font-bold shrink-0 overflow-hidden
                                        ${cliente.estado === 'activo' ? 'bg-blue-900/50 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                                        {cliente.foto_perfil ? (
                                            <div onClick={(e) => e.stopPropagation()} className="w-full h-full relative z-10">
                                                <ImageLightbox
                                                    src={cliente.foto_perfil}
                                                    alt={cliente.nombres}
                                                    className="w-full h-full"
                                                    thumbnail={
                                                        <img 
                                                            src={cliente.foto_perfil} 
                                                            alt={cliente.nombres} 
                                                            className="w-full h-full object-cover"
                                                        />
                                                    }
                                                />
                                            </div>
                                        ) : (
                                            cliente.nombres?.charAt(0) || '?'
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm md:text-base text-slate-200 truncate group-hover:text-white transition-colors">
                                            {cliente.nombres}
                                        </p>
                                        <p className="text-[10px] text-slate-500 md:hidden">{cliente.dni}</p>
                                        {asesorName && (
                                            <p className="text-[9px] text-purple-400 md:hidden uppercase mt-0.5 truncate">
                                                <Users className="w-2 h-2 inline mr-1" />
                                                {asesorName.split(' ')[0]}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* DNI (Desktop) */}
                                <div className="hidden md:flex col-span-2 items-center">
                                    <span className="text-sm font-mono text-slate-400">{cliente.dni}</span>
                                </div>

                                {/* Teléfono (Desktop) */}
                                <div className="hidden md:flex col-span-2 items-center gap-2">
                                    <Phone className="w-3 h-3 text-slate-600" />
                                    <span className="text-sm text-slate-400">{cliente.telefono || '-'}</span>
                                </div>

                                {/* Deuda + Estado Mobile (Mobile: Col 10-12, Desktop: Col 8-9) */}
                                <div className="col-span-4 md:col-span-2 flex flex-col md:flex-row items-end md:items-center justify-center md:justify-end gap-1">
                                    <span className={`text-sm font-bold ${cliente.stats.totalDebt > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                        ${formatMoney(cliente.stats.totalDebt)}
                                    </span>
                                    {/* Mobile Status Badge */}
                                    <Badge variant="outline" className={`md:hidden text-[9px] h-4 px-1 ${
                                        cliente.estado === 'activo'
                                            ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/50'
                                            : 'bg-slate-800 text-slate-500 border-slate-700'
                                    }`}>
                                        {cliente.estado === 'activo' ? 'ACT' : 'INA'}
                                    </Badge>
                                </div>

                                {/* Préstamos (Desktop) */}
                                <div className="hidden md:flex col-span-1 items-center justify-center">
                                    <span className={`text-sm font-bold ${cliente.stats.activeLoansCount > 0 ? 'text-blue-400' : 'text-slate-600'}`}>
                                        {cliente.stats.activeLoansCount}
                                    </span>
                                </div>

                                {/* Estado (Desktop w/ Asesor info if relevant) */}
                                <div className="hidden md:flex col-span-2 flex-col items-end justify-center">
                                    <Badge variant="outline" className={`text-[10px] mb-1 ${
                                        cliente.estado === 'activo'
                                            ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/50'
                                            : 'bg-slate-800 text-slate-500 border-slate-700'
                                    }`}>
                                        {cliente.estado?.toUpperCase() || 'ACTIVO'}
                                    </Badge>
                                    {asesorName && (
                                         <span className="text-[10px] text-purple-400 uppercase tracking-tighter">
                                            {asesorName.split(' ')[0]} {asesorName.split(' ')[1]?.charAt(0)}.
                                         </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )})}
                    </>
                    )}
                </div>

                {/* Empty State */}
                {!isPending && filteredClientes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                            <Users className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="text-lg font-medium">
                            {searchQuery ? 'Sin resultados' : 'No hay clientes'}
                        </p>
                        <p className="text-sm">
                            {searchQuery 
                                ? `No se encontraron clientes para "${searchQuery}"` 
                                : 'Los clientes se crean automáticamente al aprobar solicitudes'}
                        </p>
                    </div>
                )}

                {/* Footer Stats + Pagination */}
                {filteredClientes.length > 0 && (
                    <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 flex flex-wrap gap-6 items-center justify-between">
                        <div className="flex gap-6 text-xs text-slate-500">
                            <span>RECUENTO: <span className="text-slate-300 font-bold">{filteredClientes.length}</span></span>
                            <span>DEUDA TOTAL: <span className="text-emerald-400 font-bold">${formatMoney(totalDebt)}</span></span>
                        </div>
                        
                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1 || isPending}
                                    className="text-slate-400 hover:text-white disabled:opacity-30"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <span className="text-xs text-slate-400">
                                    Página <span className="text-white font-bold">{currentPage}</span> de {totalPages}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages || isPending}
                                    className="text-slate-400 hover:text-white disabled:opacity-30"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
