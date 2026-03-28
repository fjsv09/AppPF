'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
    Calendar, Users, MapPin, Clock, 
    AlertTriangle, CheckCircle2, ChevronRight, 
    Search, Filter, Map, Download,
    FileText, User, ArrowUpRight, Banknote
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select"
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface AttendanceRecord {
    id: string
    fecha: string
    hora_entrada: string
    lat: number
    lon: number
    distancia_oficina: number
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
    currentFilters: { date: string; user_id?: string }
}

export function AttendanceTable({ initialData, usuarios, currentFilters }: AttendanceTableProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    const [dateFilter, setDateFilter] = useState(currentFilters.date)
    const [userFilter, setUserFilter] = useState(currentFilters.user_id || 'todos')
    const [searchTerm, setSearchTerm] = useState('')

    // Apply filtering
    const handleFilter = () => {
        const params = new URLSearchParams()
        if (dateFilter) params.set('date', dateFilter)
        if (userFilter !== 'todos') params.set('user_id', userFilter)
        
        router.push(`/dashboard/asistencia?${params.toString()}`)
    }

    const filteredData = useMemo(() => {
        if (!searchTerm) return initialData
        return initialData.filter(item => 
            item.perfil?.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [initialData, searchTerm])

    // KPI Stats
    const stats = useMemo(() => {
        const total = initialData.length
        const puntualesNum = initialData.filter(i => i.estado === 'puntual').length
        const tardanzasNum = initialData.filter(i => i.estado === 'tardanza').length
        const totalDescuentosValue = initialData.reduce((acc, curr) => acc + (curr.descuento_tardanza || 0), 0)

        return {
            total,
            puntualesNum,
            tardanzasNum,
            totalDescuentosValue,
            tasaPuntualidad: total > 0 ? Math.round((puntualesNum / total) * 100) : 0
        }
    }, [initialData])

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <Users className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Registros</span>
                    </div>
                    <p className="text-2xl font-black text-white">{stats.total}</p>
                </div>

                <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Puntuales</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <p className="text-2xl font-black text-emerald-400">{stats.puntualesNum}</p>
                        <span className="text-[10px] text-slate-500 mb-1 font-bold">{stats.tasaPuntualidad}% puntuales</span>
                    </div>
                </div>

                <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                            <AlertTriangle className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tardanzas</span>
                    </div>
                    <p className="text-2xl font-black text-amber-500">{stats.tardanzasNum}</p>
                </div>

                <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
                            <Banknote className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Descuento Total</span>
                    </div>
                    <p className="text-2xl font-black text-rose-400">S/ {stats.totalDescuentosValue.toFixed(2)}</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-4 shadow-xl">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Buscar Trabajador</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input 
                                placeholder="Nombre del trabajador..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 bg-slate-950/50 border-slate-800 focus:border-blue-500/50 rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48 space-y-2">
                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Fecha</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10 pointer-events-none" />
                            <Input 
                                type="date"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="pl-10 h-10 bg-slate-950/50 border-slate-800 focus:border-blue-500/50 rounded-xl appearance-none"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-64 space-y-2">
                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Trabajador (Filtro DB)</label>
                        <Select value={userFilter} onValueChange={setUserFilter}>
                            <SelectTrigger className="h-10 bg-slate-950/50 border-slate-800 rounded-xl">
                                <SelectValue placeholder="Todos los usuarios" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="todos">Todos los usuarios</SelectItem>
                                {usuarios.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.nombre_completo} ({u.rol})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button 
                        onClick={handleFilter}
                        className="h-10 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20"
                    >
                        <Filter className="h-4 w-4 mr-2" />
                        Filtrar
                    </Button>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/50 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-800/50 bg-slate-950/20">
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Trabajador</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Entrada</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Ubicación</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Tardanza</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Descuento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30">
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                                        No se encontraron registros de asistencia para los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((record) => (
                                    <tr key={record.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-400 group-hover:border-blue-500/30 transition-colors">
                                                    {record.perfil?.nombre_completo?.slice(0, 1) || 'U'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                                                        {record.perfil?.nombre_completo || 'Desconocido'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                                                        {record.perfil?.rol || 'Trabajador'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-3 h-3 text-slate-500" />
                                                <span className="text-sm font-mono text-slate-300 font-bold">
                                                    {record.hora_entrada}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-3 h-3 text-blue-400" />
                                                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                                                        {record.distancia_oficina} metros de la oficina
                                                    </span>
                                                </div>
                                                <a 
                                                    href={`https://www.google.com/maps?q=${record.lat},${record.lon}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-[9px] text-blue-400/70 hover:text-blue-400 font-bold uppercase tracking-wider pl-5 transition-colors"
                                                >
                                                    Ver en Mapa <ArrowUpRight className="w-2.5 h-2.5" />
                                                </a>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {record.estado === 'puntual' ? (
                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-2 py-0.5 rounded-lg text-xs font-bold ring-1 ring-emerald-500/10">
                                                    Puntual
                                                </Badge>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-2 py-0.5 rounded-lg text-xs font-bold ring-1 ring-amber-500/10">
                                                        {record.minutos_tardanza} min
                                                    </Badge>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <p className={cn(
                                                "text-sm font-bold font-mono",
                                                record.descuento_tardanza > 0 ? "text-rose-400" : "text-emerald-400"
                                            )}>
                                                {record.descuento_tardanza > 0 ? `- S/ ${record.descuento_tardanza.toFixed(2)}` : 'S/ 0.00'}
                                            </p>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-center justify-between px-2">
                <p className="text-[10px] text-slate-500 font-medium">
                    Mostrando {filteredData.length} registros de asistencia
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-slate-900 border-slate-800 text-slate-400" disabled>
                        Anterior
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs bg-slate-900 border-slate-800 text-slate-400" disabled>
                        Siguiente
                    </Button>
                </div>
            </div>
        </div>
    )
}
