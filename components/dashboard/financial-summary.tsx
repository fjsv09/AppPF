'use client'

import { useState, useEffect } from 'react'
import { 
    Wallet, 
    TrendingUp, 
    Zap, 
    AlertCircle, 
    Briefcase
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface FinancialSummaryData {
    capital_total_activo_con_interes: number
    capital_total_activo_sin_interes: number
    ganancia_total: number
    ganancia_mes: number
    gastos_mes: number
}

interface FinancialSummaryProps {
    asesorId?: string | null
    supervisorId?: string | null
}

export function FinancialSummary({ asesorId, supervisorId }: FinancialSummaryProps) {
    const [data, setData] = useState<FinancialSummaryData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const formatMoney = (value: number = 0): string => {
        return value.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    const fetchSummary = async () => {
        try {
            setLoading(true)
            let url = '/api/dashboard/admin/kpis'
            const params = new URLSearchParams()
            if (asesorId) params.append('asesorId', asesorId)
            if (supervisorId) params.append('supervisorId', supervisorId)
            
            const queryString = params.toString()
            if (queryString) url += `?${queryString}`

            const res = await fetch(url)
            if (!res.ok) throw new Error('Error al cargar resumen financiero')
            const json = await res.json()
            setData(json.resumen_financiero)
            setError(null)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSummary()
    }, [asesorId, supervisorId])

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
                <div className="h-24 bg-slate-800/50 rounded-2xl" />
                <div className="h-24 bg-slate-800/50 rounded-2xl" />
                <div className="h-24 bg-slate-800/50 rounded-2xl" />
            </div>
        )
    }

    if (error || !data) return null

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                    <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Resumen Financiero</h2>
                </div>
                <Badge variant="outline" className="text-[8px] md:text-[10px] border-amber-500/30 text-amber-500 uppercase font-black px-1.5 py-0">
                    Admin
                </Badge>
            </div>
            
            {/* Main Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
                {/* Capital Total Activo (Con Interés) - Full width on smallest mobile if desired, or 2 col */}
                <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-amber-500/30 transition-all group">
                   <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                     <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest">Cap. Activo (C+I)</p>
                     <TrendingUp className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-400 opacity-70 group-hover:opacity-100" />
                   </div>
                   <h3 className="text-lg md:text-xl font-black text-white">S/ {formatMoney(data.capital_total_activo_con_interes)}</h3>
                   <p className="hidden md:block text-[9px] text-slate-500 mt-1 uppercase tracking-tight font-bold">Cobranza Pendiente</p>
                </div>

                {/* Capital Total Activo (Sin Interés) */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-emerald-500/30 transition-all group cursor-help">
                   <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                     <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest">Cap. Neto</p>
                     <Wallet className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-400 opacity-70 group-hover:opacity-100" />
                   </div>
                   <h3 className="text-lg md:text-xl font-black text-white">S/ {formatMoney(data.capital_total_activo_sin_interes)}</h3>
                </div>

                {/* Ganancia Total Histórica */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl p-3 md:p-4 hover:border-blue-500/30 transition-all group">
                   <div className="flex justify-between items-start mb-1 md:mb-2 text-slate-400">
                     <p className="font-medium text-[8px] md:text-[9px] uppercase tracking-widest">Gan. Total</p>
                     <Zap className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400 opacity-70 group-hover:opacity-100" />
                   </div>
                   <h3 className="text-lg md:text-xl font-black text-emerald-400">S/ {formatMoney(data.ganancia_total)}</h3>
                </div>
            </div>

            {/* Monthly Details Grid */}
            <div className="grid grid-cols-2 gap-2 md:gap-4">
                {/* Ganancia Mes */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl md:rounded-2xl p-3 md:p-4 flex items-center justify-between group hover:bg-slate-900/60 transition-colors">
                   <div className="min-w-0">
                      <p className="text-slate-500 font-bold text-[8px] md:text-[9px] uppercase tracking-[0.15em] mb-0.5 md:mb-1 truncate">Ganancia Mes</p>
                      <div className="flex flex-wrap items-baseline gap-1 md:gap-2">
                        <span className="text-base md:text-2xl font-black text-white">S/ {formatMoney(data.ganancia_mes)}</span>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[6px] md:text-[8px] h-3 md:h-4 px-1 font-black">IN</Badge>
                      </div>
                   </div>
                </div>

                {/* Gastos Mes */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl md:rounded-2xl p-3 md:p-4 flex items-center justify-between group hover:bg-slate-900/60 transition-colors">
                   <div className="min-w-0">
                      <p className="text-slate-500 font-bold text-[8px] md:text-[9px] uppercase tracking-[0.15em] mb-0.5 md:mb-1 truncate">Gastos Mes</p>
                      <div className="flex flex-wrap items-baseline gap-1 md:gap-2">
                        <span className="text-base md:text-2xl font-black text-rose-500">S/ {formatMoney(data.gastos_mes)}</span>
                        <Badge className="bg-rose-500/20 text-rose-400 border-none text-[6px] md:text-[8px] h-3 md:h-4 px-1 font-black">OUT</Badge>
                      </div>
                   </div>
                </div>
            </div>
        </div>
    )
}
