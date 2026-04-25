'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    Calendar, Users, MapPin, Clock,
    AlertTriangle, CheckCircle2, ChevronRight,
    Search, Filter, Map, Download,
    FileText, User, ArrowUpRight, Banknote, ShieldCheck,
    RotateCcw, Loader2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AttendanceRecord {
    id: string
    fecha: string
    hora_entrada: string
    hora_turno_tarde?: string
    hora_cierre?: string
    tardanza_entrada?: number
    tardanza_turno_tarde?: number
    tardanza_cierre?: number
    lat: number
    lon: number
    lat_tarde?: number
    lon_tarde?: number
    lat_cierre?: number
    lon_cierre?: number
    distancia_oficina: number
    distancia_entrada?: number
    distancia_tarde?: number
    distancia_cierre?: number
    minutos_tardanza: number
    descuento_tardanza: number
    estado: string
    perfil: {
        nombre_completo: string
        rol: string
        supervisor_id: string
    }
}

interface UserSummary {
    id: string
    nombre_completo: string
    rol: string
}

interface AttendanceTableProps {
    initialData: any[]
    usuarios: UserSummary[]
    currentFilters: { startDate: string; endDate: string; user_id?: string }
    userRole?: string
}

export function AttendanceTable({ initialData, usuarios, currentFilters, userRole }: AttendanceTableProps) {
    const router = useRouter()

    const [startDate, setStartDate] = useState(currentFilters.startDate)
    const [endDate, setEndDate] = useState(currentFilters.endDate)
    const [isRange, setIsRange] = useState(currentFilters.startDate !== currentFilters.endDate)
    const [userFilter, setUserFilter] = useState(currentFilters.user_id || 'todos')
    const [searchTerm, setSearchTerm] = useState('')
    const [isExonerating, setIsExonerating] = useState<string | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmTarget, setConfirmTarget] = useState<{ id: string, turno: 'entrada' | 'tarde' | 'cierre' } | null>(null)

    const handleExonerate = (asistenciaId: string, turno: 'entrada' | 'tarde' | 'cierre') => {
        setConfirmTarget({ id: asistenciaId, turno })
        setConfirmOpen(true)
    }

    const performExonerate = async () => {
        if (!confirmTarget || isExonerating) return
        const { id: asistenciaId, turno } = confirmTarget
        const readableTurno = turno === 'entrada' ? 'Mañana' : (turno === 'tarde' ? 'Turno Tarde' : 'Cierre')
        
        setIsExonerating(`${asistenciaId}-${turno}`)
        // No cerramos el modal inmediatamente para mostrar el estado de carga en el botón
        
        try {
            const res = await fetch('/api/asistencia/exonerar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asistenciaId, turno })
            })

            if (res.ok) {
                toast.success(`Tardanza de ${readableTurno} exonerada`)
                setConfirmOpen(false)
                router.refresh()
            } else {
                const errorData = await res.json()
                toast.error(errorData.error || 'Error al exonerar')
            }
        } catch (error) {
            toast.error('Error de conexión')
        } finally {
            setIsExonerating(null)
            setConfirmTarget(null)
        }
    }

    // Apply filtering and sync URL
    const handleFilter = useCallback(() => {
        const params = new URLSearchParams()
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)
        if (userFilter !== 'todos') params.set('user_id', userFilter)

        router.push(`/dashboard/asistencia?${params.toString()}`)
    }, [startDate, endDate, userFilter, router])

    // Reset Filters
    const handleClearFilters = () => {
        const now = new Date()
        const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`
        
        setSearchTerm('')
        setUserFilter('todos')
        setStartDate(todayStr)
        setEndDate(todayStr)
        setIsRange(false)
    }

    // Reactivity: Auto-update URL when filters change (except search)
    useEffect(() => {
        handleFilter()
    }, [startDate, endDate, userFilter, handleFilter])

    const filteredData = useMemo(() => {
        let data = [...initialData]
        
        // Primero filtramos si hay término de búsqueda
        if (searchTerm) {
            data = data.filter(item =>
                item.perfil?.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        // Siempre ordenamos: Fecha DESC, Hora Entrada DESC
        return data.sort((a, b) => {
            if (a.fecha !== b.fecha) {
                return b.fecha.localeCompare(a.fecha)
            }
            return (b.hora_entrada || '').localeCompare(a.hora_entrada || '')
        })
    }, [initialData, searchTerm])

    // KPI Stats - REACTIVE TO SEARCH
    const stats = useMemo(() => {
        const total = filteredData.length
        const puntualesNum = filteredData.filter(i => i.estado === 'puntual').length
        const tardanzasNum = filteredData.filter(i => i.estado === 'tardanza').length
        const totalDescuentosValue = filteredData.reduce((acc, curr) => acc + (curr.descuento_tardanza || 0), 0)

        return {
            total,
            puntualesNum,
            tardanzasNum,
            totalDescuentosValue,
            tasaPuntualidad: total > 0 ? Math.round((puntualesNum / total) * 100) : 0
        }
    }, [filteredData])

    return (
        <div className="space-y-6">
            {/* KPI Cards (2x2 on mobile for less scroll) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="p-3 md:p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <Users className="w-3 h-3 md:w-4 md:h-4" />
                        </div>
                        <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Registros</span>
                    </div>
                    <p className="text-lg md:text-2xl font-black text-white">{stats.total}</p>
                </div>

                <div className="p-3 md:p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                            <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
                        </div>
                        <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-widest text-emerald-500/80">Puntuales</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <p className="text-lg md:text-2xl font-black text-emerald-400">{stats.puntualesNum}</p>
                        <span className="text-[9px] text-slate-500 font-bold hidden sm:inline">{stats.tasaPuntualidad}%</span>
                    </div>
                </div>

                <div className="p-3 md:p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                            <AlertTriangle className="w-3 h-3 md:w-4 md:h-4" />
                        </div>
                        <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-widest text-amber-500/80">Tardanzas</span>
                    </div>
                    <p className="text-lg md:text-2xl font-black text-amber-500">{stats.tardanzasNum}</p>
                </div>

                <div className="p-3 md:p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
                            <Banknote className="w-3 h-3 md:w-4 md:h-4" />
                        </div>
                        <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">Descuento</span>
                    </div>
                    <p className="text-lg md:text-2xl font-black text-rose-400">S/ {stats.totalDescuentosValue.toFixed(2)}</p>
                </div>
            </div>            {/* Filter Bar - Responsive Logic */}
            <div className="flex flex-col lg:flex-row gap-3 bg-slate-900/40 border border-slate-800/50 p-2.5 md:p-3 rounded-2xl backdrop-blur-sm shadow-xl shadow-black/20 overflow-hidden">
                {/* 1. Buscador - Full width en móvil, Flex-1 en desktop */}
                <div className="relative w-full lg:flex-1 lg:max-w-none min-w-[180px] group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <Input 
                        placeholder="Filtrar por nombre..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-slate-950/50 border-slate-800/60 pl-10 !h-[44px] focus:border-blue-500/50 focus:ring-0 rounded-xl text-sm"
                    />
                </div>

                {/* 2. Contenedor de Scroll para el resto de controles */}
                <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto lg:overflow-visible pb-1.5 lg:pb-0 scrollbar-hide">
                    {/* Filtro Rango de Fechas - Altura Estandarizada */}
                    <div className="flex items-center gap-1 bg-slate-950/30 p-1 !h-[44px] rounded-xl border border-slate-800/50 shrink-0">
                        <button 
                            onClick={() => {
                                if (isRange) setEndDate(startDate)
                                setIsRange(!isRange)
                            }}
                            className={cn(
                                "px-2 h-full rounded-lg flex items-center justify-center transition-all shrink-0",
                                isRange ? "bg-blue-600 text-white shadow-lg" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                            )}
                        >
                            <ArrowUpRight className={cn("w-3.5 h-3.5 transition-transform", isRange ? "rotate-45" : "rotate-0")} />
                        </button>

                        <div className="relative w-[130px] group shrink-0 h-full">
                            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 group-focus-within:text-blue-400 transition-colors pointer-events-none z-10" />
                            <Input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => {
                                    const newDate = e.target.value
                                    setStartDate(newDate)
                                    if (!isRange) setEndDate(newDate)
                                }}
                                className="bg-transparent border-none pl-7 pr-1 h-full focus:ring-0 text-[10px] md:text-[11px] text-slate-300 appearance-none w-full [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                            />
                        </div>

                        {isRange && (
                            <>
                                <div className="text-slate-800 font-bold px-0.5 select-none shrink-0 h-full flex items-center">/</div>
                                <div className="relative w-[130px] group shrink-0 h-full">
                                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 group-focus-within:text-blue-400 transition-colors pointer-events-none z-10" />
                                    <Input 
                                        type="date" 
                                        value={endDate} 
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="bg-transparent border-none pl-7 pr-1 h-full focus:ring-0 text-[10px] md:text-[11px] text-slate-300 appearance-none w-full [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Selector Trabajador */}
                    <div className="w-[180px] shrink-0">
                        <Select value={userFilter} onValueChange={setUserFilter}>
                            <SelectTrigger className="bg-slate-950/50 border-slate-800/60 !h-[44px] focus:ring-0 rounded-xl text-sm text-slate-400">
                                <SelectValue placeholder="Trabajador" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="todos">Todos los usuarios</SelectItem>
                                {usuarios.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.nombre_completo}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Acciones Finales */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Button 
                            onClick={handleClearFilters}
                            variant="outline"
                            className="!h-[44px] px-3 border-slate-800 bg-slate-950/20 text-slate-500 hover:text-white rounded-xl active:scale-95 transition-all"
                            title="Limpiar"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </Button>

                        <Button 
                            onClick={() => toast.info('Exportando...')}
                            variant="outline"
                            className="!h-[44px] px-4 border-slate-800 bg-slate-950/20 text-slate-400 hover:text-white font-bold rounded-xl active:scale-95 transition-all flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Exportar</span>
                        </Button>
                    </div>
                </div>
            </div>


            {/* Main Table */}
            {/* Desktop Table View */}
            <div className="hidden md:block bg-slate-900/40 backdrop-blur-sm border border-slate-800/50 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-800/50 bg-slate-950/20">
                                <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-500 tracking-widest bg-slate-950/30">Trabajador</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-500 tracking-widest text-center bg-slate-950/30">Fecha</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-500 tracking-widest text-center bg-slate-950/30">Seguimiento de Eventos (E - TT - C)</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-500 tracking-widest text-right bg-slate-950/30">Resumen Financiero</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">
                                        No se encontraron registros de asistencia para los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((record) => (
                                    <tr key={record.id} className="group hover:bg-white/[0.01] transition-all border-b border-white/[0.03]">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/50 flex items-center justify-center font-black text-slate-400 group-hover:border-blue-500/50 transition-all text-base shadow-xl shadow-black/20">
                                                        {record.perfil?.nombre_completo?.slice(0, 1) || 'U'}
                                                    </div>
                                                    <div className={cn(
                                                        "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md border-2 border-slate-950 flex items-center justify-center shadow-lg",
                                                        record.estado === 'puntual' ? "bg-emerald-500" : "bg-amber-500"
                                                    )}>
                                                        {record.estado === 'puntual' ? <CheckCircle2 className="w-2.5 h-2.5 text-white" /> : <AlertTriangle className="w-2.5 h-2.5 text-black" />}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-200 group-hover:text-white transition-colors tracking-tight leading-tight">
                                                        {record.perfil?.nombre_completo || 'Desconocido'}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <Badge variant="outline" className="bg-slate-900/50 text-[8px] uppercase tracking-tighter text-slate-500 border-slate-800 px-1 py-0 h-3.5">
                                                            {record.perfil?.rol || 'Trabajador'}
                                                        </Badge>
                                                        {record.minutos_tardanza > 0 && (
                                                            <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                                                                {record.minutos_tardanza}m
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <div className="inline-flex flex-col items-center">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-0.5">
                                                    {format(parseISO(record.fecha), 'EEEE', { locale: es })}
                                                </span>
                                                <span className="text-sm font-black text-white bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
                                                    {format(parseISO(record.fecha), 'dd/MM/yyyy')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2 justify-center max-w-[700px] mx-auto">
                                                {/* Entrada Widget */}
                                                <div className="flex-1 min-w-[130px] bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40 relative overflow-hidden group/widget hover:border-slate-700/60 transition-all shadow-lg shadow-black/40">
                                                    <div className="absolute top-0 left-0 w-full h-[1.5px] bg-slate-400/20" />
                                                    <div className="flex items-center justify-between mb-1.5 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                        <span>Entrada</span>
                                                        <Clock className="w-2.5 h-2.5 opacity-30" />
                                                    </div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-base font-mono text-white font-black leading-none">{record.hora_entrada}</span>
                                                        {record.tardanza_entrada > 0 && (
                                                            <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-lg border border-amber-500/20">
                                                                +{record.tardanza_entrada}m
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                                                        <div className="flex items-center gap-1.5">
                                                            <a 
                                                                href={`https://www.google.com/maps?q=${record.lat},${record.lon}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="w-6 h-6 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 hover:scale-105 transition-all"
                                                            >
                                                                <MapPin className="w-3.5 h-3.5" />
                                                            </a>
                                                            <span className="text-[10px] font-black text-slate-400 tracking-tight">
                                                                {record.distancia_entrada ?? record.distancia_oficina}m
                                                            </span>
                                                        </div>
                                                        {record.tardanza_entrada > 0 && userRole === 'admin' && (
                                                            <button 
                                                                onClick={() => handleExonerate(record.id, 'entrada')}
                                                                disabled={isExonerating === `${record.id}-entrada`}
                                                                className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all shadow-md shrink-0 flex items-center justify-center active:scale-90"
                                                                title="Exonerar Entrada"
                                                            >
                                                                <ShieldCheck className="w-4.5 h-4.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Tarde Widget */}
                                                <div className="flex-1 min-w-[130px] bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40 relative overflow-hidden group/widget hover:border-slate-700/60 transition-all shadow-lg shadow-black/40">
                                                    <div className="absolute top-0 left-0 w-full h-[1.5px] bg-emerald-400/20" />
                                                    <div className="flex items-center justify-between mb-1.5 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                        <span>Turno Tarde</span>
                                                        <Clock className="w-2.5 h-2.5 opacity-30" />
                                                    </div>
                                                    {record.hora_turno_tarde ? (
                                                        <>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-base font-mono text-emerald-400 font-black leading-none">{record.hora_turno_tarde}</span>
                                                                {record.tardanza_turno_tarde > 0 && (
                                                                    <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-lg border border-amber-500/20">
                                                                        +{record.tardanza_turno_tarde}m
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                                                                <div className="flex items-center gap-1.5">
                                                                    <a 
                                                                        href={`https://www.google.com/maps?q=${record.lat_tarde || record.lat},${record.lon_tarde || record.lon}`}
                                                                        target="_blank" rel="noopener noreferrer"
                                                                        className="w-6 h-6 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 hover:scale-105 transition-all"
                                                                    >
                                                                        <MapPin className="w-3.5 h-3.5" />
                                                                    </a>
                                                                    <span className="text-[10px] font-black text-slate-400 tracking-tight">
                                                                        {record.distancia_tarde ?? record.distancia_oficina}m
                                                                    </span>
                                                                </div>
                                                                {record.tardanza_turno_tarde > 0 && userRole === 'admin' && (
                                                                    <button 
                                                                        onClick={() => handleExonerate(record.id, 'tarde')}
                                                                        disabled={isExonerating === `${record.id}-tarde`}
                                                                        className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all shadow-md shrink-0 flex items-center justify-center active:scale-90"
                                                                        title="Exonerar Turno Tarde"
                                                                    >
                                                                        <ShieldCheck className="w-4.5 h-4.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="h-[44px] flex items-center justify-center text-slate-800 italic text-[10px] font-black tracking-widest">
                                                            ESPERANDO
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Cierre Widget */}
                                                <div className="flex-1 min-w-[130px] bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40 relative overflow-hidden group/widget hover:border-slate-700/60 transition-all shadow-lg shadow-black/40">
                                                    <div className="absolute top-0 left-0 w-full h-[1.5px] bg-blue-400/20" />
                                                    <div className="flex items-center justify-between mb-1.5 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                                                        <span>Cierre</span>
                                                        <Clock className="w-2.5 h-2.5 opacity-30" />
                                                    </div>
                                                    {record.hora_cierre ? (
                                                        <>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-base font-mono text-blue-400 font-black leading-none">{record.hora_cierre}</span>
                                                                {record.tardanza_cierre > 0 && (
                                                                    <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-lg border border-amber-500/20">
                                                                        +{record.tardanza_cierre}m
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                                                                <div className="flex items-center gap-1.5">
                                                                    <a 
                                                                        href={`https://www.google.com/maps?q=${record.lat_cierre || record.lat},${record.lon_cierre || record.lon}`}
                                                                        target="_blank" rel="noopener noreferrer"
                                                                        className="w-6 h-6 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 hover:scale-110 transition-all"
                                                                    >
                                                                        <MapPin className="w-3.5 h-3.5" />
                                                                    </a>
                                                                    <span className="text-[10px] font-black text-slate-400 tracking-tight">
                                                                        {record.distancia_cierre ?? record.distancia_oficina}m
                                                                    </span>
                                                                </div>
                                                                {record.tardanza_cierre > 0 && userRole === 'admin' && (
                                                                    <button 
                                                                        onClick={() => handleExonerate(record.id, 'cierre')}
                                                                        disabled={isExonerating === `${record.id}-cierre`}
                                                                        className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all shadow-md shrink-0 flex items-center justify-center active:scale-90"
                                                                        title="Exonerar Cierre"
                                                                    >
                                                                        <ShieldCheck className="w-4.5 h-4.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="h-[44px] flex items-center justify-center text-slate-800 italic text-[10px] font-black tracking-widest">
                                                            ESPERANDO
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex flex-col items-end">
                                                <Badge className={cn(
                                                    "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg border",
                                                    record.estado === 'puntual' 
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                                        : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                )}>
                                                    {record.estado}
                                                </Badge>
                                                <p className={cn(
                                                    "text-lg font-black font-mono mt-1",
                                                    record.descuento_tardanza > 0 ? "text-rose-400" : "text-emerald-400"
                                                )}>
                                                    {record.descuento_tardanza > 0 ? `- S/ ${record.descuento_tardanza.toFixed(2)}` : 'S/ 0.00'}
                                                </p>
                                                <span className="text-[9px] text-slate-600 font-black tracking-widest mt-0.5 uppercase">Descuento</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="md:hidden space-y-4">
                {filteredData.length === 0 ? (
                    <div className="p-12 text-center text-slate-600 italic bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-3xl">
                        No se encontraron registros activos.
                    </div>
                ) : (
                    filteredData.map((record) => (
                        <div key={record.id} className="bg-slate-900/80 border border-white/5 rounded-3xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-xl">
                            {/* Card Background Glow */}
                            <div className={cn(
                                "absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 rounded-full",
                                record.estado === 'puntual' ? "bg-emerald-500" : "bg-amber-500"
                            )} />

                            {/* Header: User Info */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-slate-400 text-lg shadow-lg">
                                        {record.perfil?.nombre_completo?.slice(0, 1) || 'U'}
                                    </div>
                                    <div>
                                        <p className="text-base font-black text-slate-100 tracking-tight leading-none mb-1">
                                            {record.perfil?.nombre_completo || 'Desconocido'}
                                        </p>
                                        <Badge variant="outline" className="bg-slate-950/50 text-[9px] uppercase tracking-tighter text-slate-500 border-slate-800 px-1.5 py-0 h-4">
                                            {record.perfil?.rol || 'Trabajador'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {format(parseISO(record.fecha), 'EEE d MMM', { locale: es })}
                                        </span>
                                        <Badge className={cn(
                                            "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest",
                                            record.estado === 'puntual' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        )}>
                                            {record.estado}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Body: Timeline of Events */}
                            <div className="space-y-4 relative ml-2">
                                {/* Vertical Connecting Line */}
                                <div className="absolute left-[13px] top-6 bottom-6 w-0.5 bg-dashed border-l border-white/5" />

                                {/* Event Item Worker */}
                                {[
                                    { key: 'entrada', label: 'E', time: record.hora_entrada, late: record.tardanza_entrada, dist: record.distancia_entrada ?? record.distancia_oficina, lat: record.lat, lon: record.lon, color: 'slate' },
                                    { key: 'tarde', label: 'TT', time: record.hora_turno_tarde, late: record.tardanza_turno_tarde, dist: record.distancia_tarde ?? record.distancia_oficina, lat: record.lat_tarde || record.lat, lon: record.lon_tarde || record.lon, color: 'emerald' },
                                    { key: 'cierre', label: 'C', time: record.hora_cierre, late: record.tardanza_cierre, dist: record.distancia_cierre ?? record.distancia_oficina, lat: record.lat_cierre || record.lat, lon: record.lon_cierre || record.lon, color: 'blue' }
                                ].map((step) => (
                                    <div key={step.key} className="flex items-center gap-4 relative z-10">
                                        <div className={cn(
                                            "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border-2 shadow-lg",
                                            step.time
                                                ? (step.color === 'slate' ? "bg-slate-900 border-slate-700 text-slate-300" : (step.color === 'emerald' ? "bg-emerald-900/50 border-emerald-700/50 text-emerald-300" : "bg-blue-900/50 border-blue-700/50 text-blue-300"))
                                                : "bg-slate-950 border-slate-900 text-slate-700"
                                        )}>
                                            {step.label}
                                        </div>

                                        <div className="flex-1 bg-slate-950/60 p-3 rounded-2xl border border-white/5 flex items-center justify-between">
                                            {step.time ? (
                                                <>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-mono font-black text-slate-100">{step.time}</span>
                                                            {(step.late || 0) > 0 && (
                                                                <span className="text-[9px] font-bold text-amber-500">+{step.late}m</span>
                                                            )}
                                                        </div>
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Audit: {step.dist}m</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={`https://www.google.com/maps?q=${step.lat},${step.lon}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 active:scale-90"
                                                        >
                                                            <MapPin className="w-4 h-4" />
                                                        </a>
                                                        {((step.late || 0) > 0 && userRole === 'admin') && (
                                                            <button
                                                                onClick={() => handleExonerate(record.id, step.key as any)}
                                                                disabled={isExonerating === `${record.id}-${step.key}`}
                                                                className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center active:scale-90"
                                                            >
                                                                <ShieldCheck className="w-4.5 h-4.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-slate-700 italic font-black uppercase tracking-[0.2em]">Pendiente</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer: Financials */}
                            <div className="mt-6 pt-5 border-t border-white/5 flex items-end justify-between">
                                <div>
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tardanza Total</p>
                                    <p className="text-xs font-black text-amber-500/80 bg-amber-500/5 px-2 py-0.5 rounded-lg border border-amber-500/10 inline-block">
                                        {record.minutos_tardanza} min tardanza
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Impacto Nómina</p>
                                    <p className={cn(
                                        "text-xl font-black font-mono",
                                        record.descuento_tardanza > 0 ? "text-rose-400" : "text-emerald-400"
                                    )}>
                                        {record.descuento_tardanza > 0 ? `-S/${record.descuento_tardanza.toFixed(2)}` : 'S/0.00'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="flex items-center justify-between px-2 pt-2">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    {filteredData.length} registros
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 px-3 text-[10px] bg-slate-900 border-slate-800 text-slate-500" disabled>
                        Prev
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-3 text-[10px] bg-slate-900 border-slate-800 text-slate-500" disabled>
                        Next
                    </Button>
                </div>
            </div>

            {/* Premium Confirmation Dialog */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 shadow-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-black text-white flex items-center gap-2">
                            <ShieldCheck className="w-6 h-6 text-amber-500" />
                            Confirmar Exoneración
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 text-sm">
                            ¿Estás seguro de que deseas exonerar la tardanza del turno 
                            <span className="text-amber-500 font-bold ml-1">
                                {confirmTarget?.turno === 'entrada' ? 'Mañana' : (confirmTarget?.turno === 'tarde' ? 'Turno Tarde' : 'Cierre')}
                            </span>? 
                            Esta acción eliminará el descuento aplicado en el historial y nómina.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-900 hover:text-white rounded-xl h-11">
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={(e) => {
                                e.preventDefault()
                                performExonerate()
                            }}
                            disabled={!!isExonerating}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-widest text-[10px] rounded-xl h-11 px-6 shadow-lg shadow-amber-500/20 min-w-[140px]"
                        >
                            {isExonerating ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Procesando</span>
                                </div>
                            ) : 'Confirmar Exoneración'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
