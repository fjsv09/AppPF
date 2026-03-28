'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarDays, Download, MapPin, AlertTriangle, ShieldAlert, Clock, Filter, User } from 'lucide-react'
import { format, startOfDay, endOfDay, subDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

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
    const supabase = createClient()

    // Filtrar asesores bajo mando
    const myAdvisors = useMemo(() => {
        if (userRol === 'admin') return perfiles.filter(p => p.rol === 'asesor')
        return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === userId)
    }, [perfiles, userRol, userId])

    useEffect(() => {
        async function fetchAuditData() {
            setLoading(true)
            try {
                let startDate, endDate;
                const now = new Date();

                if (dateRange === 'hoy') {
                    startDate = startOfDay(now).toISOString()
                    endDate = endOfDay(now).toISOString()
                } else if (dateRange === 'ayer') {
                    const yesterday = subDays(now, 1)
                    startDate = startOfDay(yesterday).toISOString()
                    endDate = endOfDay(yesterday).toISOString()
                } else {
                    startDate = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
                    endDate = endOfDay(now).toISOString()
                }

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
    }, [dateRange, myAdvisors, supabase])

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
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
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
                                    <TableRow key={m.id} className="border-white/5 hover:bg-white/5 transition-colors">
                                        <TableCell className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full border border-white/10 overflow-hidden bg-slate-800 flex items-center justify-center shrink-0">
                                                    {m.foto ? (
                                                        <img src={m.foto} alt={m.nombre} className="h-full w-full object-cover" />
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-400">{m.nombre.substring(0, 2).toUpperCase()}</span>
                                                    )}
                                                </div>
                                                <span className="font-bold text-slate-200 text-[13px]">{m.nombre}</span>
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
    )
}

function Loader2({ className }: { className?: string }) {
    return <Clock className={`${className} animate-spin`} />
}
