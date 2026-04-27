'use client'

import { createClient } from '@/utils/supabase/client'
import { format, subDays, startOfDay, endOfDay, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ScrollText, User, Activity, Clock, ShieldCheck, Receipt, Sparkles, Loader2, Filter, ChevronRight, MapPin, Download, Search, Table as TableIcon } from 'lucide-react'
import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VoucherAlerts } from '@/components/auditoria/voucher-alerts'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, useTransition } from 'react'
import { cn, formatDatePeru } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'
import { AuditoriaVisitasPanel } from '@/components/prestamos/auditoria-visitas-panel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuditoriaPage() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [generating, setGenerating] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [user, setUser] = useState<any>(null)
    const [perfil, setPerfil] = useState<any>(null)
    const [auditoria, setAuditoria] = useState<any[]>([])
    const [allProfiles, setAllProfiles] = useState<any[]>([])
    const [allAdvisors, setAllAdvisors] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filterUser, setFilterUser] = useState<string>('all')
    const [filterTable, setFilterTable] = useState<string>('all')
    const [dateRangeType, setDateRangeType] = useState<string>('all')
    const [fromDate, setFromDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
    const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
    
    // Pagination State
    const [totalRecords, setTotalRecords] = useState(0)
    const ITEMS_PER_PAGE = 10
    const currentPage = Number(searchParams.get('page')) || 1

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('auditoria')
                .select('*', { count: 'exact' })

            if (filterUser !== 'all') {
                query = query.eq('usuario_id', filterUser)
            }

            if (filterTable !== 'all') {
                query = query.eq('tabla_afectada', filterTable)
            }

            // Filtrado de fechas
            const now = new Date()
            let startIso: string | null = null
            let endIso: string | null = null

            if (dateRangeType === 'today') {
                startIso = startOfDay(now).toISOString()
                endIso = endOfDay(now).toISOString()
            } else if (dateRangeType === 'yesterday') {
                const yesterday = subDays(now, 1)
                startIso = startOfDay(yesterday).toISOString()
                endIso = endOfDay(yesterday).toISOString()
            } else if (dateRangeType === 'week') {
                startIso = startOfDay(subDays(now, 7)).toISOString()
                endIso = endOfDay(now).toISOString()
            } else if (dateRangeType === 'month') {
                startIso = startOfDay(startOfMonth(now)).toISOString()
                endIso = endOfDay(now).toISOString()
            } else if (dateRangeType === 'custom' && fromDate && toDate) {
                startIso = startOfDay(new Date(fromDate + 'T00:00:00')).toISOString()
                endIso = endOfDay(new Date(toDate + 'T23:59:59')).toISOString()
            }

            if (startIso) query = query.gte('created_at', startIso)
            if (endIso) query = query.lte('created_at', endIso)

            const { data: logs, count, error: logsError } = await query
                .order('created_at', { ascending: false })
                .range((currentPage - 1) * ITEMS_PER_PAGE, (currentPage * ITEMS_PER_PAGE) - 1)
            
            setTotalRecords(count || 0)
            
            if (logsError) throw logsError

            if (logs && logs.length > 0) {
                const userIds = Array.from(new Set(logs.map(l => l.usuario_id).filter(id => id)))
                
                if (userIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('perfiles')
                        .select('id, nombre_completo')
                        .in('id', userIds)
                    
                    const profileMap = (profiles || []).reduce((acc: any, p) => {
                        acc[p.id] = p.nombre_completo
                        return acc
                    }, {})

                    const enrichedLogs = logs.map(l => ({
                        ...l,
                        perfiles: { nombre: profileMap[l.usuario_id] }
                    }))
                    setAuditoria(enrichedLogs)
                } else {
                    setAuditoria(logs)
                }
            } else {
                setAuditoria([])
            }
        } catch (error) {
            console.error('Error fetching logs:', error)
            toast.error('Error al cargar historial')
        } finally {
            setLoading(false)
        }
    }, [supabase, filterUser, filterTable, dateRangeType, fromDate, toDate, currentPage])

    useEffect(() => {
        async function loadInitialData() {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }
            setUser(user)

            const { data: perfilData } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', user.id)
                .single()
            setPerfil(perfilData)

            if (perfilData?.rol === 'admin' || perfilData?.rol === 'supervisor') {
                let profilesQuery = supabase.from('perfiles').select('id, nombre_completo, rol')
                if (perfilData?.rol === 'supervisor') {
                    profilesQuery = profilesQuery.eq('supervisor_id', user.id)
                }
                const { data: profiles } = await profilesQuery
                setAllAdvisors(profiles || [])
                setAllProfiles(profiles?.filter(p => p.rol === 'asesor') || [])
            }
            setLoading(false)
        }
        loadInitialData()
    }, [router, supabase])

    useEffect(() => {
        if (perfil?.rol === 'admin' || perfil?.rol === 'supervisor') {
            fetchLogs()
        }
    }, [fetchLogs, perfil])

    // Auto-refresh al volver al foreground (PWA iOS fix)
    useEffect(() => {
        let lastFetch = Date.now()
        const MIN_INTERVAL = 30_000

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastFetch > MIN_INTERVAL) {
                lastFetch = Date.now()
                if (perfil?.rol === 'admin' || perfil?.rol === 'supervisor') {
                    fetchLogs()
                }
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [fetchLogs, perfil])

    const handleGenerarTareas = async () => {
        setGenerating(true)
        try {
            const res = await fetch('/api/auditoria/generar-tareas', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Error generando tareas')
            
            toast.success(data.message)
            fetchLogs()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setGenerating(false)
        }
    }

    const tabFromUrl = searchParams.get('tab')

    const handleTabChange = useCallback((value: string) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('tab', value)
            params.delete('page') // Reset page on tab change
            router.replace(`?${params.toString()}`, { scroll: false })
        })
    }, [searchParams, router])

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', String(page))
        router.push(`?${params.toString()}`, { scroll: false })
    }

    const getTableBadgeColor = (table: string) => {
        switch (table?.toLowerCase()) {
            case 'pagos': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            case 'prestamos': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
            case 'cronogramas': 
            case 'cronograma_cuotas': return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            case 'tareas_evidencia': return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
            case 'gestiones': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
            default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
        }
    }

    if (!perfil && loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500/50" />
        </div>
    )

    const userRol = perfil?.rol || 'asesor'

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Auditoría y Control</h1>
                            <p className="page-subtitle">Supervisa las acciones críticas y cumplimiento del equipo.</p>
                        </div>
                    </div>
                </div>

                {userRol === 'admin' && (
                    <Button 
                        onClick={handleGenerarTareas}
                        disabled={generating}
                        className="btn-action bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20 gap-2"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Generar Tareas Dirigidas
                    </Button>
                )}
            </div>

            <div className="relative">
                <Tabs value={tabFromUrl || (userRol === 'admin' ? "historial" : "vouchers")} onValueChange={handleTabChange} className="w-full">
                    <div className="overflow-x-auto pb-2 mb-6 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                        <TabsList className="bg-[#0a0a0c] border border-white/5 p-1 flex w-fit min-w-full sm:min-w-0 items-center gap-1 h-12 rounded-xl backdrop-blur-xl shadow-2xl shadow-black/50">
                            {userRol === 'admin' && (
                                <TabsTrigger 
                                    value="historial" 
                                    className="flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-tight transition-all rounded-lg data-[state=active]:bg-[#161b22] data-[state=active]:text-blue-400 text-slate-500 data-[state=active]:shadow-inner data-[state=active]:shadow-white/5 border border-transparent data-[state=active]:border-white/5"
                                >
                                    <Activity className="w-4 h-4" />
                                    Historial General
                                </TabsTrigger>
                            )}
                            <TabsTrigger 
                                value="vouchers" 
                                className="flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-tight transition-all rounded-lg data-[state=active]:bg-[#161b22] data-[state=active]:text-white text-slate-500 data-[state=active]:shadow-inner data-[state=active]:shadow-white/5 border border-transparent data-[state=active]:border-white/5"
                            >
                                <Receipt className="w-4 h-4" />
                                Control de Vouchers
                            </TabsTrigger>
                            {(userRol === 'admin' || userRol === 'supervisor') && (
                                <TabsTrigger 
                                    value="visitas" 
                                    className="flex items-center gap-2.5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-tight transition-all rounded-lg data-[state=active]:bg-[#161b22] data-[state=active]:text-white text-slate-500 data-[state=active]:shadow-inner data-[state=active]:shadow-white/5 border border-transparent data-[state=active]:border-white/5"
                                >
                                    <MapPin className="w-4 h-4" />
                                    Auditoría de Visitas
                                </TabsTrigger>
                            )}
                        </TabsList>
                    </div>

                    {userRol === 'admin' && (
                        <TabsContent value="historial" className="mt-0 outline-none">
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
                                <CardHeader className="border-b border-white/5 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                            <Activity className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold uppercase tracking-tight">Registro de Auditoría</CardTitle>
                                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-0.5">Control total de acciones del sistema</p>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="p-0">
                                    {/* Dedicated Filter Bar - Standardized with Loans Panel */}
                                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button 
                                                onClick={fetchLogs}
                                                disabled={loading}
                                                className="h-10 w-full sm:w-auto min-w-[120px] bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 transition-all px-4"
                                            >
                                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                                Actualizar
                                            </Button>

                                            <Select value={filterUser} onValueChange={setFilterUser}>
                                                <SelectTrigger className="h-10 w-full sm:w-auto min-w-[160px] bg-slate-950/50 border-white/5 text-[10px] font-black uppercase text-slate-400 rounded-xl px-3">
                                                    <div className="flex items-center gap-2">
                                                        <User size={12} className="text-blue-500/50 shrink-0" />
                                                        <SelectValue placeholder="Responsable" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-white/10 text-slate-300">
                                                    <SelectItem value="all">TODOS LOS USUARIOS</SelectItem>
                                                    {allAdvisors.map(a => (
                                                        <SelectItem key={a.id} value={a.id}>{a.nombre_completo?.toUpperCase()}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Select value={filterTable} onValueChange={setFilterTable}>
                                                <SelectTrigger className="h-10 w-full sm:w-auto min-w-[150px] bg-slate-950/50 border-white/5 text-[10px] font-black uppercase text-slate-400 rounded-xl px-3">
                                                    <div className="flex items-center gap-2">
                                                        <ScrollText size={12} className="text-purple-500/50 shrink-0" />
                                                        <SelectValue placeholder="Módulo" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-white/10 text-slate-300">
                                                    <SelectItem value="all">TODOS LOS MÓDULOS</SelectItem>
                                                    <SelectItem value="pagos">PAGOS</SelectItem>
                                                    <SelectItem value="prestamos">PRÉSTAMOS</SelectItem>
                                                    <SelectItem value="cronograma_cuotas">CRONOGRAMAS</SelectItem>
                                                    <SelectItem value="tareas_evidencia">TAREAS DE EVIDENCIA</SelectItem>
                                                    <SelectItem value="gestiones">GESTIONES</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            <Select value={dateRangeType} onValueChange={setDateRangeType}>
                                                <SelectTrigger className="h-10 w-full sm:w-auto min-w-[140px] bg-slate-950/50 border-white/5 text-[10px] font-black uppercase text-slate-400 rounded-xl px-3">
                                                    <div className="flex items-center gap-2">
                                                        <Clock size={12} className="text-amber-500/50 shrink-0" />
                                                        <SelectValue placeholder="Periodo" />
                                                    </div>
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-white/10 text-slate-300">
                                                    <SelectItem value="all">TODO EL HISTORIAL</SelectItem>
                                                    <SelectItem value="today">HOY</SelectItem>
                                                    <SelectItem value="yesterday">AYER</SelectItem>
                                                    <SelectItem value="week">ÚLTIMA SEMANA</SelectItem>
                                                    <SelectItem value="month">ESTE MES</SelectItem>
                                                    <SelectItem value="custom">PERSONALIZADO</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            {dateRangeType === 'custom' && (
                                                <div className="flex items-center gap-1.5 animate-in slide-in-from-left-1 duration-300 bg-slate-950/30 p-1.5 rounded-xl border border-white/5 h-10">
                                                    <Input 
                                                        type="date" 
                                                        value={fromDate} 
                                                        onChange={(e) => setFromDate(e.target.value)}
                                                        className="h-7 w-32 sm:w-32 bg-slate-950/50 border-white/5 text-slate-300 text-[10px] rounded-lg focus:border-blue-500/50 [&::-webkit-calendar-picker-indicator]:invert"
                                                    />
                                                    <Input 
                                                        type="date" 
                                                        value={toDate} 
                                                        onChange={(e) => setToDate(e.target.value)}
                                                        className="h-7 w-32 sm:w-32 bg-slate-950/50 border-white/5 text-slate-300 text-[10px] rounded-lg focus:border-blue-500/50 [&::-webkit-calendar-picker-indicator]:invert"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                                            <Loader2 className="w-8 h-8 animate-spin text-blue-500/50" />
                                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] animate-pulse">Sincronizando Auditoría...</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-white/5">
                                                    <TableRow className="hover:bg-transparent border-white/5">
                                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 px-4">Fecha / Hora</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Acción</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-center">Módulo</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10">Responsable</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-black text-slate-500 h-10 text-right pr-4">Detalles</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {auditoria?.map((log) => (
                                                        <TableRow key={log.id} className="hover:bg-blue-500/[0.02] border-white/5 transition-colors group">
                                                            <TableCell className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[11px] font-black text-blue-400 font-mono leading-none">
                                                                        {formatDatePeru(log.created_at, 'time')}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-0.5">
                                                                        {formatDatePeru(log.created_at, 'dayMonth')}
                                                                    </span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-3">
                                                                <span className="font-black text-slate-200 text-[11px] uppercase tracking-tight group-hover:text-blue-400 transition-colors">
                                                                    {log.accion.replace(/_/g, ' ')}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="py-3 text-center">
                                                                <Badge className={cn(
                                                                    "text-[8px] font-black uppercase tracking-widest px-1.5 py-0 border shrink-0",
                                                                    getTableBadgeColor(log.tabla_afectada)
                                                                )}>
                                                                    {log.tabla_afectada || 'General'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="py-3">
                                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                                    <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
                                                                        <User className="w-3 h-3 text-slate-500" />
                                                                    </div>
                                                                    <span className="truncate max-w-[100px]">
                                                                        {log.usuario_id === user?.id ? 'Tú' : (log.perfiles?.nombre || log.usuario_id || 'Sistema')}
                                                                    </span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-3 text-right pr-4">
                                                                <p className="text-[10px] text-slate-500 font-medium truncate max-w-[200px] group-hover:text-slate-400 transition-colors ml-auto">
                                                                    {log.detalles 
                                                                        ? (typeof log.detalles === 'object' ? JSON.stringify(log.detalles) : log.detalles)
                                                                        : 'Sin detalles'
                                                                    }
                                                                </p>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {(!auditoria || auditoria.length === 0) && (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="py-20 text-center">
                                                                <div className="flex flex-col items-center justify-center text-slate-500">
                                                                    <Activity className="w-12 h-12 mb-4 opacity-10" />
                                                                    <p className="text-[11px] font-black uppercase tracking-[0.2em]">No se encontraron registros</p>
                                                                    <p className="text-[10px] text-slate-600 mt-1">Prueba ajustando los filtros de búsqueda.</p>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}

                                    {/* Pagination Controls */}
                                    {!loading && auditoria.length > 0 && (
                                        <div className="p-4 border-t border-white/5">
                                            <PaginationControlled 
                                                currentPage={currentPage}
                                                totalPages={Math.ceil(totalRecords / ITEMS_PER_PAGE)}
                                                onPageChange={handlePageChange}
                                                totalRecords={totalRecords}
                                                pageSize={ITEMS_PER_PAGE}
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}

                    <TabsContent value="vouchers" className="mt-0">
                        <VoucherAlerts />
                    </TabsContent>

                    {(userRol === 'admin' || userRol === 'supervisor') && (
                        <TabsContent value="visitas" className="mt-0 outline-none">
                            <AuditoriaVisitasPanel 
                                userRol={userRol as any} 
                                userId={user?.id} 
                                perfiles={allProfiles} 
                            />
                        </TabsContent>
                    )}
                </Tabs>

                {isPending && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/20 backdrop-blur-[1px] rounded-xl animate-in fade-in duration-200">
                        <div className="bg-slate-900/80 border border-white/10 p-3 rounded-full shadow-2xl">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
