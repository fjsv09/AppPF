'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Users, History, AlertTriangle, Activity, UserCheck, Zap, Lock, Banknote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface DrilldownDrawerProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    type: string | null
    asesorId: string | null
    supervisorId: string | null
}

export function DrilldownDrawer({ isOpen, onOpenChange, type, asesorId, supervisorId }: DrilldownDrawerProps) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen && type) {
            fetchData()
        }
    }, [isOpen, type, asesorId, supervisorId])

    const fetchData = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            params.append('type', type!)
            if (asesorId) params.append('asesorId', asesorId)
            if (supervisorId) params.append('supervisorId', supervisorId)
            
            const res = await fetch(`/api/dashboard/drilldown?${params.toString()}`)
            const json = await res.json()
            setData(json)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const getTitle = () => {
        switch (type) {
            case 'vencidos': return 'Préstamos Vencidos'
            case 'critica': return 'Alerta Crítica (Mora)'
            case 'advert': return 'En Advertencia'
            case 'aptos': return 'Aptos para Crédito'
            case 'renovaciones': return 'Renovaciones del Mes'
            case 'vigente': return 'Cartera Vigente'
            case 'nuevos': return 'Clientes Nuevos'
            case 'total': return 'Total Clientes'
            case 'bloqueados': return 'Clientes Bloqueados'
            default: return 'Detalle'
        }
    }

    const getIcon = () => {
        switch (type) {
            case 'vencidos': return <History className="w-5 h-5 text-slate-400" />
            case 'critica': return <AlertTriangle className="w-5 h-5 text-red-500" />
            case 'advert': return <Activity className="w-5 h-5 text-orange-400" />
            case 'aptos': return <Zap className="w-5 h-5 text-emerald-400" />
            case 'renovaciones': return <Banknote className="w-5 h-5 text-purple-400" />
            case 'vigente': return <UserCheck className="w-5 h-5 text-blue-400" />
            case 'nuevos': return <Users className="w-5 h-5 text-emerald-400" />
            case 'total': return <Users className="w-5 h-5 text-blue-500" />
            case 'bloqueados': return <Lock className="w-5 h-5 text-rose-500" />
            default: return <Users className="w-5 h-5" />
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l border-slate-800 p-0 overflow-hidden flex flex-col">
                <SheetHeader className="p-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                            {getIcon()}
                        </div>
                        <div>
                            <SheetTitle className="text-white text-lg font-black uppercase tracking-tight">{getTitle()}</SheetTitle>
                            <SheetDescription className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                                {loading ? 'Cargando registros...' : `${data.length} registros encontrados`}
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="p-4 rounded-xl border border-slate-800 bg-slate-900/20 space-y-2">
                                <Skeleton className="h-4 w-3/4 bg-slate-800" />
                                <Skeleton className="h-3 w-1/2 bg-slate-800" />
                            </div>
                        ))
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                                <Users className="w-8 h-8 opacity-20" />
                            </div>
                            <p className="text-sm font-bold uppercase tracking-widest opacity-50">No hay datos para mostrar</p>
                        </div>
                    ) : (
                        data.map((item, idx) => (
                            <div 
                                key={item.id || idx} 
                                className="group p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-600 transition-all cursor-default"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="text-sm font-black text-white group-hover:text-blue-400 transition-colors uppercase truncate max-w-[200px]">
                                        {item.cliente || item.nombres}
                                    </h4>
                                    {item.saldo !== undefined && (
                                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 font-black text-[10px]">
                                            S/ {item.saldo.toFixed(2)}
                                        </Badge>
                                    )}
                                    {item.progreso !== undefined && (
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-black text-[10px]">
                                            {item.progreso.toFixed(0)}% PAGADO
                                        </Badge>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    {item.monto && <div>Monto: <span className="text-slate-300">S/ {item.monto}</span></div>}
                                    {item.atraso !== undefined && <div>Atrasos: <span className="text-orange-400">{item.atraso} cuotas</span></div>}
                                    {item.fecha && <div>Fecha: <span className="text-slate-300">{new Date(item.fecha).toLocaleDateString()}</span></div>}
                                    {item.telefono && <div>Tel: <span className="text-blue-400">{item.telefono}</span></div>}
                                    {item.estadoMora && <div>Estado: <span className={item.estadoMora === 'CRÍTICO' ? 'text-red-500' : 'text-orange-400'}>{item.estadoMora}</span></div>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
