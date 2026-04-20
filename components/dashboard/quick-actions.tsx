'use client'

import { useState, useEffect } from 'react'
import { Zap, Briefcase, RefreshCw, AlertCircle, Landmark } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PendingTasks } from './pending-tasks'
import { formatMoney } from '@/utils/format'
import { cn } from '@/lib/utils'

interface QuickActionsProps {
    rol?: string
}

export function QuickActions({ rol }: QuickActionsProps) {
    const [data, setData] = useState<{solicitudes: any[], renovaciones: any[], cuadres: any[]}>({ solicitudes: [], renovaciones: [], cuadres: [] })
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    const fetchItems = async () => {
        try {
            const res = await fetch('/api/dashboard/quick-actions')
            if (res.ok) {
                const json = await res.json()
                setData(json)
            }
        } catch (error) {
            console.error('Error fetching quick actions data:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchItems()
    }, [])

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
                <Zap className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm md:text-base font-bold text-white tracking-tight">Acciones Rápidas</h2>
            </div>
            
            <div className="bg-slate-950/20 border border-slate-800 rounded-xl md:rounded-2xl overflow-hidden divide-y divide-slate-800/50 shadow-2xl">
                {/* 1. Tareas Section */}
                <div className="flex flex-col">
                    <div className="px-4 py-2 bg-slate-900/40 flex items-center justify-between border-b border-slate-800/50">
                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 tracking-widest">
                            <AlertCircle className="w-3 h-3 text-amber-500" /> Tareas
                        </span>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                        <PendingTasks variant="compact" userRole={rol} />
                    </div>
                </div>

                {/* 2. Solicitudes Section */}
                <div className="flex flex-col">
                    <div className="px-4 py-2 bg-slate-900/40 flex items-center justify-between border-b border-slate-800/50">
                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 tracking-widest">
                            <Briefcase className="w-3 h-3 text-blue-400" /> Solicitudes
                        </span>
                        {data.solicitudes.length > 0 && <span className="bg-amber-500 w-1.5 h-1.5 rounded-full animate-pulse" />}
                    </div>
                    <div className="max-h-[160px] overflow-y-auto divide-y divide-slate-800/30 custom-scrollbar">
                        {loading ? (
                            <div className="h-12 w-full animate-pulse bg-white/5" />
                        ) : data.solicitudes.length === 0 ? (
                            <div className="px-5 py-4 text-center text-slate-600 text-[10px] italic">Sin pendientes</div>
                        ) : data.solicitudes.map((sol: any) => (
                            <div 
                                key={sol.id} 
                                className="px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer group flex items-center gap-3"
                                onClick={() => router.push(`/dashboard/solicitudes/${sol.id}`)}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-[9px] md:text-[10px] font-bold text-white truncate uppercase">
                                        {sol.cliente?.nombres || sol.prospecto_nombres || 'Cliente'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[8px] text-slate-500 font-bold">{formatMoney(sol.monto_solicitado)}</p>
                                        <span className="text-[7px] px-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/10 uppercase font-black">
                                            {sol.estado_solicitud?.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/dashboard/solicitudes/${sol.id}`);
                                        }}
                                        className="h-6 px-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white text-[9px] font-black uppercase rounded-lg border border-blue-500/20 transition-all font-sans"
                                    >
                                        VER
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Renovaciones Section */}
                <div className="flex flex-col">
                    <div className="px-4 py-2 bg-slate-900/40 flex items-center justify-between border-b border-slate-800/50">
                        <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 tracking-widest">
                            <RefreshCw className="w-3 h-3 text-purple-400" /> Renovaciones
                        </span>
                    </div>
                    <div className="max-h-[160px] overflow-y-auto divide-y divide-slate-800/30 custom-scrollbar">
                        {loading ? (
                            <div className="h-12 w-full animate-pulse bg-white/5" />
                        ) : data.renovaciones.length === 0 ? (
                            <div className="px-5 py-4 text-center text-slate-600 text-[10px] italic">Sin pendientes</div>
                        ) : data.renovaciones.map((ren: any) => (
                            <div 
                                key={ren.id} 
                                className="px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer group flex items-center gap-3"
                                onClick={() => router.push(`/dashboard/renovaciones/${ren.id}`)}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-[9px] md:text-[10px] font-bold text-white group-hover:text-purple-400 transition-colors truncate uppercase">
                                        {ren.cliente?.nombres || 'Cliente'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[8px] text-slate-500 font-bold">{formatMoney(ren.monto_solicitado)}</p>
                                        <span className={cn(
                                            "text-[7px] px-1 rounded border uppercase font-black text-center",
                                            ren.estado_solicitud === 'pendiente_supervision' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                            ren.estado_solicitud === 'pre_aprobado' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                            "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                        )}>
                                            {ren.estado_solicitud?.replace('_', ' ') || 'RENOV.'}
                                        </span>
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/dashboard/renovaciones/${ren.id}`);
                                        }}
                                        className="h-6 px-2 bg-purple-600/10 hover:bg-purple-600 text-purple-400 hover:text-white text-[9px] font-black uppercase rounded-lg border border-purple-500/20 transition-all font-sans"
                                    >
                                        VER
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. Cuadres Section (Admin ONLY) */}
                {rol === 'admin' && (
                    <div className="flex flex-col">
                        <div className="px-4 py-2 bg-slate-900/40 flex items-center justify-between border-b border-slate-800/50">
                            <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase flex items-center gap-2 tracking-widest">
                                <Landmark className="w-3 h-3 text-emerald-400" /> Cuadres
                            </span>
                            {data.cuadres?.length > 0 && <span className="bg-emerald-500 w-1.5 h-1.5 rounded-full animate-pulse" />}
                        </div>
                        <div className="max-h-[160px] overflow-y-auto divide-y divide-slate-800/30 custom-scrollbar">
                            {loading ? (
                                <div className="h-12 w-full animate-pulse bg-white/5" />
                            ) : !data.cuadres || data.cuadres.length === 0 ? (
                                <div className="px-5 py-4 text-center text-slate-600 text-[10px] italic">Sin pendientes</div>
                            ) : data.cuadres.map((cuad: any) => (
                                <div 
                                    key={cuad.id} 
                                    className="px-4 py-2.5 hover:bg-white/5 transition-colors cursor-pointer group flex items-center gap-3"
                                    onClick={() => router.push('/dashboard/admin/cuadres')}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] md:text-[11px] font-bold text-white group-hover:text-emerald-400 transition-colors truncate uppercase">
                                            {cuad.perfiles?.nombre_completo || 'Asesor'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <p className="text-[9px] text-slate-500 font-bold">{formatMoney(cuad.saldo_entregado)}</p>
                                            <span className="text-[7px] px-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 uppercase font-black">
                                                PENDIENTE
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push('/dashboard/admin/cuadres');
                                            }}
                                            className="h-6 px-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white text-[9px] font-black uppercase rounded-lg border border-emerald-500/20 transition-all font-sans"
                                        >
                                            VER
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
