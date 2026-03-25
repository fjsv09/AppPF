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
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 bg-slate-900/40 p-2 rounded-2xl border border-slate-800/50 backdrop-blur-md w-full max-w-full lg:w-fit">
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {stats.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/50 border-dashed">
                            <AlertCircle className="w-10 h-10 text-slate-700 mb-3" />
                            <p className="text-slate-500 font-medium">No se encontraron cobros en este periodo.</p>
                        </div>
                    )}
                    {stats.map((s, idx) => {
                        const statusColor = !s.hasActivity ? 'slate' : s.percentage >= 80 ? 'emerald' : s.percentage >= 50 ? 'amber' : 'rose'
                        
                        return (
                            <div 
                                key={idx} 
                                onClick={() => setSelectedAdvisor(s)}
                                className={cn(
                                    "relative overflow-hidden group transition-all duration-300 hover:scale-[1.01] border border-slate-800/50 cursor-pointer rounded-2xl p-4",
                                    "bg-[#0a0a0a]/60 backdrop-blur-xl",
                                    statusColor === 'rose' && "hover:border-rose-500/30",
                                    statusColor === 'amber' && "hover:border-amber-500/30",
                                    statusColor === 'emerald' && "hover:border-emerald-500/30",
                                    statusColor === 'slate' && "hover:border-slate-800",
                                )}
                            >
                                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full shrink-0",
                                            statusColor === 'emerald' && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
                                            statusColor === 'amber' && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
                                            statusColor === 'rose' && "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
                                            statusColor === 'slate' && "bg-slate-700"
                                        )} />
                                        <span className="text-sm font-bold text-slate-100 truncate group-hover:text-white transition-colors">{s.nombre}</span>
                                    </div>
                                    <Badge 
                                        variant="outline" 
                                        className={cn(
                                            "text-[10px] px-2 py-0 rounded-md border font-mono",
                                            statusColor === 'rose' && "bg-rose-500/10 text-rose-400 border-rose-500/20",
                                            statusColor === 'amber' && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                                            statusColor === 'emerald' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                                            statusColor === 'slate' && "bg-slate-800/50 text-slate-500 border-slate-700"
                                        )}
                                    >
                                        {s.percentage.toFixed(0)}%
                                    </Badge>
                                </div>

                                <div className="flex items-end justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                            <span>Cumplimiento</span>
                                            <span className="text-slate-400 font-mono">{s.compartidos} <span className="text-slate-600">/</span> {s.total}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-950 overflow-hidden rounded-full border border-white/5">
                                            {s.hasActivity ? (
                                                <div 
                                                    className={cn(
                                                        "h-full transition-all duration-1000",
                                                        statusColor === 'emerald' && "bg-emerald-500",
                                                        statusColor === 'amber' && "bg-amber-500",
                                                        statusColor === 'rose' && "bg-rose-500"
                                                    )} 
                                                    style={{ width: `${s.percentage}%` }}
                                                />
                                            ) : (
                                                <div className="h-full w-full bg-slate-900/50" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-center gap-1">
                                        <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800/50 group-hover:border-slate-700 transition-colors">
                                            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                                        </div>
                                    </div>
                                </div>
                                
                                {s.hasActivity && s.percentage < 50 && (
                                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                        <span className="text-[9px] text-rose-400 font-medium">Bajo desempeño en entrega</span>
                                    </div>
                                )}
                            </div>
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
                                                                    onClick={(e) => { e.stopPropagation(); window.location.href = `/dashboard/prestamos/${group.prestamo_id}?tab=historial`; }}
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
                                                    onClick={(e) => { e.stopPropagation(); window.location.href = `/dashboard/prestamos/${group.prestamo_id}?tab=historial`; }}
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
