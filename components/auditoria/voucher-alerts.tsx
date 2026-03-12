"use client"

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, AlertTriangle, AlertCircle, Receipt, Loader2, ArrowUpRight, TrendingDown, Calendar as CalendarIcon, Filter, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/utils/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import { cn } from '@/lib/utils'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ExternalLink, User, History, Phone } from 'lucide-react'

type DateRangeType = 'today' | '7days' | 'month' | 'custom'

export function VoucherAlerts() {
    const [stats, setStats] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [dateRangeType, setDateRangeType] = useState<DateRangeType>('month')
    const [fromDate, setFromDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
    const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
    const [selectedAdvisor, setSelectedAdvisor] = useState<any>(null)

    const fetchVouchersStats = useCallback(async () => {
        setLoading(true)

        try {
            // Construir params de fecha
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
            }

            const url = new URL('/api/auditoria/vouchers', window.location.origin)
            if (startIso) url.searchParams.set('from', startIso)
            if (endIso) url.searchParams.set('to', endIso) // Changed from `if (startIso) url.searchParams.set('to', endIso || '')` to `if (endIso) url.searchParams.set('to', endIso)`

            const response = await fetch(url.toString())
            if (!response.ok) throw new Error('Error al cargar estadísticas')
            
            const data = await response.json()
            
            // Calcular % tras recibir la data consolidada del backend
            const finalStats = data.map((s: any) => ({
                ...s,
                percentage: s.total > 0 ? (s.compartidos / s.total) * 100 : 0,
                hasActivity: s.total > 0
            })).sort((a: any, b: any) => {
                // Ordenar: primero los que tienen actividad y menor porcentaje, luego los sin actividad
                if (a.hasActivity && !b.hasActivity) return -1
                if (!a.hasActivity && b.hasActivity) return 1
                return a.percentage - b.percentage
            })

            setStats(finalStats)
        } catch (error) {
            console.error("Error fetching voucher stats:", error)
        } finally {
            setLoading(false)
        }
    }, [dateRangeType, fromDate, toDate])

    useEffect(() => {
        fetchVouchersStats()
    }, [fetchVouchersStats])

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header and Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-lg shadow-amber-500/5">
                        <Receipt className="w-6 h-6 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Monitor de Entrega de Recibos</h2>
                        <p className="text-sm text-slate-400">Auditoría de cumplimiento por asesor.</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 bg-slate-900/40 p-2 rounded-2xl border border-slate-800/50 backdrop-blur-md w-fit max-w-full">
                    <div className="flex items-center gap-2 px-3 py-1.5 sm:border-r border-slate-800/50 shrink-0">
                        <Filter className="w-4 h-4 text-slate-500" />
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filtrar por periodo</span>
                    </div>

                    <Select value={dateRangeType} onValueChange={(val: DateRangeType) => setDateRangeType(val)}>
                        <SelectTrigger className="w-full sm:w-[180px] h-10 bg-slate-950/50 border-slate-700/50 text-slate-300 rounded-xl text-xs">
                            <CalendarIcon className="w-3.5 h-3.5 mr-2 text-amber-500" />
                            <SelectValue placeholder="Periodo" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                            <SelectItem value="today">Hoy ({format(new Date(), 'dd MMM')})</SelectItem>
                            <SelectItem value="7days">Últimos 7 días</SelectItem>
                            <SelectItem value="month">Este Mes</SelectItem>
                            <SelectItem value="custom">Rango Personalizado</SelectItem>
                        </SelectContent>
                    </Select>

                    {dateRangeType === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2 animate-in slide-in-from-left-2 duration-300 w-full sm:w-auto">
                            <Input 
                                type="date" 
                                value={fromDate} 
                                onChange={(e) => setFromDate(e.target.value)}
                                className="h-10 flex-1 sm:w-full sm:max-w-[140px] bg-slate-950/50 border-slate-700/50 text-slate-300 text-xs rounded-xl"
                            />
                            <span className="text-slate-600">a</span>
                            <Input 
                                type="date" 
                                value={toDate} 
                                onChange={(e) => setToDate(e.target.value)}
                                className="h-10 flex-1 sm:w-full sm:max-w-[140px] bg-slate-950/50 border-slate-700/50 text-slate-300 text-xs rounded-xl"
                            />
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 bg-slate-900/20 rounded-3xl border border-slate-800/50">
                    <div className="relative">
                        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                        <div className="absolute inset-0 blur-lg bg-amber-500/20 animate-pulse" />
                    </div>
                    <p className="text-slate-400 font-medium animate-pulse">Analizando registros de pagos...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {stats.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 bg-slate-900/40 rounded-3xl border border-slate-800/50 border-dashed">
                            <AlertCircle className="w-12 h-12 text-slate-700 mb-4" />
                            <p className="text-slate-500 font-medium text-lg">No se encontraron cobros en este periodo.</p>
                            <p className="text-slate-600 text-sm mt-1">Intenta seleccionar otro rango de fechas.</p>
                        </div>
                    )}
                    {stats.map((s, idx) => {
                        const statusColor = !s.hasActivity ? 'slate' : s.percentage >= 80 ? 'emerald' : s.percentage >= 50 ? 'amber' : 'rose'
                        
                        return (
                            <Card 
                                key={idx} 
                                onClick={() => setSelectedAdvisor(s)}
                                className={cn(
                                    "relative overflow-hidden group transition-all duration-500 hover:scale-[1.02] border-slate-800/50 cursor-pointer",
                                    "bg-gradient-to-br from-slate-900/80 to-slate-950/90 backdrop-blur-xl",
                                    statusColor === 'rose' && "hover:border-rose-500/30",
                                    statusColor === 'amber' && "hover:border-amber-500/30",
                                    statusColor === 'emerald' && "hover:border-emerald-500/30",
                                    statusColor === 'slate' && "hover:border-slate-700",
                                )}
                            >
                                {/* Glow effect behind icons */}
                                <div className={cn(
                                    "absolute -top-12 -right-12 w-32 h-32 blur-[60px] transition-opacity duration-700 opacity-20 group-hover:opacity-40",
                                    statusColor === 'emerald' && "bg-emerald-500",
                                    statusColor === 'amber' && "bg-amber-500",
                                    statusColor === 'rose' && "bg-rose-500",
                                    statusColor === 'slate' && "bg-slate-500"
                                )} />

                                <CardHeader className="pb-3 border-b border-white/5 relative z-10">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                            {s.nombre}
                                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                                        </CardTitle>
                                        <Badge 
                                            variant="outline" 
                                            className={cn(
                                                "text-[10px] px-2 py-0.5 rounded-full border shadow-sm",
                                                statusColor === 'rose' && "bg-rose-500/10 text-rose-400 border-rose-500/30",
                                                statusColor === 'amber' && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                                                statusColor === 'emerald' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                                                statusColor === 'slate' && "bg-slate-800/50 text-slate-500 border-slate-700"
                                            )}
                                        >
                                            {statusColor === 'rose' ? 'Riesgo Alto' : 
                                             statusColor === 'amber' ? 'Aviso' : 
                                             statusColor === 'emerald' ? 'Cumplimiento' : 'Sin Actividad'}
                                        </Badge>
                                    </div>
                                </CardHeader>

                                <CardContent className="pt-6 relative z-10">
                                    <div className="space-y-5">
                                        <div className="flex items-end justify-between">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={cn(
                                                        "text-4xl font-black font-mono tracking-tighter transition-colors duration-500",
                                                        statusColor === 'rose' && "text-rose-400",
                                                        statusColor === 'amber' && "text-amber-400",
                                                        statusColor === 'emerald' && "text-emerald-400",
                                                        statusColor === 'slate' && "text-slate-600"
                                                    )}>
                                                        {s.percentage.toFixed(0)}%
                                                    </span>
                                                    {s.hasActivity && (
                                                        statusColor === 'emerald' ? (
                                                            <ArrowUpRight className="w-5 h-5 text-emerald-500 animate-in fade-in zoom-in duration-700" />
                                                        ) : (
                                                            <TrendingDown className={cn(
                                                                "w-5 h-5 animate-in fade-in zoom-in duration-700",
                                                                statusColor === 'rose' ? "text-rose-500" : "text-amber-500"
                                                            )} />
                                                        )
                                                    )}
                                                </div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Tasa de Envío</span>
                                            </div>

                                            <div className="text-right flex flex-col items-end">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="flex -space-x-2">
                                                        {s.hasActivity ? [...Array(Math.min(3, s.total))].map((_, i) => (
                                                            <div key={i} className="w-5 h-5 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[8px] text-slate-400">
                                                                {i + 1}
                                                            </div>
                                                        )) : (
                                                            <div className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                                <Clock className="w-2.5 h-2.5 text-slate-700" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-bold text-white leading-none">
                                                        {s.compartidos} <span className="text-slate-500 font-normal">/ {s.total}</span>
                                                    </span>
                                                </div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Cobros Auditables</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="h-2 w-full bg-slate-800/50 overflow-hidden rounded-full border border-white/5">
                                                {s.hasActivity ? (
                                                    <div 
                                                        className={cn(
                                                            "h-full transition-all duration-1000 ease-out flex items-center justify-end px-1 shadow-[0_0_15px_rgba(0,0,0,0.5)]",
                                                            statusColor === 'emerald' && "bg-gradient-to-r from-emerald-600 to-emerald-400",
                                                            statusColor === 'amber' && "bg-gradient-to-r from-amber-600 to-amber-400",
                                                            statusColor === 'rose' && "bg-gradient-to-r from-rose-600 to-rose-400"
                                                        )} 
                                                        style={{ width: `${s.percentage}%` }}
                                                    >
                                                        {s.percentage > 15 && <div className="w-1 h-1 rounded-full bg-white/40 blur-[1px]" />}
                                                    </div>
                                                ) : (
                                                    <div className="h-full w-full bg-slate-900/50" />
                                                )}
                                            </div>

                                            {s.hasActivity && s.percentage < 50 && (
                                                <div className="flex items-start gap-2 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 animate-in fade-in slide-in-from-top-1 duration-500 mt-2">
                                                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                                    <p className="text-[11px] leading-relaxed text-rose-300">
                                                        Alerta: El asesor está registrando cobros pero retiene la información. <span className="font-bold text-rose-200">Riesgo de falta ética detectado.</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                                
                                {/* Status Icon Overlay */}
                                <div className={cn(
                                    "absolute top-4 right-4 p-2 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 scale-[2.5] pointer-events-none",
                                    statusColor === 'emerald' && "text-emerald-500",
                                    statusColor === 'amber' && "text-amber-500",
                                    statusColor === 'rose' && "text-rose-500",
                                    statusColor === 'slate' && "text-slate-500"
                                )}>
                                    {statusColor === 'emerald' ? <CheckCircle2 /> : 
                                     statusColor === 'amber' ? <AlertTriangle /> : 
                                     statusColor === 'rose' ? <AlertCircle /> : <Clock />}
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Drill-down Modal */}
            <Dialog open={!!selectedAdvisor} onOpenChange={(open) => !open && setSelectedAdvisor(null)}>
                <DialogContent className="bg-slate-950 border-slate-800 text-slate-300 max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <User className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold text-white">Detalle de Cobros: {selectedAdvisor?.nombre}</DialogTitle>
                                <DialogDescription className="text-slate-500">
                                    Pagos registrados que aún no cuentan con respaldo de voucher.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="mt-6">
                        {selectedAdvisor?.pendientes?.length > 0 ? (
                            <div className="space-y-3">
                                {/* Vista Desktop: Tabla */}
                                <div className="hidden md:block rounded-xl border border-slate-800 overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">Cliente</th>
                                                <th className="px-4 py-3 font-semibold text-center">Cuotas</th>
                                                <th className="px-4 py-3 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
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
                                                    <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                                        <td className="px-4 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-white">{group.cliente}</span>
                                                                <span className="text-[10px] text-slate-500 font-mono">ID: {group.prestamo_id.split('-')[0]}...</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-lg font-bold text-rose-500 leading-none">{group.cuotas.length}</span>
                                                                <span className="text-[9px] uppercase text-slate-500 font-medium tracking-tighter">pendientes</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {group.telefono && (
                                                                    <Button 
                                                                        variant="outline" size="sm" 
                                                                        className="h-9 w-9 p-0 bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 group/phone"
                                                                        onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${group.telefono}`; }}
                                                                    >
                                                                        <Phone className="w-4 h-4 group-hover/phone:scale-110 transition-transform" />
                                                                    </Button>
                                                                )}
                                                                <Button 
                                                                    variant="outline" size="sm" 
                                                                    className="h-9 w-9 p-0 bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/20 text-blue-400 group/link"
                                                                    onClick={(e) => { e.stopPropagation(); window.location.href = `/dashboard/prestamos/${group.prestamo_id}`; }}
                                                                >
                                                                    <ExternalLink className="w-4 h-4 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Vista Móvil: Tarjetas */}
                                <div className="md:hidden space-y-3">
                                    {Object.values(
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
                                    ).map((group: any, idx: number) => (
                                        <div key={idx} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-white truncate text-sm">{group.cliente}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className="bg-rose-500/10 border-rose-500/20 text-rose-400 text-[10px] px-1.5 h-5">
                                                        {group.cuotas.length} {group.cuotas.length === 1 ? 'Cuota' : 'Cuotas'}
                                                    </Badge>
                                                    <span className="text-[10px] text-slate-500 font-mono">ID: {group.prestamo_id.split('-')[0]}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {group.telefono && (
                                                    <Button 
                                                        variant="outline" size="sm" 
                                                        className="h-10 w-10 p-0 bg-emerald-500/5 border-emerald-500/20 text-emerald-400 active:bg-emerald-500/20"
                                                        onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${group.telefono}`; }}
                                                    >
                                                        <Phone className="w-4 h-4" />
                                                    </Button>
                                                )}
                                                <Button 
                                                    variant="outline" size="sm" 
                                                    className="h-10 w-10 p-0 bg-blue-500/5 border-blue-500/20 text-blue-400 active:bg-blue-500/20"
                                                    onClick={(e) => { e.stopPropagation(); window.location.href = `/dashboard/prestamos/${group.prestamo_id}`; }}
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-900/30 rounded-2xl border border-slate-800/50">
                                <div className="p-3 bg-emerald-500/10 rounded-full mb-4">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h3 className="text-white font-bold text-lg">¡Todo al día!</h3>
                                <p className="text-slate-500 text-sm max-w-xs mt-1">
                                    Este asesor ha compartido todos los vouchers correspondientes a sus cobros auditables.
                                </p>
                            </div>
                        )}
                        
                        <div className="flex justify-end pt-4">
                            <Button 
                                variant="outline" 
                                className="bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                onClick={() => setSelectedAdvisor(null)}
                            >
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
