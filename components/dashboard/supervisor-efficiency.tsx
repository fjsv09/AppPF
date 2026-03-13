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
    }
    asesores: Array<{
        id: string
        nombre: string
        foto: string | null
        capitalActivo: number
        moraMonto: number
        eficienciaHoy: number
        clientesActivos: number
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

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* 1. TOP METRICS - "The Pulse" */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Active Portfolio Health (Security: Hidden absolute capital) */}
                <div className="relative group overflow-hidden rounded-3xl bg-slate-900/40 border border-slate-800 p-6 hover:border-blue-500/50 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <ShieldCheck className="w-20 h-20 text-blue-500" />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl group-hover:bg-blue-500/20 transition-colors">
                            <Briefcase className="w-6 h-6 text-blue-400" />
                        </div>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Estado de Cartera</span>
                    </div>
                    <h2 className="text-4xl font-bold text-white tracking-tighter">
                        {data.teamSummary.moraGlobal < 5 ? 'Óptima' : data.teamSummary.moraGlobal < 15 ? 'Saludable' : 'En Riesgo'}
                    </h2>
                    <p className="text-slate-500 text-xs mt-2 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" /> {((data.teamSummary.eficienciaHoy + (100 - data.teamSummary.moraGlobal)) / 2).toFixed(1)}% Índice de Salud
                    </p>
                </div>

                {/* Daily Efficiency */}
                <div className="relative group overflow-hidden rounded-3xl bg-slate-900/40 border border-slate-800 p-6 hover:border-emerald-500/50 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Zap className="w-20 h-20 text-emerald-500" />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl group-hover:bg-emerald-500/20 transition-colors">
                            <TrendingUp className="w-6 h-6 text-emerald-400" />
                        </div>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Cobranza del Día</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-4xl font-bold text-emerald-400 tracking-tighter">{data.teamSummary.eficienciaHoy.toFixed(1)}%</h2>
                        <div className="flex-1 max-w-[100px]">
                            <Progress value={data.teamSummary.eficienciaHoy} className="h-2 bg-slate-800 [&>div]:bg-emerald-500" />
                        </div>
                    </div>
                    <p className="text-slate-500 text-xs mt-2">Avance de recaudación diaria global</p>
                </div>

                {/* Global Mora */}
                <div className="relative group overflow-hidden rounded-3xl bg-slate-900/40 border border-slate-800 p-6 hover:border-rose-500/50 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <AlertTriangle className="w-20 h-20 text-rose-500" />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-rose-500/10 rounded-2xl group-hover:bg-rose-500/20 transition-colors">
                            <ShieldCheck className="w-6 h-6 text-rose-400" />
                        </div>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Mora Proyectada</span>
                    </div>
                    <h2 className="text-4xl font-bold text-rose-400 tracking-tighter">{data.teamSummary.moraGlobal.toFixed(2)}%</h2>
                    <p className="text-slate-500 text-xs mt-2">Capital en riesgo acumulado</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 2. TEAM PERFORMANCE BOARD */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Users className="w-5 h-5 text-purple-400" />
                            Gestión de Asesores
                        </h3>
                        <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                            {data.asesores.length} Activos
                        </Badge>
                    </div>

                    <div className="grid gap-4">
                        {data.asesores.map(asesor => (
                            <div key={asesor.id} className="group bg-slate-900/30 backdrop-blur-md border border-slate-800 rounded-2xl p-4 hover:bg-slate-900/60 transition-all">
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg overflow-hidden border-2 border-slate-700">
                                        {asesor.foto ? <img src={asesor.foto} alt="" className="w-full h-full object-cover" /> : asesor.nombre.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-[200px]">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">{asesor.nombre}</h4>
                                            <Badge variant="outline" className="text-[10px] py-0 h-4 bg-slate-800/50">Asesor</Badge>
                                        </div>
                                        <div className="flex items-center gap-4 text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                                            <span>Clientes: {asesor.clientesActivos}</span>
                                            <span className={cn(asesor.moraMonto > 0 ? "text-rose-400" : "text-emerald-400")}>
                                                Eficiencia: {asesor.eficienciaHoy.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-32 space-y-2">
                                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                                            <span>Colección</span>
                                            <span>{asesor.eficienciaHoy.toFixed(0)}%</span>
                                        </div>
                                        <Progress value={asesor.eficienciaHoy} className={cn(
                                            "h-1.5 bg-slate-800",
                                            asesor.eficienciaHoy > 80 ? "[&>div]:bg-emerald-500" : 
                                            asesor.eficienciaHoy > 40 ? "[&>div]:bg-amber-500" : "[&>div]:bg-rose-500"
                                        )} />
                                    </div>
                                    <Link href={`/dashboard/supervision`}>
                                        <button className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                                            <ChevronRight className="w-5 h-5 text-slate-600" />
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        ))}
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
