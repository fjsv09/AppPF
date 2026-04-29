'use client'

import { useState, useEffect } from 'react'
import { 
    Wallet, 
    TrendingUp, 
    AlertTriangle, 
    Users, 
    RefreshCw,
    Phone,
    Calendar,
    Banknote,
    UserCheck,
    ShieldAlert,
    ShieldCheck,
    Zap,
    AlertCircle,
    Briefcase
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PendingTasks } from '@/components/dashboard/pending-tasks'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface KPIsData {
    finanzas: {
        capital_activo_total: number
        ganancia_realizada_mes: number
    }
    riesgo: {
        capital_vencido: number
        tasa_morosidad_capital: number
        clientes_en_mora: number
        clientes_castigados: number
    }
    operatividad: {
        renovaciones_mes: {
            cantidad: number
            volumen: number
        }
        total_clientes_activos: number
    }
    oportunidades: {
        recaptables: Array<{
            id: string
            nombre: string
            telefono: string
            ultimo_pago: string | null
            monto_ultimo_prestamo: number
        }>
    }
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

export function AdminKPIs() {
    const [data, setData] = useState<KPIsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Helper for formatting money
    const formatMoney = (value: number = 0): string => {
        return value.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    const fetchKPIs = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/dashboard/admin/kpis')
            if (!res.ok) throw new Error('Error al cargar KPIs')
            const json = await res.json()
            setData(json)
            setError(null)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchKPIs()
        
        fetch('/api/auditoria/generar-tareas', { method: 'POST' })
            .catch(err => console.error("Error silencioso en cron:", err))
    }, [])

    if (loading) {
        return (
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6 animate-pulse">
                    <div className="h-48 bg-slate-800/50 rounded-2xl" />
                    <div className="h-64 bg-slate-800/50 rounded-2xl" />
                    <div className="h-48 bg-slate-800/50 rounded-2xl" />
                </div>
                <div className="space-y-6 animate-pulse">
                    <div className="h-96 bg-slate-800/50 rounded-2xl" />
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="p-6 bg-red-950/20 border border-red-900/50 rounded-2xl text-red-400 text-center">
                {error || 'Error al cargar datos'}
            </div>
        )
    }

    return (
        <div className="grid gap-6 lg:grid-cols-3 animate-in fade-in duration-700">
            {/* MAIN COLUMN: METRICS */}
            <div className={cn("space-y-6 lg:col-span-2")}>
                
                {/* BLOQUE 1: FINANZAS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Wallet className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                        <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Finanzas</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl p-4 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-slate-400 font-black text-[8px] md:text-[9px] uppercase tracking-widest">Capital Activo Total</p>
                                <Banknote className="w-3.5 h-3.5 text-emerald-500/50 group-hover:text-emerald-500 transition-colors" />
                            </div>
                            <h3 className="text-xl md:text-3xl font-black text-white tracking-tighter">S/ {formatMoney(data.finanzas.capital_activo_total)}</h3>
                            <div className="mt-2">
                                <span className="bg-emerald-500/10 text-emerald-400 text-[7px] md:text-[8px] font-black px-1.5 py-0.5 rounded border border-emerald-500/10 uppercase tracking-widest">Vigente en calle</span>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl p-4 relative overflow-hidden group hover:border-blue-500/30 transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-slate-400 font-black text-[8px] md:text-[9px] uppercase tracking-widest">Ganancia Realizada (Mes)</p>
                                <TrendingUp className="w-3.5 h-3.5 text-blue-500/50 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <h3 className="text-xl md:text-3xl font-black text-emerald-400 tracking-tighter">S/ {formatMoney(data.finanzas.ganancia_realizada_mes)}</h3>
                            <div className="mt-2">
                                <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 py-0.5 rounded border border-blue-500/10 uppercase tracking-widest">Interés cobrado</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BLOQUE 2: RIESGO */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 text-rose-400" />
                        <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Gestión de Riesgo</h2>
                    </div>
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl p-4 md:p-6 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-[50px] -mr-16 -mt-16" />
                        <div className="relative z-10">
                            <div className="mb-4">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Índice de Morosidad</span>
                                    <span className="text-lg md:text-2xl font-black text-rose-500 tracking-tighter">{data.riesgo.tasa_morosidad_capital.toFixed(2)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-rose-500 transition-all duration-1000"
                                        style={{ width: `${Math.min(data.riesgo.tasa_morosidad_capital, 100)}%` }}
                                    />
                                </div>
                                <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-2 italic">
                                    S/ {formatMoney(data.riesgo.capital_vencido)} capital retenido en mora
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/50 mt-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-lg md:text-xl font-black text-white leading-none">{data.riesgo.clientes_en_mora}</p>
                                        <p className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">En Mora</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                        <Users className="w-4 h-4 text-red-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-lg md:text-xl font-black text-white leading-none">{data.riesgo.clientes_castigados}</p>
                                        <p className="text-[8px] md:text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">Castigados</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BLOQUE 3: ACCIONES RÁPIDAS (NUEVO) */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Zap className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                        <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Acciones Rápidas</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Link href="/dashboard/usuarios" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 group hover:border-purple-500/30 transition-all hover:bg-slate-900/60">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Users className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                            </div>
                            <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tighter">Mi Equipo</h3>
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Gestión</p>
                        </Link>

                        <Link href="/dashboard/solicitudes" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 group hover:border-cyan-500/30 transition-all hover:bg-slate-900/60">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <Briefcase className="w-5 h-5 md:w-6 md:h-6 text-cyan-400" />
                            </div>
                            <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tighter">Solicitudes</h3>
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Prospectos</p>
                        </Link>

                        <Link href="/dashboard/renovaciones" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 group hover:border-blue-500/30 transition-all hover:bg-slate-900/60">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <RefreshCw className="w-5 h-5 md:w-6 md:h-6 text-blue-400" />
                            </div>
                            <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tighter">Renovación</h3>
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Re-Ciclo</p>
                        </Link>

                        <Link href="/dashboard/auditoria" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 group hover:border-amber-500/30 transition-all hover:bg-slate-900/60">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-amber-400" />
                            </div>
                            <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tighter">Control</h3>
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Auditoría</p>
                        </Link>
                    </div>
                </div>

                {/* BLOQUE 4: OPORTUNIDADES */}
                {data.oportunidades.recaptables.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
                                <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Oportunidades de Venta</h2>
                            </div>
                            <Badge className="bg-cyan-500/10 text-cyan-400 border-none px-2 py-0 text-[8px] md:text-[10px] font-black">
                                {data.oportunidades.recaptables.length} POTENCIALES
                            </Badge>
                        </div>
                        <div className="bg-slate-950/20 border border-slate-800 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl">
                            <div className="hidden md:grid md:grid-cols-4 gap-4 px-6 py-3 bg-slate-900/40 border-b border-slate-800 text-[9px] uppercase tracking-widest font-black text-slate-500">
                                <div>Cliente</div>
                                <div>Contacto</div>
                                <div>Últ. Pago</div>
                                <div className="text-right">Potencial</div>
                            </div>
                            <div className="divide-y divide-slate-800/50">
                                {data.oportunidades.recaptables.slice(0, 5).map((cliente) => (
                                    <div key={cliente.id} className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-3.5 hover:bg-white/5 transition-colors group">
                                        <div className="font-bold text-slate-200 text-[11px] md:text-xs truncate uppercase">{cliente.nombre}</div>
                                        <div className="text-slate-400 flex items-center gap-2 text-[10px] font-bold">
                                            <Phone className="w-3 h-3 text-cyan-500/50 shrink-0" />
                                            <span className="truncate">{cliente.telefono}</span>
                                        </div>
                                        <div className="text-slate-500 flex items-center gap-2 text-[10px] font-bold uppercase" suppressHydrationWarning>
                                            <Calendar className="w-3 h-3 text-slate-600 shrink-0" />
                                            {cliente.ultimo_pago 
                                                ? new Date(cliente.ultimo_pago).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
                                                : '-'
                                            }
                                        </div>
                                        <div className="text-right font-black text-cyan-400 text-[11px] md:text-xs">
                                            S/ {formatMoney(cliente.monto_ultimo_prestamo)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SIDEBAR: ACCIONES RÁPIDAS */}
            <div className="lg:col-span-1">
                <div className="space-y-4 md:sticky md:top-8">
                    <div className="flex items-center gap-2 px-1">
                        <Zap className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                        <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Acciones Rápidas</h2>
                    </div>

                    <div className="bg-slate-950/20 border border-slate-800 rounded-xl md:rounded-2xl overflow-hidden divide-y divide-slate-800/50 shadow-2xl">
                        {/* Tareas */}
                        <div className="flex flex-col">
                            <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/50">
                                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <AlertCircle className="w-3 h-3 text-amber-500" /> Tareas
                                </span>
                            </div>
                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                                <PendingTasks variant="compact" />
                            </div>
                        </div>

                        {/* Solicitudes */}
                        <div className="flex flex-col">
                            <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/50 flex items-center justify-between">
                                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Briefcase className="w-3 h-3 text-blue-400" /> Solicitudes
                                </span>
                                {data.pendientes.solicitudes.length > 0 && (
                                    <span className="bg-amber-500 w-1.5 h-1.5 rounded-full animate-pulse" />
                                )}
                            </div>
                            <div className="max-h-[160px] overflow-y-auto custom-scrollbar divide-y divide-slate-800/30">
                                {data.pendientes.solicitudes.length === 0 ? (
                                    <div className="px-5 py-4 text-center text-slate-600 text-[10px] italic">Sin pendientes</div>
                                ) : data.pendientes.solicitudes.map(sol => (
                                    <div key={sol.id} className="px-4 py-2.5 hover:bg-white/5 transition-colors group flex items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] md:text-[11px] font-bold text-white truncate uppercase">{sol.cliente.nombres}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-[9px] text-slate-500 font-bold">S/ {formatMoney(sol.monto_solicitado)}</p>
                                                <span className="text-[7px] text-slate-600 font-black uppercase truncate">@ {sol.asesor.nombre_completo}</span>
                                            </div>
                                        </div>
                                        <Link href={`/dashboard/solicitudes/${sol.id}`} className="shrink-0">
                                            <button className="h-6 px-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white text-[9px] font-black uppercase rounded-lg border border-blue-500/20 transition-all">VER</button>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Renovaciones */}
                        <div className="flex flex-col">
                            <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/50">
                                <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3 text-purple-400" /> Renovaciones
                                </span>
                            </div>
                            <div className="max-h-[160px] overflow-y-auto custom-scrollbar divide-y divide-slate-800/30">
                                {data.pendientes.renovaciones.length === 0 ? (
                                    <div className="px-5 py-4 text-center text-slate-600 text-[10px] italic">Sin pendientes</div>
                                ) : data.pendientes.renovaciones.map(ren => (
                                    <div key={ren.id} className="px-4 py-2.5 hover:bg-white/5 transition-colors group flex items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] md:text-[11px] font-bold text-white group-hover:text-purple-400 transition-colors truncate uppercase">{ren.cliente.nombres}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-[9px] text-slate-500 font-bold">S/ {formatMoney(ren.monto_nuevo)}</p>
                                                <span className="text-[7px] text-slate-600 font-black uppercase truncate">@ {ren.asesor.nombre_completo}</span>
                                            </div>
                                        </div>
                                        <Link href={`/dashboard/renovaciones/${ren.id}`} className="shrink-0">
                                            <button className="h-6 px-2 bg-purple-600/10 hover:bg-purple-600 text-purple-400 hover:text-white text-[9px] font-black uppercase rounded-lg border border-purple-500/20 transition-all">VER</button>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
