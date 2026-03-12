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
    ShieldAlert
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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
}

// Formato consistente para evitar hydration errors
const formatMoney = (value: number): string => {
    return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function AdminKPIs() {
    const [data, setData] = useState<KPIsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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
        
        // Disparador silencioso para generación de tareas de auditoría dirigida (Cron Job Interno)
        // Se ejecuta cada vez que el admin carga el dashboard, la lógica del API evita duplicados
        fetch('/api/auditoria/generar-tareas', { method: 'POST' })
            .catch(err => console.error("Error silencioso en cron:", err))
    }, [])

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-32 bg-slate-800/50 rounded-2xl" />
                <div className="h-24 bg-slate-800/50 rounded-2xl" />
                <div className="h-24 bg-slate-800/50 rounded-2xl" />
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
        <div className="space-y-6">
            {/* ============================================ */}
            {/* BLOQUE 1: FINANZAS */}
            {/* ============================================ */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold text-white">Finanzas</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Capital Activo */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                        <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Banknote className="w-16 h-16 text-emerald-500" />
                        </div>
                        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-wider mb-1">Capital Activo Total</p>
                        <h3 className="text-2xl font-bold text-white">${formatMoney(data.finanzas.capital_activo_total)}</h3>
                        <p className="text-[10px] text-slate-500 mt-1">Saldo de préstamos en curso</p>
                    </div>
 
                    {/* Ganancia Mes */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 relative overflow-hidden group hover:border-blue-500/30 transition-all">
                        <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                            <TrendingUp className="w-16 h-16 text-blue-500" />
                        </div>
                        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-wider mb-1">Ganancia Realizada (Mes)</p>
                        <h3 className="text-2xl font-bold text-emerald-400">${formatMoney(data.finanzas.ganancia_realizada_mes)}</h3>
                        <p className="text-[10px] text-slate-500 mt-1">Solo interés cobrado</p>
                    </div>
                </div>
            </div>

            {/* ============================================ */}
            {/* BLOQUE 2: RIESGO */}
            {/* ============================================ */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                    <h2 className="text-lg font-bold text-white">Riesgo</h2>
                </div>
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6">
                    {/* Barra de Morosidad */}
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] text-slate-400">Tasa de Morosidad</span>
                            <span className="text-base font-bold text-rose-400">{data.riesgo.tasa_morosidad_capital.toFixed(2)}%</span>
                        </div>
                        <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-rose-600 to-rose-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(data.riesgo.tasa_morosidad_capital, 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            ${formatMoney(data.riesgo.capital_vencido)} de capital retenido en mora
                        </p>
                    </div>

                    {/* Indicadores */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-white">{data.riesgo.clientes_en_mora}</p>
                                <p className="text-[10px] text-slate-500">Clientes en mora</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-red-500/10 rounded-lg border border-red-500/20">
                                <Users className="w-3.5 h-3.5 text-red-400" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-white">{data.riesgo.clientes_castigados}</p>
                                <p className="text-[10px] text-slate-500">Castigados</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================ */}
            {/* BLOQUE 3: OPERATIVIDAD */}
            {/* ============================================ */}
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold text-white">Operatividad</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Renovaciones */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4">
                        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-wider mb-2">Renovaciones del Mes</p>
                        <div className="flex items-end gap-3">
                            <div>
                                <p className="text-2xl font-bold text-white">{data.operatividad.renovaciones_mes.cantidad}</p>
                                <p className="text-[10px] text-slate-500">préstamos</p>
                            </div>
                            <div className="pb-0.5">
                                <Badge className="h-4 px-1.5 py-0 text-[9px] bg-purple-900/30 text-purple-400 border-purple-800/50">
                                    ${formatMoney(data.operatividad.renovaciones_mes.volumen)}
                                </Badge>
                            </div>
                        </div>
                    </div>
 
                    {/* Clientes Activos */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4">
                        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-wider mb-2">Clientes con Deuda Activa</p>
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                <UserCheck className="w-4 h-4 text-blue-400" />
                            </div>
                            <p className="text-2xl font-bold text-white">{data.operatividad.total_clientes_activos}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================ */}
            {/* BLOQUE 4: OPORTUNIDADES */}
            {/* ============================================ */}
            {data.oportunidades.recaptables.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Phone className="w-5 h-5 text-cyan-400" />
                        <h2 className="text-lg font-bold text-white">Oportunidades - Clientes Recaptables</h2>
                        <Badge className="bg-cyan-900/30 text-cyan-400 border-cyan-800/50 ml-2">
                            {data.oportunidades.recaptables.length}
                        </Badge>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                        {/* Table Header */}
                        <div className="hidden md:grid md:grid-cols-4 gap-4 px-6 py-3 bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                            <div>Cliente</div>
                            <div>Teléfono</div>
                            <div>Último Pago</div>
                            <div className="text-right">Monto Préstamo</div>
                        </div>
                        {/* Table Body */}
                        <div className="divide-y divide-slate-800/50">
                            {data.oportunidades.recaptables.slice(0, 10).map((cliente) => (
                                <div key={cliente.id} className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-3 hover:bg-slate-800/30 transition-colors">
                                    <div className="font-medium text-slate-200">{cliente.nombre}</div>
                                    <div className="text-slate-400 flex items-center gap-2">
                                        <Phone className="w-3 h-3" />
                                        {cliente.telefono}
                                    </div>
                                    <div className="text-slate-500 flex items-center gap-2">
                                        <Calendar className="w-3 h-3" />
                                        {cliente.ultimo_pago 
                                            ? new Date(cliente.ultimo_pago).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
                                            : '-'
                                        }
                                    </div>
                                    <div className="text-right font-bold text-emerald-400">
                                        ${formatMoney(cliente.monto_ultimo_prestamo)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
