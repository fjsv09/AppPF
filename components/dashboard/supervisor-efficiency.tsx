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
    ChevronRight,
    Search
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import Link from 'next/link'
import { cn } from '@/lib/utils'

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
    }
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

export function SupervisorEfficiency() {
    const [data, setData] = useState<SupervisorStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        fetchStats()
    }, [])

    const fetchStats = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/dashboard/supervisor/stats')
            if (!res.ok) throw new Error('Error al cargar estadísticas')
            const json = await res.json()
            setData(json)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const formatMoney = (val: number) => {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(val)
    }

    if (loading) return <div className="grid gap-6 animate-pulse">
        <div className="h-32 bg-slate-800/50 rounded-3xl" />
        <div className="h-64 bg-slate-800/50 rounded-3xl" />
    </div>

    if (error || !data) return <div className="p-8 text-center bg-red-950/20 border border-red-900/50 rounded-3xl text-red-400">{error || 'Error de datos'}</div>

    const filteredAsesores = data.asesores.filter(a => 
        a.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Calculate Health Index: If nothing is due today, just use (100 - mora)
    const healthIndex = data.teamSummary.eficienciaHoy > 0 
        ? ((data.teamSummary.eficienciaHoy + (100 - data.teamSummary.moraGlobal)) / 2)
        : (100 - data.teamSummary.moraGlobal)

    return (
        <div className="space-y-4 md:space-y-8 animate-in fade-in duration-700">
            {/* 1. TOP METRICS - "The Pulse" */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
                {/* 1. Portfolio Health (Ultra Compact) */}
                <div className="bg-[#090e16] border border-slate-800/40 rounded-xl md:rounded-2xl p-3 md:p-4 shadow-xl relative flex flex-col justify-between min-h-[90px] md:min-h-[130px] group transition-all cursor-help group/tooltip">
                    <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-[0.02] rotate-12">
                        <Briefcase className="w-20 md:w-24 h-20 md:h-24 text-white" />
                    </div>
                    
                    <div className="relative z-10">
                        <p className="text-blue-400 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-0.5 md:mb-2">Salud</p>
                        <h2 className="text-lg md:text-3xl font-black text-white tracking-tighter uppercase italic">
                            {data.teamSummary.moraGlobal < 5 ? 'Óptima' : data.teamSummary.moraGlobal < 15 ? 'Saludable' : 'En Riesgo'}
                        </h2>
                    </div>

                    <div className="relative z-10 mt-1 md:mt-2 space-y-1.5 md:space-y-2">
                        <div className="flex items-center gap-1.5 md:gap-3">
                            <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000"
                                    style={{ width: `${healthIndex}%` }}
                                />
                            </div>
                            <p className="text-blue-400 font-bold text-[7px] md:text-[9px]">
                                {healthIndex.toFixed(0)}%
                            </p>
                        </div>
                        <div className="flex">
                            <span className="bg-blue-500/10 text-blue-400 text-[6px] md:text-[8px] font-black px-1 md:px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest">
                                {data.teamSummary.totalClientes} Clientes
                            </span>
                        </div>
                    </div>

                    {/* Calculation Tooltip */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-[105%] w-56 bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-[60]">
                        <p className="text-[8px] font-black text-blue-400 uppercase mb-1.5 tracking-wider border-b border-slate-800 pb-1">Fórmula de Salud</p>
                        <div className="space-y-2">
                            <p className="text-[7.5px] text-slate-300 leading-relaxed">
                                Balance entre recuperación diaria y riesgo de la cartera.
                            </p>
                            <div className="p-2 bg-slate-900/50 rounded text-[8px] font-mono text-blue-300 text-center border border-blue-500/10">
                                [ EFC + (100 - %Mora) ] / 2
                            </div>
                            <p className="text-[6.5px] text-slate-500 italic">
                                * EFC: Eficiencia de Cobro.
                                <br />* %Mora: Índice de morosidad global.
                            </p>
                        </div>
                    </div>
                </div>

                {/* 2. Daily Efficiency (Ultra Compact) */}
                <Link href="/dashboard/supervision" className="bg-[#090e16] border border-slate-800/40 rounded-xl md:rounded-2xl p-3 md:p-4 shadow-xl relative flex flex-col justify-between min-h-[90px] md:min-h-[130px] hover:bg-[#0d1421] transition-all group group/tooltip">
                     <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-[0.02] rotate-12">
                        <Wallet className="w-20 md:w-24 h-20 md:h-24 text-white" />
                     </div>
                     
                     <div className="relative z-10">
                        <p className="text-[#10b981] font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-0.5 md:mb-2">Cobranza</p>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg md:text-3xl font-black text-white tracking-tighter">{formatMoney(data.teamSummary.metaHoyPagado)}</span>
                           <span className="text-slate-600 text-[10px] md:text-sm font-medium">/ {formatMoney(data.teamSummary.metaHoyMonto)}</span>
                        </div>
                     </div>

                     <div className="relative z-10 mt-1 md:mt-2 space-y-1.5 md:space-y-2">
                        <div className="flex items-center gap-1.5 md:gap-3">
                            <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-all duration-1000"
                                   style={{ width: `${data.teamSummary.eficienciaHoy}%` }}
                               />
                            </div>
                            <p className="text-[#10b981] font-bold text-[7px] md:text-[9px]">
                               {data.teamSummary.eficienciaHoy.toFixed(0)}%
                            </p>
                        </div>
                        <div className="flex">
                            <span className="bg-[#10b981]/10 text-[#10b981] text-[6px] md:text-[8px] font-black px-1 md:px-2 py-0.5 rounded border border-[#10b981]/20 uppercase tracking-widest">
                                {data.teamSummary.metaHoyPrestamosPagados}/{data.teamSummary.metaHoyPrestamosTotal}
                            </span>
                        </div>
                     </div>

                     {/* Calculation Tooltip */}
                     <div className="absolute left-1/2 -translate-x-1/2 bottom-[105%] w-60 bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-[60]">
                        <p className="text-[8px] font-black text-[#10b981] uppercase mb-1.5 tracking-wider border-b border-slate-800 pb-1">Fórmula de Eficiencia (EFC)</p>
                        <div className="space-y-2">
                            <div className="p-2 bg-slate-900/50 rounded text-[8px] font-mono text-[#10b981] text-center border border-emerald-500/10">
                                (Cobrado_Ruta / Meta_Ruta) * 100
                            </div>
                            <div className="text-[7px] space-y-1 text-slate-300">
                                <p><span className="text-white font-bold">META:</span> sum(Cuota_Hoy + Atrasos)</p>
                                <p><span className="text-white font-bold">COBRADO:</span> sum(Pagos de hoy en ruta)</p>
                            </div>
                            <p className="text-[6.5px] text-slate-500 italic border-t border-slate-900 pt-1">
                                No incluye pagos adelantados para no inflar el cumplimiento.
                            </p>
                        </div>
                    </div>
                </Link>

                {/* 3. Global Efficiency (Today + Arrears) */}
                <div className="bg-[#090e16] border border-slate-800/40 rounded-xl md:rounded-2xl p-3 md:p-4 shadow-xl relative flex flex-col justify-between min-h-[90px] md:min-h-[130px] group transition-all cursor-help group/tooltip">
                     <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-[0.02] rotate-12">
                        <TrendingUp className="w-20 md:w-24 h-20 md:h-24 text-white" />
                     </div>
                     
                     <div className="relative z-10">
                        <p className="text-blue-400 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-0.5 md:mb-2">Eficiencia Cobro</p>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg md:text-3xl font-black text-white tracking-tighter">{formatMoney(data.teamSummary.eficienciaPagado)}</span>
                           <span className="text-slate-600 text-[10px] md:text-sm font-medium">/ {formatMoney(data.teamSummary.eficienciaMonto)}</span>
                        </div>
                     </div>

                     <div className="relative z-10 mt-1 md:mt-2 space-y-1.5 md:space-y-2">
                        <div className="flex items-center gap-1.5 md:gap-3">
                            <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000"
                                   style={{ width: `${data.teamSummary.eficienciaHoy}%` }}
                               />
                            </div>
                            <p className="text-blue-400 font-bold text-[7px] md:text-[9px]">
                               {data.teamSummary.eficienciaHoy.toFixed(0)}%
                            </p>
                        </div>
                        <div className="flex">
                            <span className="bg-blue-500/10 text-blue-400 text-[6px] md:text-[8px] font-black px-1 md:px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-widest">
                                Hoy + Atrasados
                            </span>
                        </div>
                     </div>

                     {/* Calculation Tooltip */}
                     <div className="absolute left-1/2 -translate-x-1/2 bottom-[105%] w-60 bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-[60]">
                        <p className="text-[8px] font-black text-blue-400 uppercase mb-1.5 tracking-wider border-b border-slate-800 pb-1">Fórmula de Eficiencia (EFC)</p>
                        <div className="space-y-2">
                            <div className="p-2 bg-slate-900/50 rounded text-[8px] font-mono text-blue-400 text-center border border-blue-500/10">
                                (Cobrado_Ruta / Meta_Ruta) * 100
                            </div>
                            <div className="text-[7px] space-y-1 text-slate-300">
                                <p><span className="text-white font-bold">META:</span> sum(Cuota_Hoy + Atrasos)</p>
                                <p><span className="text-white font-bold">COBRADO:</span> sum(Pagos de hoy en ruta)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Global Mora (Ultra Compact) */}
                <div className="bg-[#090e16] border border-slate-800/40 rounded-xl md:rounded-2xl p-3 md:p-4 shadow-xl relative flex flex-col justify-between min-h-[90px] md:min-h-[130px] group transition-all cursor-help group/tooltip lg:col-span-1">
                    <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-[0.02] rotate-12">
                        <AlertTriangle className="w-20 md:w-24 h-20 md:h-24 text-white" />
                    </div>
                    
                    <div className="relative z-10">
                        <p className="text-rose-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-0.5 md:mb-2">Mora Global</p>
                        <h2 className="text-lg md:text-3xl font-black text-rose-500 tracking-tighter">
                            {data.teamSummary.moraGlobal.toFixed(2)}%
                        </h2>
                    </div>

                    <div className="relative z-10 mt-1 md:mt-2 space-y-1.5 md:space-y-2">
                        <div className="flex items-center gap-1.5 md:gap-3">
                            <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-rose-500 to-red-600 transition-all duration-1000"
                                    style={{ width: `${Math.min(data.teamSummary.moraGlobal * 5, 100)}%` }}
                                />
                            </div>
                            <p className="text-rose-500 font-bold text-[7px] md:text-[9px]">
                                Riesgo
                            </p>
                        </div>
                        <div className="flex">
                            <span className="bg-rose-500/10 text-rose-500 text-[6px] md:text-[8px] font-black px-1 md:px-2 py-0.5 rounded border border-rose-500/20 uppercase tracking-widest">
                                Capital vencido
                            </span>
                        </div>
                    </div>

                    {/* Calculation Tooltip */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-[105%] w-56 bg-slate-950 border border-slate-800 p-3 rounded-lg shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-[60]">
                        <p className="text-[8px] font-black text-rose-500 uppercase mb-1.5 tracking-wider border-b border-slate-800 pb-1">Fórmula de Mora Global</p>
                        <div className="space-y-2">
                            <div className="p-2 bg-slate-900/50 rounded text-[8px] font-mono text-rose-400 text-center border border-rose-500/10">
                                (Cap_Vencido / Cap_Original) * 100
                            </div>
                            <p className="text-[7.5px] text-slate-300 leading-relaxed">
                                Mide qué porcentaje del dinero prestado está actualmente en mora.
                            </p>
                            <p className="text-[6.5px] text-slate-500 italic">
                                * Cap_Vencido: Capital de cuotas impagas.
                                <br />* Cap_Original: Capital total desembolsado.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 2. TEAM PERFORMANCE BOARD */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-400" />
                                Gestión de Asesores
                            </h3>
                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                                {data.asesores.length} Activos
                            </Badge>
                        </div>
                        
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input 
                                type="text"
                                placeholder="Buscar asesor..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4">
                        {filteredAsesores.length === 0 ? (
                            <div className="p-8 text-center bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
                                <Users className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                                <p className="text-slate-500 text-xs">No se encontraron asesores.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                                {filteredAsesores.map(asesor => (
                                    <div key={asesor.id} className="group bg-slate-900/30 backdrop-blur-md border border-slate-800 rounded-xl p-3 hover:bg-slate-900/50 transition-all">
                                        <div className="flex items-center gap-3">
                                            {/* Minimal Avatar */}
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center text-blue-400 font-bold border border-blue-500/20 shrink-0">
                                                {asesor.foto ? <img src={asesor.foto} alt="" className="w-full h-full object-cover" /> : asesor.nombre.charAt(0)}
                                            </div>

                                            {/* Name and Quick Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <h4 className="font-bold text-white text-sm truncate group-hover:text-blue-400 transition-colors uppercase tracking-tight">{asesor.nombre}</h4>
                                                    
                                                    {/* Interactive Efficiency Badge */}
                                                    <div className="relative group/efc">
                                                        <span className={cn(
                                                            "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter cursor-help",
                                                            asesor.eficienciaHoy > 80 ? "bg-emerald-500/10 text-emerald-400" : 
                                                            asesor.eficienciaHoy > 40 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-500"
                                                        )}>
                                                            {asesor.eficienciaHoy.toFixed(1)}% EFC
                                                        </span>
                                                        
                                                        {/* Tooltip Content (Show on hover/PC and potentially click/Mobile via group-hover or sibling) */}
                                                        <div className="absolute right-0 bottom-full mb-2 w-32 bg-slate-950 border border-slate-800 p-2 rounded-lg shadow-2xl opacity-0 group-hover/efc:opacity-100 pointer-events-none transition-opacity z-50">
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[8px] font-bold">
                                                                    <span className="text-slate-500">META:</span>
                                                                    <span className="text-white">{formatMoney(asesor.cuotasHoyTotal)}</span>
                                                                </div>
                                                                <div className="flex justify-between text-[8px] font-bold">
                                                                    <span className="text-slate-500">COBRADO:</span>
                                                                    <span className="text-emerald-400">{formatMoney(asesor.cuotasHoyPagado)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[7px] text-slate-500 italic text-center">
                                                                Solo pagos de ruta
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mb-2">
                                                    <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase">
                                                        <span>Clientes Activos:</span>
                                                        <span className="text-white">{asesor.clientesActivos}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className={cn(
                                                                "h-full transition-all duration-700",
                                                                asesor.eficienciaHoy > 80 ? "bg-emerald-500" : 
                                                                asesor.eficienciaHoy > 40 ? "bg-amber-500" : "bg-rose-500"
                                                            )}
                                                            style={{ width: `${asesor.eficienciaHoy}%` }}
                                                        />
                                                    </div>
                                                    <Link href={`/dashboard/supervision?asesor=${asesor.id}`} className="shrink-0 bg-slate-800/50 hover:bg-white/10 p-1 rounded transition-colors">
                                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. CRITICAL ACTIONS PANEL */}
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-400" />
                        Acciones Rápidas
                    </h3>

                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
                        {/* Solicitudes Header */}
                        <div className="px-5 py-3 bg-slate-900/50 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Solicitudes por Validar</span>
                            {data.pendientes.solicitudes.length > 0 && (
                                <span className="bg-amber-500 w-2 h-2 rounded-full animate-pulse" />
                            )}
                        </div>

                        {data.pendientes.solicitudes.length === 0 ? (
                            <div className="px-5 py-6 text-center text-slate-600 text-sm italic">
                                No hay solicitudes pendientes
                            </div>
                        ) : data.pendientes.solicitudes.map(sol => (
                            <div key={sol.id} className="p-4 hover:bg-slate-900/40 transition-colors group">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">{sol.cliente.nombres}</p>
                                        <p className="text-[10px] text-slate-500">Asesor: {sol.asesor.nombre_completo}</p>
                                    </div>
                                    <span className="text-xs font-bold text-emerald-400">{formatMoney(sol.monto_solicitado)}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Link href={`/dashboard/solicitudes/${sol.id}`} className="flex-1">
                                        <button className="w-full py-2 bg-slate-800 hover:bg-blue-600/20 text-blue-400 text-[10px] font-bold uppercase rounded-lg border border-slate-700 hover:border-blue-500/50 transition-all">
                                            Evaluar
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        ))}

                        {/* Renovaciones Section */}
                        <div className="px-5 py-3 bg-slate-900/50 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Renovaciones</span>
                        </div>

                        {data.pendientes.renovaciones.length === 0 ? (
                            <div className="px-5 py-6 text-center text-slate-600 text-sm italic">
                                Todo al día
                            </div>
                        ) : data.pendientes.renovaciones.map(ren => (
                            <div key={ren.id} className="p-4 hover:bg-slate-900/40 transition-colors group">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">{ren.cliente.nombres}</p>
                                        <p className="text-[10px] text-slate-500">Asesor: {ren.asesor.nombre_completo}</p>
                                    </div>
                                    <span className="text-xs font-bold text-purple-400">{formatMoney(ren.monto_nuevo)}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Link href={`/dashboard/renovaciones/${ren.id}`} className="flex-1">
                                        <button className="w-full py-2 bg-slate-800 hover:bg-purple-600/20 text-purple-400 text-[10px] font-bold uppercase rounded-lg border border-slate-700 hover:border-purple-500/50 transition-all">
                                            Validar
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        ))}

                        <div className="p-3">
                            <Link href="/dashboard/supervision" className="block">
                                <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 group/btn">
                                    Panel de Control Completo
                                    <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
