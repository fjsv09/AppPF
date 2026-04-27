'use client'

import { useState, useEffect } from 'react'
import { 
    Users, 
    TrendingUp, 
    Wallet, 
    AlertTriangle, 
    CheckCircle2, 
    ArrowRight, 
    Clock, 
    UserCheck,
    Briefcase,
    Zap,
    ShieldCheck,
    ShieldAlert,
    ChevronDown,
    Search,
    AlertCircle,
    RefreshCw,
    User,
    Activity,
    History,
    Contact, 
    Banknote, 
    Award, 
    CreditCard, 
    UserPlus, 
    Lock
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PendingTasks } from './pending-tasks'
import { QuickActions } from './quick-actions'
import { DrilldownDrawer } from './drilldown-drawer'
import { FinancialSummary } from './financial-summary'

interface SupervisorStats {
    teamSummary: {
        totalAsesores: number
        totalClientes: number
        totalCapitalActivo: number
        moraGlobal: number
        eficienciaHoy: number
        eficienciaMonto: number
        eficienciaPagado: number
        metaHoyMonto: number
        metaHoyPagado: number
        metaHoyPrestamosTotal: number
        metaHoyPrestamosPagados: number
        renovacionesMes: number
        clientesNuevosMes: number
        clientesBloqueados: number
        refinanciamientosMes: number
        totalRenovables: number
        totalInactivos: number
        totalAlertaCritica: number
        totalAdvertencia: number
        totalVencidos: number
        totalClientesConDeudaActiva: number
        moraMontoGlobal: number
    }
    supervisores?: Array<{
        id: string
        nombre: string
    }>
    asesores: Array<{
        id: string
        nombre: string
        foto: string | null
        capitalActivo: number
        moraMonto: number
        eficienciaHoy: number
        clientesActivos: number
        cuotasHoyTotal: number
        cuotasHoyPagado: number
    }>
    pendientes: {
        solicitudes: Array<{
            id: string
            monto_solicitado: number
            created_at: string
            cliente: { nombres: string }
            asesor: { nombre_completo: string }
        }>
        renovaciones: Array<{
            id: string
            monto_nuevo: number
            created_at: string
            cliente: { nombres: string }
            asesor: { nombre_completo: string }
        }>
    }
}

interface SupervisorEfficiencyProps {
    rol?: 'supervisor' | 'admin'
    showAdvisors?: boolean
    showActions?: boolean
    showMetrics?: boolean
    showFilters?: boolean
    showFinancialSummary?: boolean
}

export function SupervisorEfficiency({ 
    rol = 'supervisor',
    showAdvisors = true,
    showActions = true,
    showMetrics = true,
    showFilters = true,
    showFinancialSummary = false
}: SupervisorEfficiencyProps) {
    const [data, setData] = useState<SupervisorStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedAsesorId, setSelectedAsesorId] = useState<string | null>(null)
    const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null)
    const [isAseMenuOpen, setIsAseMenuOpen] = useState(false)
    const [isSupMenuOpen, setIsSupMenuOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
    const [isDrilldownOpen, setIsDrilldownOpen] = useState(false)
    const [drilldownType, setDrilldownType] = useState<string | null>(null)


    const fetchStats = async (asesorId?: string | null, supervisorId?: string | null) => {
        try {
            setLoading(true)
            let url = `/api/dashboard/supervisor/stats`
            const params = new URLSearchParams()
            if (asesorId) params.append('asesorId', asesorId)
            if (supervisorId) params.append('supervisorId', supervisorId)
            
            const queryString = params.toString()
            if (queryString) url += `?${queryString}`

            const res = await fetch(url)
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.details || errorData.error || 'Error al cargar estadísticas')
            }
            const json = await res.json()
            setData(json)
            setError(null)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const openDrilldown = (type: string) => {
        setDrilldownType(type)
        setIsDrilldownOpen(true)
    }

    useEffect(() => {
        fetchStats(selectedAsesorId, selectedSupervisorId)
    }, [selectedAsesorId, selectedSupervisorId])

    const formatMoney = (value: number) => {
        return new Intl.NumberFormat('es-PE', {
            style: 'currency',
            currency: 'PEN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value)
    }

    if (error) {
        return (
            <div className="p-8 bg-red-900/20 border border-red-500/50 rounded-2xl flex flex-col items-center gap-4 text-center">
                <AlertTriangle className="w-12 h-12 text-red-500" />
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">Error al conectar con el servidor</h3>
                    <p className="text-slate-400 max-w-md">{error}</p>
                </div>
                <button 
                    onClick={() => fetchStats(selectedAsesorId, selectedSupervisorId)}
                    className="flex items-center gap-2 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700"
                >
                    <RefreshCw className="w-4 h-4" />
                    Reintentar
                </button>
            </div>
        )
    }

    if (loading && !data) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => (
                        <div key={i} className="h-32 bg-slate-800/50 rounded-2xl animate-pulse" />
                    ))}
                </div>
                <div className="h-96 bg-slate-800/50 rounded-2xl animate-pulse" />
            </div>
        )
    }

    if (!data) return null

    const filteredAsesores = data.asesores.filter(a => 
        a.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const healthIndex = data.teamSummary.eficienciaMonto > 0 
        ? ((data.teamSummary.eficienciaHoy + (100 - data.teamSummary.moraGlobal)) / 2)
        : (100 - data.teamSummary.moraGlobal)

    return (
        <div className="space-y-4 md:space-y-8 animate-in fade-in duration-700 font-sans">
            {/* ROW 1: FILTROS DE CARTERA (SUPERVISOR + ASESOR) */}
            {showFilters && (
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                <div className="flex flex-row items-center gap-2 max-w-5xl">
                {/* SELECTOR DE SUPERVISORES (SOLO ADMIN) */}
                {rol === 'admin' && (
                    <div className="relative w-full md:w-72">
                        <div 
                            onClick={() => setIsSupMenuOpen(!isSupMenuOpen)}
                            className={cn(
                                "h-full flex items-center gap-3 bg-slate-950/40 backdrop-blur-md border border-slate-700/50 rounded-xl px-4 py-2 cursor-pointer transition-all hover:border-slate-500 shadow-xl",
                                isSupMenuOpen && "border-amber-500 shadow-amber-500/10 ring-1 ring-amber-500/20"
                            )}
                        >
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                                <Briefcase className="w-4 h-4 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0 pr-0.5 sm:pr-1">
                                <p className="text-[6px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5 whitespace-nowrap">Supervisor</p>
                                <h3 className="text-[9px] md:text-sm font-black text-white tracking-tight truncate uppercase">
                                    {selectedSupervisorId 
                                        ? data.supervisores?.find(s => s.id === selectedSupervisorId)?.nombre 
                                        : "Todos"}
                                </h3>
                            </div>
                            <ChevronDown className={cn("w-3 h-3 text-slate-500 transition-transform duration-300 ml-auto", isSupMenuOpen && "rotate-180")} />
                        </div>

                        {isSupMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsSupMenuOpen(false)} />
                                <div className="absolute top-[calc(100%+8px)] left-0 w-full min-w-[280px] bg-[#0d121c] border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
                                    <div className="px-5 py-3 bg-slate-900/40 border-b border-slate-800/50 flex items-center gap-3">
                                        <Users className="w-4 h-4 text-slate-500" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Equipos ({data.supervisores?.length || 0})</span>
                                    </div>
                                    <div className="p-2 max-h-[300px] overflow-y-auto no-scrollbar">
                                        <div 
                                            onClick={() => { setSelectedSupervisorId(null); setSelectedAsesorId(null); setIsSupMenuOpen(false); }}
                                            className={cn(
                                                "w-full px-4 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer group",
                                                !selectedSupervisorId ? "bg-amber-600/10 border border-amber-500/20" : "hover:bg-white/5 border border-transparent"
                                            )}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-400 group-hover:text-white transition-colors">T</div>
                                            <span className={cn("font-bold text-xs uppercase", !selectedSupervisorId ? "text-amber-400" : "text-white")}>Todos los Equipos</span>
                                        </div>

                                        {data.supervisores?.map(sup => (
                                            <div 
                                                key={sup.id} 
                                                onClick={() => { setSelectedSupervisorId(sup.id); setSelectedAsesorId(null); setIsSupMenuOpen(false); }}
                                                className={cn(
                                                    "w-full px-4 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer group",
                                                    selectedSupervisorId === sup.id ? "bg-amber-600/10 border border-amber-500/20" : "hover:bg-white/5 border border-transparent"
                                                )}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">{sup.nombre.charAt(0)}</div>
                                                <span className={cn("font-bold text-xs uppercase", selectedSupervisorId === sup.id ? "text-amber-400" : "text-white")}>{sup.nombre}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* SELECTOR DE ASESORES */}
                {showAdvisors && (
                    <div className="relative w-full md:w-72">
                        <div 
                            onClick={() => setIsAseMenuOpen(!isAseMenuOpen)}
                            className={cn(
                                "h-full flex items-center gap-3 bg-slate-950/40 backdrop-blur-md border border-slate-700/50 rounded-xl px-4 py-2 cursor-pointer transition-all hover:border-slate-500 shadow-xl",
                                isAseMenuOpen && "border-blue-500 shadow-blue-500/10 ring-1 ring-blue-500/20"
                            )}
                        >
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                                <User className="w-4 h-4 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0 pr-0.5 sm:pr-1">
                                <p className="text-[6px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5 whitespace-nowrap">Registrados</p>
                                <h3 className="text-[9px] md:text-sm font-black text-white tracking-tight truncate uppercase">
                                    {selectedAsesorId 
                                        ? data.asesores.find(a => a.id === selectedAsesorId)?.nombre 
                                        : "General"}
                                </h3>
                            </div>
                            <ChevronDown className={cn("w-3 h-3 text-slate-500 transition-transform duration-300 ml-auto", isAseMenuOpen && "rotate-180")} />
                        </div>

                        {isAseMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsAseMenuOpen(false)} />
                                <div className="absolute top-[calc(100%+8px)] right-0 w-full min-w-[280px] bg-[#0d121c] border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
                                    <div className="px-5 py-3 bg-slate-900/40 border-b border-slate-800/50 flex items-center gap-3">
                                        <Search className="w-3 h-3 text-slate-500" />
                                        <input 
                                            autoFocus
                                            placeholder="Buscar asesor..."
                                            className="bg-transparent border-none text-[10px] font-black text-white placeholder:text-slate-600 focus:outline-none w-full uppercase"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="p-2 max-h-[300px] overflow-y-auto no-scrollbar">
                                        <div 
                                            onClick={() => { setSelectedAsesorId(null); setIsAseMenuOpen(false); }}
                                            className={cn(
                                                "w-full px-4 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer group",
                                                !selectedAsesorId ? "bg-blue-600/10 border border-blue-500/20" : "hover:bg-white/5 border border-transparent"
                                            )}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-400 group-hover:text-white transition-colors">G</div>
                                            <span className={cn("font-bold text-xs uppercase", !selectedAsesorId ? "text-blue-400" : "text-white")}>Todos los Registrados</span>
                                        </div>

                                        {filteredAsesores.map(ase => (
                                            <div 
                                                key={ase.id} 
                                                onClick={() => { setSelectedAsesorId(ase.id); setIsAseMenuOpen(false); }}
                                                className={cn(
                                                    "w-full px-4 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer group",
                                                    selectedAsesorId === ase.id ? "bg-blue-600/10 border border-blue-500/20" : "hover:bg-white/5 border border-transparent"
                                                )}
                                            >
                                                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold overflow-hidden">
                                                    {ase.foto ? (
                                                        <>
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={ase.foto} alt="" className="w-full h-full object-cover" />
                                                        </>
                                                    ) : ase.nombre.charAt(0)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={cn("font-bold text-xs truncate uppercase", selectedAsesorId === ase.id ? "text-blue-400" : "text-white")}>{ase.nombre}</h4>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
                </div>

                <button 
                    onClick={() => fetchStats(selectedAsesorId, selectedSupervisorId)} 
                    className="w-10 h-10 flex items-center justify-center bg-slate-950/40 border border-slate-700/50 rounded-xl text-slate-400 hover:text-white hover:border-slate-500 transition-all shadow-lg shrink-0 group"
                >
                    <RefreshCw className={cn("w-4 h-4 group-hover:rotate-180 transition-transform duration-500", loading && "animate-spin")} />
                </button>
            </div>
            )}

            {/* FINANCIAL SUMMARY (NEW) */}
            {showFinancialSummary && (
                <FinancialSummary asesorId={selectedAsesorId} supervisorId={selectedSupervisorId} />
            )}

            
            {/* ROW 2: RESUMEN DE EFICIENCIA (KPIs DE PULSO) */}
            {showMetrics && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                            <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Resumen de Eficiencia</h2>
                        </div>
                        <Badge variant="outline" className="text-[8px] md:text-[10px] border-slate-700/50 text-slate-500 uppercase font-black px-1.5 py-0">
                            Equipos
                        </Badge>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
                        {/* 1. Portfolio Health */}
                        <div 
                            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-blue-500/30 transition-all group cursor-help relative overflow-hidden"
                            onClick={() => setActiveTooltip(activeTooltip === 'salud' ? null : 'salud')}
                        >
                            {activeTooltip === 'salud' && (
                                <div className="absolute inset-0 z-20 bg-slate-950/95 p-3 flex flex-col justify-center animate-in fade-in zoom-in duration-200">
                                    <p className="text-[10px] font-bold text-blue-400 mb-1 uppercase">Salud de Cartera</p>
                                    <p className="text-[9px] text-slate-300 leading-tight mb-2">Estado cualitativo basado en el nivel de riesgo actual.</p>
                                    <p className="text-[8px] font-mono text-slate-500 bg-slate-900 p-1 rounded border border-slate-800">Formula: Indice de Mora Global (%)</p>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                                <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest text-blue-400">Salud</p>
                                <Zap className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400 opacity-70 group-hover:opacity-100" />
                            </div>
                            <h3 className="text-lg md:text-3xl font-black text-white tracking-tighter uppercase italic truncate">
                                {data.teamSummary.moraGlobal < 5 ? 'Óptima' : data.teamSummary.moraGlobal < 15 ? 'Saludable' : 'Riesgo'}
                            </h3>
                            <div className="mt-2 space-y-1.5 md:space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${healthIndex}%` }} />
                                    </div>
                                    <p className="text-blue-400 font-bold text-[9px]">{healthIndex.toFixed(0)}%</p>
                                </div>
                                <div className="flex">
                                    <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-blue-500/10 uppercase tracking-widest">{data.teamSummary.totalClientes} Clientes</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Collection Efficiency */}
                        <div 
                            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-emerald-500/30 transition-all group cursor-help relative overflow-hidden"
                            onClick={() => setActiveTooltip(activeTooltip === 'cobranza' ? null : 'cobranza')}
                        >
                            {activeTooltip === 'cobranza' && (
                                <div className="absolute inset-0 z-20 bg-slate-950/95 p-3 flex flex-col justify-center animate-in fade-in zoom-in duration-200">
                                    <p className="text-[10px] font-bold text-emerald-400 mb-1 uppercase">Cobranza del Día</p>
                                    <p className="text-[9px] text-slate-300 leading-tight mb-2">Mide el cumplimiento de los cobros programados para hoy.</p>
                                    <p className="text-[8px] font-mono text-slate-500 bg-slate-900 p-1 rounded border border-slate-800">Formula: (Pagado Hoy / Meta Hoy) × 100</p>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                                <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest text-[#10b981]">Cobranza Hoy</p>
                                <Wallet className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#10b981] opacity-70 group-hover:opacity-100" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm md:text-2xl font-black text-white tracking-tighter truncate">
                                    {formatMoney(data.teamSummary.metaHoyPagado)}
                                </span>
                                <span className="text-[9px] md:text-[11px] font-bold text-slate-500 tracking-tight">
                                    Meta: {formatMoney(data.teamSummary.metaHoyMonto)}
                                </span>
                            </div>
                            <div className="mt-2 space-y-1.5 md:space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#10b981] transition-all duration-1000" style={{ width: `${data.teamSummary.eficienciaHoy}%` }} />
                                    </div>
                                    <p className="text-[#10b981] font-bold text-[9px]">{data.teamSummary.eficienciaHoy.toFixed(0)}%</p>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="bg-[#10b981]/10 text-[#10b981] text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-[#10b981]/10 uppercase tracking-widest">{data.teamSummary.metaHoyPrestamosPagados}/{data.teamSummary.metaHoyPrestamosTotal} Créd.</span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Global Efficiency */}
                        <div 
                            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-blue-500/30 transition-all group relative overflow-hidden cursor-help"
                            onClick={() => setActiveTooltip(activeTooltip === 'eficiencia' ? null : 'eficiencia')}
                        >
                            {activeTooltip === 'eficiencia' && (
                                <div className="absolute inset-0 z-20 bg-slate-950/95 p-3 flex flex-col justify-center animate-in fade-in zoom-in duration-200">
                                    <p className="text-[10px] font-bold text-blue-400 mb-1 uppercase">Eficiencia Real</p>
                                    <p className="text-[9px] text-slate-300 leading-tight mb-2">Muestra cuánto se ha cobrado frente a TODO lo que el cliente debe a la fecha.</p>
                                    <p className="text-[8px] font-mono text-slate-500 bg-slate-900 p-1 rounded border border-slate-800">Formula: (Recaudado / [Meta Hoy + Atrasados]) × 100</p>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                                <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest text-blue-400">Efc. Cobro</p>
                                <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400 opacity-70 group-hover:opacity-100" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm md:text-2xl font-black text-white tracking-tighter truncate">
                                    {formatMoney(data.teamSummary.eficienciaPagado)}
                                </span>
                                <span className="text-[9px] md:text-[11px] font-bold text-slate-500 tracking-tight">
                                    Meta: {formatMoney(data.teamSummary.eficienciaMonto)}
                                </span>
                            </div>
                            <div className="mt-2 space-y-1.5 md:space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${(data.teamSummary.eficienciaPagado / (data.teamSummary.eficienciaMonto || 1)) * 100}%` }} />
                                    </div>
                                    <p className="text-blue-400 font-bold text-[9px]">
                                        {((data.teamSummary.eficienciaPagado / (data.teamSummary.eficienciaMonto || 1)) * 100).toFixed(0)}%
                                    </p>
                                </div>
                                <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-blue-500/10 uppercase tracking-widest">Hoy + Atrasados</span>
                            </div>
                        </div>

                        {/* 4. Global Mora */}
                        <div 
                            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-rose-500/30 transition-all group relative overflow-hidden cursor-help"
                            onClick={() => setActiveTooltip(activeTooltip === 'mora' ? null : 'mora')}
                        >
                            {activeTooltip === 'mora' && (
                                <div className="absolute inset-0 z-20 bg-slate-950/95 p-3 flex flex-col justify-center animate-in fade-in zoom-in duration-200">
                                    <p className="text-[10px] font-bold text-rose-500 mb-1 uppercase">Índice de Mora</p>
                                    <p className="text-[9px] text-slate-300 leading-tight mb-2">Representa el capital que está en riesgo por falta de pago.</p>
                                    <p className="text-[8px] font-mono text-slate-500 bg-slate-900 p-1 rounded border border-slate-800">Formula: (Deuda Vencida / Saldo Pendiente Total) × 100</p>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                                <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest text-rose-500">Mora Global</p>
                                <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5 text-rose-500 opacity-70 group-hover:opacity-100" />
                            </div>
                            <h2 className="text-lg md:text-3xl font-black text-rose-500 tracking-tighter inline-flex items-baseline gap-2">
                                {data.teamSummary.moraGlobal.toFixed(2)}%
                                <span className="text-[10px] md:text-sm font-bold opacity-60">
                                    ({formatMoney(data.teamSummary.moraMontoGlobal)})
                                </span>
                            </h2>
                            <div className="mt-2 space-y-1.5 md:space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${Math.min(data.teamSummary.moraGlobal * 5, 100)}%` }} />
                                    </div>
                                    <p className="text-rose-500 font-bold text-[8px] md:text-[9px]">Riesgo</p>
                                </div>
                                <span className="bg-rose-500/10 text-rose-500 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-rose-500/10 uppercase tracking-widest">Cap. Vencido</span>
                            </div>
                        </div>
                    </div>
                </div>
            )  }

            {/* ROW 3: RESUMEN OPERATIVO Y ACCIONES RÁPIDAS */}
            <div className={cn(
                "grid grid-cols-1 gap-6",
                showMetrics && showActions ? "lg:grid-cols-3" : "grid-cols-1"
            )}>
                {/* Operational Summary */}
                {showMetrics && (
                    <div className={cn("space-y-6", showActions ? "lg:col-span-2" : "lg:col-span-3")}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                                    <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Resumen Operativo</h2>
                                </div>
                                <Badge className="bg-blue-500/10 text-blue-400 border-none px-2 py-0 text-[8px] md:text-[10px] font-black uppercase tracking-widest shrink-0">
                                    Mes Actual
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('total')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <Users className="w-2.5 h-2.5" /> Total Clientes
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.totalClientes}</span>
                                    </div>
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('nuevos')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <UserPlus className="w-2.5 h-2.5" /> Clientes Nuevos
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.clientesNuevosMes}</span>
                                    </div>
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 hover:border-blue-400/30 hover:bg-blue-400/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('vigente')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <UserCheck className="w-2.5 h-2.5" /> Cartera Vigente
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.totalClientesConDeudaActiva}</span>
                                    </div>
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('renovaciones')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <Banknote className="w-2.5 h-2.5" /> Renovaciones
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.renovacionesMes}</span>
                                    </div>
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 hover:border-emerald-400/30 hover:bg-emerald-400/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('aptos')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <Zap className="w-2.5 h-2.5" /> Aptos para Crédito
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.totalRenovables}</span>
                                    </div>
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 hover:border-rose-500/30 hover:bg-rose-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('bloqueados')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <Lock className="w-2.5 h-2.5" /> Clientes Bloqueados
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.clientesBloqueados}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 border-red-500/20 hover:bg-red-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('critica')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <AlertTriangle className="w-2.5 h-2.5" /> Alerta Crítica
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.totalAlertaCritica}</span>
                                    </div>
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 border-amber-500/20 hover:bg-amber-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('advert')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <Activity className="w-2.5 h-2.5" /> En Advertencia
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.totalAdvertencia}</span>
                                    </div>
                                    {activeTooltip === 'advert' && (
                                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-950 border border-slate-800 p-2 rounded-lg shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                            <p className="text-[10px] text-slate-300">Préstamos con pequeños retrasos que están bajo monitoreo preventivo.</p>
                                        </div>
                                    )}
                                </div>

                                <div 
                                    className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 border-orange-500/20 hover:bg-orange-500/5 transition-all group relative cursor-pointer"
                                    onClick={() => openDrilldown('vencidos')}
                                >
                                    <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1 truncate">
                                        <History className="w-2.5 h-2.5" /> Vencidos
                                    </p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg md:text-xl font-black text-white">{data.teamSummary.totalVencidos}</span>
                                    </div>
                                    {activeTooltip === 'vencidos' && (
                                        <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-950 border border-slate-800 p-2 rounded-lg shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                            <p className="text-[10px] text-slate-300">Créditos cuya fecha de término ya pasó pero aún mantienen saldo deudor.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="lg:col-span-1">
                    {showActions && <QuickActions />}
                </div>
            </div>

            {/* Final spacer */}
            <div className="h-4" />

            {/* Drilldown Drawer */}
            <DrilldownDrawer 
                isOpen={isDrilldownOpen}
                onOpenChange={setIsDrilldownOpen}
                type={drilldownType}
                asesorId={selectedAsesorId}
                supervisorId={selectedSupervisorId}
            />
        </div>
    )
}
