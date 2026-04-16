"use client"

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
    CheckCircle2, 
    AlertTriangle, 
    AlertCircle, 
    Receipt, 
    Loader2, 
    ArrowUpRight, 
    Calendar as CalendarIcon, 
    Filter, 
    Clock, 
    Download,
    User,
    Phone,
    ExternalLink,
    ChevronRight,
    Search
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import { cn, formatDatePeru } from '@/lib/utils'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

type DateRangeType = 'today' | '7days' | 'month' | 'all' | 'custom'
type ViewMode = 'advisors' | 'loans'

export function VoucherAlerts() {
    const [stats, setStats] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [dateRangeType, setDateRangeType] = useState<DateRangeType>('month')
    const [viewMode, setViewMode] = useState<ViewMode>('advisors')
    const [fromDate, setFromDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
    const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
    const [selectedAdvisor, setSelectedAdvisor] = useState<any>(null)
    const [searchTerm, setSearchTerm] = useState('')

    const fetchVouchersStats = useCallback(async () => {
        setLoading(true)
        try {
            const now = new Date()
            let startIso: string | null = null
            let endIso: string | null = null

            if (dateRangeType === 'today') {
                startIso = startOfDay(now).toISOString()
                endIso = endOfDay(now).toISOString()
            } else if (dateRangeType === '7days') {
                startIso = startOfDay(subDays(now, 7)).toISOString()
                endIso = endOfDay(now).toISOString()
            } else if (dateRangeType === 'month') {
                startIso = startOfDay(startOfMonth(now)).toISOString()
                endIso = endOfDay(endOfMonth(now)).toISOString()
            } else if (dateRangeType === 'custom' && fromDate && toDate) {
                startIso = startOfDay(new Date(fromDate + 'T00:00:00')).toISOString()
                endIso = endOfDay(new Date(toDate + 'T23:59:59')).toISOString()
            } else if (dateRangeType === 'all') {
                startIso = null
                endIso = null
            }

            const url = new URL('/api/auditoria/vouchers', window.location.origin)
            if (startIso) url.searchParams.set('from', startIso)
            if (endIso) url.searchParams.set('to', endIso)

            const response = await fetch(url.toString())
            if (!response.ok) throw new Error('Error al cargar estadísticas')
            const data = await response.json()
            
            const finalStats = data.map((s: any) => ({
                ...s,
                pendientesCount: s.pendientes?.length || 0,
                percentage: s.total > 0 ? (s.compartidos / s.total) * 100 : 100,
                hasActivity: s.total > 0
            })).sort((a: any, b: any) => {
                if (a.hasActivity && !b.hasActivity) return -1
                if (!a.hasActivity && b.hasActivity) return 1
                return a.percentage - b.percentage
            })

            setStats(finalStats)
        } catch (error) {
            console.error("Error fetching voucher stats:", error)
            toast.error("No se pudieron cargar los datos de vouchers")
        } finally {
            setLoading(false)
        }
    }, [dateRangeType, fromDate, toDate])

    useEffect(() => {
        fetchVouchersStats()
    }, [fetchVouchersStats])

    const globalPendientesCount = useMemo(() => {
        return stats.reduce((sum, s) => sum + (s.pendientesCount || 0), 0)
    }, [stats])

    const filteredStats = useMemo(() => {
        return stats.filter(s => 
            s.nombre.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }, [stats, searchTerm])

    const loansStats = useMemo(() => {
        const loansMap: Record<string, any> = {}
        
        stats.forEach(s => {
            s.pendientes?.forEach((p: any) => {
                if (!loansMap[p.prestamo_id]) {
                    loansMap[p.prestamo_id] = {
                        prestamo_id: p.prestamo_id,
                        cliente: p.cliente,
                        asesor: s.nombre,
                        telefono: p.telefono,
                        pendientes: []
                    }
                }
                loansMap[p.prestamo_id].pendientes.push(p)
            })
        })

        return Object.values(loansMap)
            .map((l: any) => ({
                ...l,
                count: l.pendientes.length
            }))
            .sort((a, b) => b.count - a.count)
            .filter(l => 
                l.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.prestamo_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.asesor.toLowerCase().includes(searchTerm.toLowerCase())
            )
    }, [stats, searchTerm])

    const getStatusColor = (percentage: number, hasActivity: boolean) => {
        if (!hasActivity) return 'text-slate-500 bg-slate-500/10 border-slate-500/20'
        if (percentage >= 90) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
        if (percentage >= 60) return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        return 'text-red-500 bg-red-500/10 border-red-500/20'
    }

    const getStatusLabel = (percentage: number, hasActivity: boolean) => {
        if (!hasActivity) return 'Sin Actividad'
        if (percentage >= 90) return 'Confiable'
        if (percentage >= 60) return 'Advertencia'
        return 'Crítico'
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="bg-[#0a0a0c]/80 border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
                <CardHeader className="flex flex-col gap-4 border-b border-white/5 px-4 py-5 sm:px-6 sm:gap-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 sm:p-2.5 shrink-0">
                                <Receipt className="w-5 h-5 text-amber-500" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle className="text-base sm:text-lg font-bold text-white tracking-tight truncate">Monitor de Vouchers</CardTitle>
                                    {globalPendientesCount > 0 && (
                                        <Badge className="bg-red-500/10 text-red-500 border-red-500/20 animate-pulse text-[9px] sm:text-[10px] h-5 px-1.5 whitespace-nowrap">
                                            {globalPendientesCount} PENDIENTES
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 line-clamp-1">Auditoría de cumplimiento por asesor en entrega de recibos.</p>
                            </div>
                        </div>

                        <div className="flex bg-slate-950/40 p-1 rounded-xl border border-white/5 w-full sm:w-auto self-start">
                            <Button 
                                variant={viewMode === 'advisors' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('advisors')}
                                className={cn(
                                    "flex-1 sm:flex-none text-[10px] h-8 px-4 font-black uppercase tracking-wider transition-all rounded-lg",
                                    viewMode === 'advisors' ? "bg-amber-500 text-black hover:bg-amber-400" : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                Asesores
                            </Button>
                            <Button 
                                variant={viewMode === 'loans' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('loans')}
                                className={cn(
                                    "flex-1 sm:flex-none text-[10px] h-8 px-4 font-black uppercase tracking-wider transition-all rounded-lg",
                                    viewMode === 'loans' ? "bg-amber-500 text-black hover:bg-amber-400" : "text-slate-500 hover:text-slate-300"
                                )}
                            >
                                Préstamos
                            </Button>
                        </div>
                    </div>
                    
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-2.5 bg-slate-950/30 rounded-xl border border-white/5 w-full">
                        {/* Buscador - Full width en móviles */}
                        <div className="relative w-full lg:w-72 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                            <Input 
                                placeholder={viewMode === 'advisors' ? "Buscar asesor..." : "Buscar cliente o ID..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 text-[12px] bg-slate-950/50 border-slate-800/80 text-slate-300 rounded-lg placeholder:text-slate-600 focus:border-amber-500/50 transition-colors shadow-inner w-full"
                            />
                        </div>
                        
                        {/* Controles de Fecha - Full width en móviles */}
                        <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto">
                            <Select value={dateRangeType} onValueChange={(val: DateRangeType) => setDateRangeType(val)}>
                                <SelectTrigger className="w-full sm:w-[180px] h-10 bg-slate-950/50 border-slate-800/80 text-slate-300 rounded-lg text-[10px] uppercase font-bold tracking-wider hover:border-slate-700 transition-all">
                                    <CalendarIcon className="w-3.5 h-3.5 mr-2 text-amber-500" />
                                    <SelectValue placeholder="Periodo" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                                    <SelectItem value="today">Hoy</SelectItem>
                                    <SelectItem value="7days">7 Días</SelectItem>
                                    <SelectItem value="month">Este Mes</SelectItem>
                                    <SelectItem value="all">Todo el Historial</SelectItem>
                                    <SelectItem value="custom">Personalizado</SelectItem>
                                </SelectContent>
                            </Select>

                            {dateRangeType === 'custom' && (
                                <div className="flex items-center gap-2 w-full sm:w-auto animate-in slide-in-from-top-1 duration-300">
                                    <Input 
                                        type="date" 
                                        value={fromDate} 
                                        onChange={(e) => setFromDate(e.target.value)}
                                        className="h-10 flex-1 sm:w-32 bg-slate-950/50 border-slate-800/80 text-slate-300 text-[10px] rounded-lg focus:border-amber-500/50 [&::-webkit-calendar-picker-indicator]:invert"
                                    />
                                    <Input 
                                        type="date" 
                                        value={toDate} 
                                        onChange={(e) => setToDate(e.target.value)}
                                        className="h-10 flex-1 sm:w-32 bg-slate-950/50 border-slate-800/80 text-slate-300 text-[10px] rounded-lg focus:border-amber-500/50 [&::-webkit-calendar-picker-indicator]:invert"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <div className="relative">
                                <Loader2 className="w-10 h-10 animate-spin text-amber-500/50" />
                                <div className="absolute inset-0 blur-xl bg-amber-500/10 animate-pulse" />
                            </div>
                            <p className="text-[11px] text-slate-500 uppercase tracking-[0.2em] font-black animate-pulse">Analizando Transacciones...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            {viewMode === 'advisors' ? (
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="hover:bg-transparent border-white/5">
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 px-3 sm:px-4">Asesor</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center hidden xs:table-cell">Cobros</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center hidden xs:table-cell">Enviados</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Pendientes</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center hidden sm:table-cell">Cumplimiento</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-right pr-4">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredStats.map((s, idx) => (
                                            <TableRow 
                                                key={idx} 
                                                onClick={() => setSelectedAdvisor(s)}
                                                className="border-white/5 hover:bg-white/5 transition-all cursor-pointer group"
                                            >
                                                <TableCell className="py-3 px-3 sm:px-4">
                                                    <div className="flex items-center gap-2 sm:gap-3">
                                                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-white/10 overflow-hidden bg-slate-800 flex items-center justify-center shrink-0 group-hover:border-amber-500/30 transition-colors">
                                                            <User className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-500 transition-colors" />
                                                        </div>
                                                        <span className="font-bold text-slate-200 text-[12px] sm:text-[13px] group-hover:text-amber-400 transition-colors truncate max-w-[100px] sm:max-w-none">{s.nombre}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-bold text-slate-400 text-sm hidden xs:table-cell">{s.total}</TableCell>
                                                <TableCell className="text-center font-bold text-emerald-400 text-sm hidden xs:table-cell">{s.compartidos}</TableCell>
                                                <TableCell className="text-center">
                                                    <span className={cn(
                                                        "font-black text-sm",
                                                        s.pendientesCount > 0 ? "text-red-400" : "text-emerald-500/50"
                                                    )}>
                                                        {s.pendientesCount}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center hidden sm:table-cell">
                                                    <div className="flex flex-col items-center gap-1.5 max-w-[100px] mx-auto">
                                                        <div className="flex justify-between w-full text-[9px] font-black font-mono">
                                                            <span className="text-slate-500">{s.percentage.toFixed(0)}%</span>
                                                        </div>
                                                        <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                                                            <div 
                                                                className={cn(
                                                                    "h-full transition-all duration-1000",
                                                                    s.percentage >= 90 ? "bg-emerald-500" : s.percentage >= 60 ? "bg-amber-500" : "bg-red-500"
                                                                )} 
                                                                style={{ width: `${s.percentage}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-2 sm:pr-6">
                                                    <Badge className={cn(
                                                        "font-black tracking-wider text-[8px] sm:text-[9px] uppercase border px-1.5 sm:px-2 py-0.5",
                                                        getStatusColor(s.percentage, s.hasActivity)
                                                    )}>
                                                        {getStatusLabel(s.percentage, s.hasActivity)}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="hover:bg-transparent border-white/5">
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 px-4">Cliente / ID</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Asesor</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Faltantes</TableHead>
                                            <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-right pr-4">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loansStats.map((l, idx) => (
                                            <TableRow 
                                                key={idx} 
                                                className="border-white/5 hover:bg-white/5 transition-all group"
                                            >
                                                <TableCell className="py-3 px-3 sm:px-4">
                                                    <div className="flex flex-col max-w-[120px] sm:max-w-none">
                                                        <span className="font-bold text-slate-200 text-[12px] sm:text-[13px] group-hover:text-amber-400 transition-colors uppercase truncate">{l.cliente}</span>
                                                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter truncate">ID: {l.prestamo_id.split('-')[0]}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden sm:table-cell">
                                                    <div className="flex items-center gap-2">
                                                        <User className="w-3 h-3 text-slate-600" />
                                                        <span className="text-xs text-slate-400 font-medium truncate">{l.asesor}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge className={cn(
                                                        "font-black tracking-wider text-[9px] sm:text-[11px] px-1.5 sm:px-2.5 py-0.5 border whitespace-nowrap",
                                                        l.count > 3 ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                    )}>
                                                        {l.count} <span className="hidden xs:inline">PENDIENTES</span><span className="xs:hidden">FALT.</span>
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-2 sm:pr-4">
                                                    <Button 
                                                        asChild
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 w-8 sm:w-auto sm:px-3 p-0 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 font-bold text-[10px] gap-2"
                                                    >
                                                        <a href={`/dashboard/prestamos/${l.prestamo_id}?tab=historial`}>
                                                            <span className="hidden sm:inline">AUDITAR</span>
                                                            <ExternalLink className="w-4 h-4 sm:w-3 sm:h-3" />
                                                        </a>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}

                            {(viewMode === 'advisors' ? filteredStats.length : loansStats.length) === 0 && (
                                <div className="h-40 flex flex-col items-center justify-center text-slate-500 gap-2">
                                    <Search className="w-8 h-8 opacity-10" />
                                    <p className="text-xs italic">No se encontraron resultados para tu búsqueda.</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Drill-down Modal */}
            <Dialog open={!!selectedAdvisor} onOpenChange={(open) => !open && setSelectedAdvisor(null)}>
                <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="p-6 border-b border-white/5">
                        <DialogTitle className="flex items-center gap-3 text-xl font-bold text-amber-500">
                            <Receipt className="w-6 h-6" />
                            Cobros de {selectedAdvisor?.nombre}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Pendientes de voucher para el periodo: {dateRangeType === 'custom' ? `${fromDate} / ${toDate}` : dateRangeType.toUpperCase()}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {selectedAdvisor?.pendientes?.length > 0 ? (
                            <div className="space-y-3">
                                {(() => {
                                    const groups = Object.values(
                                        selectedAdvisor.pendientes.reduce((acc: any, p: any) => {
                                            if (!acc[p.prestamo_id]) {
                                                acc[p.prestamo_id] = {
                                                    cliente: p.cliente,
                                                    telefono: p.telefono,
                                                    prestamo_id: p.prestamo_id,
                                                    cuotas: []
                                                }
                                            }
                                            acc[p.prestamo_id].cuotas.push(p.cuota)
                                            return acc
                                        }, {})
                                    );

                                    return groups.map((group: any, idx: number) => (
                                        <div key={idx} className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4 group hover:border-amber-500/30 transition-all">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="font-bold text-slate-100 text-[14px] truncate group-hover:text-white transition-colors capitalize">
                                                        {group.cliente.toLowerCase()}
                                                    </span>
                                                    <Badge variant="outline" className="bg-red-500/10 border-red-500/20 text-red-400 text-[9px] px-1.5 h-4 font-black">
                                                        {group.cuotas.length} {group.cuotas.length === 1 ? 'Cuota' : 'Cuotas'}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono tracking-tighter uppercase">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3 text-slate-600" />
                                                        ID: {group.prestamo_id.split('-')[0]}
                                                    </span>
                                                    {group.telefono && (
                                                        <span className="flex items-center gap-1 text-emerald-500/60">
                                                            <Phone className="w-3 h-3" />
                                                            {group.telefono}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {group.telefono && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => window.location.href = `tel:${group.telefono}`}
                                                        className="h-10 w-10 p-0 bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                                                    >
                                                        <Phone className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                <Button 
                                                    asChild
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-10 px-4 bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white font-bold text-[11px] gap-2 rounded-xl"
                                                >
                                                    <a href={`/dashboard/prestamos/${group.prestamo_id}?tab=historial`}>
                                                        Auditar
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                </Button>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                                <div className="p-4 bg-emerald-500/5 rounded-full border border-emerald-500/10">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-500/30" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-white font-bold text-lg">¡Impecable!</h3>
                                    <p className="text-slate-500 text-sm max-w-[280px]">Este asesor ha cumplido con la entrega de todos sus vouchers.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-white/5 bg-slate-900/50 flex justify-end">
                        <Button 
                            variant="ghost" 
                            onClick={() => setSelectedAdvisor(null)}
                            className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider"
                        >
                            Cerrar Monitor
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
