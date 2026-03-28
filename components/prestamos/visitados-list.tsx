'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Badge } from '@/components/ui/badge'
import { MapPin, Clock, CheckCircle2, XCircle, Navigation } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Visita {
    id: string
    fecha_inicio: string
    fecha_fin: string | null
    lat_ini: number
    lon_ini: number
    lat_fin: number | null
    lon_fin: number | null
    cumple_minimo: boolean
    estado: string
    asesor_id: string
    notas: string | null
    cuota_id: string
}

export function VisitadosList({ prestamoId, userRole }: { prestamoId: string, userRole?: string }) {
    const [visitas, setVisitas] = useState<Visita[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        if (userRole === 'asesor') {
            setLoading(false)
            return
        }

        async function fetchVisitas() {
            const { data, error } = await supabase
                .from('visitas_terreno')
                .select('*')
                .eq('prestamo_id', prestamoId)
                .order('fecha_inicio', { ascending: false })
            
            if (!error && data) {
                setVisitas(data)
            }
            setLoading(false)
        }
        fetchVisitas()
    }, [prestamoId, userRole])

    if (userRole === 'asesor') return null
    if (loading) return <div className="p-8 text-center text-slate-500 font-medium animate-pulse">Cargando visitas...</div>

    if (visitas.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/20 rounded-xl border border-dashed border-slate-800 m-4">
                <MapPin className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-xs font-medium">No hay registros de visitas en terreno.</p>
            </div>
        )
    }

    return (
        <div className="space-y-3 p-3">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2 px-1">
                <MapPin className="w-3 h-3 text-indigo-500" /> Historial de Visitas
            </h3>
            
            <div className="flex flex-col gap-2">
                {visitas.map((visita) => (
                    <div key={visita.id} className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-2.5 flex items-center gap-3 group hover:border-indigo-500/30 transition-colors">
                        {/* Status Icon */}
                        <div className={cn(
                            "p-1.5 rounded-md shrink-0 border",
                            visita.estado === 'cancelada' 
                                ? 'bg-slate-800/50 border-slate-700 text-slate-500'
                                : visita.cumple_minimo 
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        )}>
                            {visita.estado === 'cancelada' ? <XCircle className="w-4 h-4" /> : 
                             visita.cumple_minimo ? <CheckCircle2 className="w-4 h-4" /> : <Navigation className="w-4 h-4 rotate-45" />}
                        </div>

                        {/* Info Column */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-white font-bold text-[12px] truncate">
                                    {format(new Date(visita.fecha_inicio), "d MMM, HH:mm", { locale: es })}
                                </span>
                                <Badge variant="outline" className={cn(
                                    "px-1.5 py-0 text-[8px] font-black tracking-tight rounded-sm uppercase shrink-0 border-0",
                                    visita.estado === 'cancelada'
                                        ? 'bg-red-500/10 text-red-400'
                                        : visita.cumple_minimo 
                                            ? 'bg-emerald-500/10 text-emerald-400' 
                                            : 'bg-amber-500/10 text-amber-500'
                                )}>
                                    {visita.estado === 'cancelada' ? 'RESETEO' : visita.cumple_minimo ? 'OK' : 'FLASH'}
                                </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 leading-none">
                                <span className="flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    {format(new Date(visita.fecha_inicio), 'HH:mm')}
                                    {visita.fecha_fin && `-${format(new Date(visita.fecha_fin), 'HH:mm')}`}
                                </span>
                                <span className="w-1 h-1 rounded-full bg-slate-800" />
                                <span className="font-medium text-slate-400">
                                    {visita.estado === 'cancelada' 
                                        ? 'Visita anulada'
                                        : visita.fecha_fin 
                                            ? `${Math.floor((new Date(visita.fecha_fin).getTime() - new Date(visita.fecha_inicio).getTime()) / 60000)} min`
                                            : 'En curso'}
                                </span>
                                {visita.estado !== 'cancelada' && (
                                    <>
                                        <span className="hidden sm:inline w-1 h-1 rounded-full bg-slate-800" />
                                        <span className="hidden sm:inline font-mono text-[9px] opacity-60">
                                            {visita.lat_ini.toFixed(4)}, {visita.lon_ini.toFixed(4)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>


                        {/* Action Button */}
                        <a 
                            href={`https://www.google.com/maps?q=${visita.lat_ini},${visita.lon_ini}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="h-8 w-8 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-md transition-all flex items-center justify-center shrink-0 border border-blue-600/20"
                            title="Ver en Google Maps"
                        >
                            <Navigation className="w-4 h-4" />
                        </a>
                    </div>
                ))}
            </div>
        </div>
    )
}
