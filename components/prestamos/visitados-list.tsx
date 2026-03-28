'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Badge } from '@/components/ui/badge'
import { MapPin, Clock, CheckCircle2, XCircle, User } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

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

export function VisitadosList({ prestamoId }: { prestamoId: string }) {
    const [visitas, setVisitas] = useState<Visita[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchVisitas() {
            const { data, error } = await supabase
                .from('visitas_terreno')
                .select('*')
                .eq('prestamo_id', prestamoId)
                .order('fecha_inicio', { ascending: false })
            
            if (!error && data) {
                setVisitas(data)
            }
            setLoading(true) // Wait, setLoading(false)
            setLoading(false)
        }
        fetchVisitas()
    }, [prestamoId])

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando visitas...</div>

    if (visitas.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <MapPin className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">No hay registros de visitas en terreno para este préstamo.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4 p-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> Historial de Visitas GPS
            </h3>
            
            <div className="grid gap-3">
                {visitas.map((visita) => (
                    <div key={visita.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full shrink-0 ${visita.cumple_minimo ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                                {visita.cumple_minimo ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-amber-500" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-bold text-sm">
                                        {format(new Date(visita.fecha_inicio), "d 'de' MMMM, HH:mm", { locale: es })}
                                    </span>
                                    <Badge variant="outline" className={visita.cumple_minimo ? 'text-emerald-400 border-emerald-500/20' : 'text-amber-400 border-amber-500/20'}>
                                        {visita.cumple_minimo ? 'TIEMPO CUMPLIDO' : 'TIEMPO INSUFICIENTE'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-400">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Inició: {format(new Date(visita.fecha_inicio), 'HH:mm')} 
                                        {visita.fecha_fin && ` - Fin: ${format(new Date(visita.fecha_fin), 'HH:mm')}`}
                                    </span>
                                    {visita.fecha_fin && (
                                        <span className="flex items-center gap-1">
                                            Duración: {Math.round((new Date(visita.fecha_fin).getTime() - new Date(visita.fecha_inicio).getTime()) / 60000)} min
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-right hidden md:block">
                                <p className="text-[10px] uppercase font-black text-slate-500">Coordenadas</p>
                                <p className="text-[11px] font-mono text-slate-300">
                                    {visita.lat_ini.toFixed(5)}, {visita.lon_ini.toFixed(5)}
                                </p>
                            </div>
                            <a 
                                href={`https://www.google.com/maps?q=${visita.lat_ini},${visita.lon_ini}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors"
                            >
                                <Navigation className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

import { Navigation } from 'lucide-react'
