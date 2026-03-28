'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
    CalendarDays, 
    Download, 
    MapPin, 
    AlertTriangle, 
    ShieldAlert, 
    Clock, 
    Filter, 
    User, 
    Activity, 
    ExternalLink,
    Loader2 as Spinner
} from 'lucide-react'
import { format, startOfDay, endOfDay, subDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface AuditoriaVisitasPanelProps {
    userRol: string
    userId: string
    perfiles: any[]
}

interface AdvisorMetrics {
    id: string
    nombre: string
    foto?: string
    visitasExitosas: number
    alertasGps: number
    alertasFlash: number
    cancelaciones: number
    totalAlertas: number
}

export function AuditoriaVisitasPanel({ userRol, userId, perfiles }: AuditoriaVisitasPanelProps) {
    const [dateRange, setDateRange] = useState<'hoy' | 'ayer' | 'semana'>('hoy')
    const [loading, setLoading] = useState(true)
    const [metrics, setMetrics] = useState<AdvisorMetrics[]>([])
    const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorMetrics | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const supabase = createClient()

    // Cálculo centralizado de fechas
    const currentDates = useMemo(() => {
        const now = new Date();
        let start, end;
        if (dateRange === 'hoy') {
            start = startOfDay(now).toISOString()
            end = endOfDay(now).toISOString()
        } else if (dateRange === 'ayer') {
            const yesterday = subDays(now, 1)
            start = startOfDay(yesterday).toISOString()
            end = endOfDay(yesterday).toISOString()
        } else {
            start = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
            end = endOfDay(now).toISOString()
        }
        return { start, end };
    }, [dateRange])

    // Filtrar asesores bajo mando
    const myAdvisors = useMemo(() => {
        if (userRol === 'admin') return perfiles.filter(p => p.rol === 'asesor')
        return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === userId)
    }, [perfiles, userRol, userId])

    useEffect(() => {
        async function fetchAuditData() {
            setLoading(true)
            try {
                const { start: startDate, end: endDate } = currentDates;

                // 1. Fetch Visitas
                const { data: visitas, error: vError } = await supabase
                    .from('visitas_terreno')
                    .select('asesor_id, estado, cumple_minimo')
                    .gte('fecha_inicio', startDate)
                    .lte('fecha_inicio', endDate)

                if (vError) throw vError

                // 2. Fetch Alertas
                const { data: alertas, error: aError } = await supabase
                    .from('alertas')
                    .select('usuario_id, tipo_alerta')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate)
                    .in('tipo_alerta', ['GPS_DISTANCIA_EXCESIVA', 'VISITA_FLASH'])

                if (aError) throw aError

                // 3. Process Metrics
                const auditMap: Record<string, AdvisorMetrics> = {}

                myAdvisors.forEach(adv => {
                    auditMap[adv.id] = {
                        id: adv.id,
                        nombre: adv.nombre_completo || 'Asesor',
                        foto: adv.avatar_url,
                        visitasExitosas: 0,
                        alertasGps: 0,
                        alertasFlash: 0,
                        cancelaciones: 0,
                        totalAlertas: 0
                    }
                })

                // Count Visitas
                visitas?.forEach(v => {
                    if (!auditMap[v.asesor_id]) return
                    if (v.estado === 'finalizada' && v.cumple_minimo) {
                        auditMap[v.asesor_id].visitasExitosas++
                    } else if (v.estado === 'cancelada') {
                        auditMap[v.asesor_id].cancelaciones++
                    }
                })

                // Count Alertas
                alertas?.forEach(a => {
                    if (!auditMap[a.usuario_id]) return
                    if (a.tipo_alerta === 'GPS_DISTANCIA_EXCESIVA') {
                        auditMap[a.usuario_id].alertasGps++
                    } else if (a.tipo_alerta === 'VISITA_FLASH') {
                        auditMap[a.usuario_id].alertasFlash++
                    }
                })

                // Calculate Totals and Convert to Array
                const results = Object.values(auditMap).map(m => ({
                    ...m,
                    totalAlertas: m.alertasGps + m.alertasFlash
                }))

                // Sort by total alerts (desc)
                results.sort((a, b) => b.totalAlertas - a.totalAlertas)

                setMetrics(results)
            } catch (error) {
                console.error('Error fetching audit:', error)
                toast.error('Error al cargar datos de auditoría')
            } finally {
                setLoading(false)
            }
        }

        fetchAuditData()
    }, [dateRange, myAdvisors, supabase, currentDates])

    const exportToCSV = () => {
        const headers = ["Asesor", "Visitas Exitosas", "Alertas GPS", "Visitas Flash", "Cancelaciones", "Total Alertas"]
        const rows = metrics.map(m => [
            m.nombre,
            m.visitasExitosas,
            m.alertasGps,
            m.alertasFlash,
            m.cancelaciones,
            m.totalAlertas
        ])

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n")

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement("a")
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", `auditoria_visitas_${format(new Date(), 'yyyy-MM-dd')}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const getSemaphoreColor = (alerts: number) => {
        if (alerts >= 5) return 'text-red-500 bg-red-500/10 border-red-500/20'
        if (alerts >= 3) return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    }

    return (
        <>
            <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                    <div>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-red-500" />
                            Auditoría de Visitas en Terreno
                        </CardTitle>
                        <p className="text-xs text-slate-500 mt-1">Control de integridad, tiempos y geolocalización de asesores.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={dateRange} onValueChange={(val: any) => setDateRange(val)}>
                            <SelectTrigger className="w-[150px] bg-slate-950/50 border-slate-700 h-9 text-xs">
                                <CalendarDays className="w-3.5 h-3.5 mr-2" />
                                <SelectValue placeholder="Periodo" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="hoy">Hoy</SelectItem>
                                <SelectItem value="ayer">Ayer</SelectItem>
                                <SelectItem value="semana">Esta Semana</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={exportToCSV}
                            className="bg-slate-950/50 border-slate-700 h-9 text-xs gap-2"
                            disabled={loading || metrics.length === 0}
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Exportar</span>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4">
                            <Spinner className="w-8 h-8 animate-spin text-slate-400" />
                            <p className="text-sm font-medium">Generando reporte de integridad...</p>
                        </div>
                    ) : metrics.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                            <User className="w-12 h-12 mb-3 opacity-20" />
                            <p className="text-sm">No se encontraron asesores bajo su mando.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-white/5">
                                    <TableRow className="hover:bg-transparent border-white/5">
                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 px-4">Asesor</TableHead>
                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Exitosas</TableHead>
                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Alertas GPS</TableHead>
                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Visitas Flash</TableHead>
                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Reseteos</TableHead>
                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-right pr-4">Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {metrics.map((m) => (
                                        <TableRow 
                                            key={m.id} 
                                            onClick={() => {
                                                setSelectedAdvisor(m)
                                                setIsModalOpen(true)
                                            }}
                                            className="border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                        >
                                            <TableCell className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full border border-white/10 overflow-hidden bg-slate-800 flex items-center justify-center shrink-0">
                                                        {m.foto ? (
                                                            <img src={m.foto} alt={m.nombre} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-slate-400">{m.nombre.substring(0, 2).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <span className="font-bold text-slate-200 text-[13px] group-hover:text-blue-400 transition-colors">{m.nombre}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-bold text-emerald-400 text-sm">{m.visitasExitosas}</TableCell>
                                            <TableCell className="text-center font-bold text-red-400 text-sm">{m.alertasGps}</TableCell>
                                            <TableCell className="text-center font-bold text-amber-400 text-sm">{m.alertasFlash}</TableCell>
                                            <TableCell className="text-center font-medium text-slate-500 text-sm">{m.cancelaciones}</TableCell>
                                            <TableCell className="text-right pr-4">
                                                <Badge className={`font-black tracking-wider text-[9px] uppercase border px-2 py-0.5 ${getSemaphoreColor(m.totalAlertas)}`}>
                                                    {m.totalAlertas >= 5 ? 'Crítico' : m.totalAlertas >= 3 ? 'Advertencia' : 'Confiable'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <AdvisorVisitsModal 
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false)
                    setSelectedAdvisor(null)
                }}
                advisor={selectedAdvisor}
                startDate={currentDates.start}
                endDate={currentDates.end}
            />
        </>
    )
}

function AdvisorVisitsModal({ isOpen, onClose, advisor, startDate, endDate }: any) {
    const [visits, setVisits] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState<'todos' | 'ok' | 'flash' | 'reseteo'>('todos')
    const supabase = createClient()

    useEffect(() => {
        if (isOpen && advisor) {
            fetchDetails()
        }
    }, [isOpen, advisor])

    async function fetchDetails() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('visitas_terreno')
                .select(`
                    id,
                    fecha_inicio,
                    fecha_fin,
                    estado,
                    cumple_minimo,
                    prestamo_id,
                    prestamos:prestamo_id (
                        id,
                        clientes:cliente_id (
                            nombres
                        )
                    )
                `)
                .eq('asesor_id', advisor.id)
                .gte('fecha_inicio', startDate)
                .lte('fecha_inicio', endDate)
                .order('fecha_inicio', { ascending: false })

            if (error) throw error
            setVisits(data || [])
        } catch (error) {
            console.error('Error fetching detail:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredVisits = visits.filter(v => {
        const isOk = v.estado === 'finalizada' && v.cumple_minimo
        const isFlash = v.estado === 'finalizada' && !v.cumple_minimo
        const isReseteo = v.estado === 'cancelada'

        if (filter === 'todos') return true
        if (filter === 'ok') return isOk
        if (filter === 'flash') return isFlash
        if (filter === 'reseteo') return isReseteo
        return true
    })

    return (
        <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                <DialogHeader className="p-6 border-b border-white/5">
                    <DialogTitle className="flex items-center gap-3 text-xl font-bold text-blue-400">
                        <User className="w-6 h-6" />
                        Visitas de {advisor?.nombre}
                    </DialogTitle>
                    <p className="text-sm text-slate-500">Historial detallado para el periodo seleccionado.</p>
                </DialogHeader>

                <div className="flex items-center gap-1 p-4 bg-slate-900/30 border-b border-white/5 overflow-x-auto no-scrollbar">
                    {(['todos', 'ok', 'flash', 'reseteo'] as const).map((f) => (
                        <Button
                            key={f}
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilter(f)}
                            className={cn(
                                "text-[10px] uppercase font-black tracking-wider h-8 rounded-md px-3 shrink-0",
                                filter === f ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                            )}
                        >
                            {f === 'todos' ? 'Ver Todos' : f === 'ok' ? 'Solo OK' : f === 'flash' ? 'Solo Flash' : 'Solo Reseteos'}
                        </Button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Spinner className="w-8 h-8 animate-spin text-blue-500" />
                            <p className="text-sm text-slate-500">Recuperando expedientes...</p>
                        </div>
                    ) : filteredVisits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-600 italic">
                            <Clock className="w-12 h-12 mb-3 opacity-10" />
                            <p>No hay registros con este filtro.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredVisits.map((v) => {
                                const cliente = Array.isArray(v.prestamos?.clientes) ? v.prestamos.clientes[0] : v.prestamos?.clientes;
                                const duration = v.fecha_fin ? Math.floor((new Date(v.fecha_fin || '').getTime() - new Date(v.fecha_inicio).getTime()) / 60000) : 0;
                                
                                return (
                                    <div key={v.id} className="bg-slate-900/40 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-4 group hover:border-blue-500/30 hover:bg-slate-900/60 transition-all">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge className={cn(
                                                    "text-[8px] font-black uppercase tracking-tighter px-1.5 py-0 border-0",
                                                    v.estado === 'cancelada' ? 'bg-red-500/10 text-red-500' :
                                                    v.cumple_minimo ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                                                )}>
                                                    {v.estado === 'cancelada' ? 'RESETEO' : v.cumple_minimo ? 'OK' : 'FLASH'}
                                                </Badge>
                                                <span className="text-xs font-bold text-slate-200 truncate group-hover:text-white">{cliente?.nombres || 'Cliente no identificado'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {format(new Date(v.fecha_inicio), 'HH:mm dd/MM')}
                                                </span>
                                                {v.estado !== 'cancelada' && (
                                                    <span className="flex items-center gap-1">
                                                        <Activity className="w-3 h-3" />
                                                        {duration} min
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="h-8 bg-blue-600/10 border-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-[10px] font-bold gap-2 rounded-lg"
                                        >
                                            <a href={`/dashboard/prestamos/${v.prestamo_id}?tab=visitas`}>
                                                Auditar
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function Loader2({ className }: { className?: string }) {
    return <Clock className={`${className} animate-spin text-slate-400`} />
}
