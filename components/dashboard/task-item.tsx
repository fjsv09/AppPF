'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Camera, Clock, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TaskItemProps {
    tarea: any
    variant: 'full' | 'compact'
    userId: string | null
    onSelect: (tarea: any) => void
    onAction: (path: string) => void
}

export function TaskItem({ tarea, variant, userId, onSelect, onAction }: TaskItemProps) {
    const isOwner = userId === tarea.asesor_id
    const isEvidenceTask = ['nuevo_prestamo', 'renovacion', 'refinanciacion'].includes(tarea.tipo)

    const typeMap: Record<string, { short: string; full: string; color: string }> = {
        nuevo_prestamo: { short: 'NVO', full: 'Nuevo', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
        renovacion: { short: 'REN', full: 'Renovación', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
        refinanciacion: { short: 'REF', full: 'Refinanc.', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
        auditoria_dirigida: { short: 'AUD', full: 'Auditoría', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
        gestion_asignada: { short: 'GES', full: 'Gestión', color: 'bg-slate-800 text-slate-400 border-slate-700' },
        visita_asignada: { short: 'VIS', full: 'Visita', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }
    }

    const typeLabel = typeMap[tarea.tipo] || { short: 'GES', full: 'Gestión', color: 'bg-slate-800 text-slate-400 border-slate-700' }

    const responsable = tarea.asesor?.nombre_completo || 'Sistema'
    const subtext = tarea.prestamo?.solicitud?.motivo_prestamo || 
                   (tarea.tipo === 'renovacion' ? 'Renovación de Crédito' : 
                   (tarea.tipo === 'refinanciacion' ? 'Refinanciación Mora' : 
                   tarea.notas))
                   
    const motivo = subtext 
        ? `${subtext} · ${responsable}` 
        : `Responsable: ${responsable}`

    if (variant === 'compact') {
        return (
            <div className="px-4 py-2 hover:bg-white/5 transition-colors group flex items-center gap-3">
                <Badge className={cn("h-4 px-1 py-0 text-[7px] uppercase shrink-0 font-black tracking-widest", typeLabel.color)}>
                    {typeLabel.short}
                </Badge>
                
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-white group-hover:text-amber-400 transition-colors truncate uppercase">
                        {tarea.prestamo?.cliente?.nombres || 'Cliente'}
                    </p>
                    <p className="text-[9px] text-slate-500 font-bold leading-tight mt-0.5 line-clamp-1 italic tracking-tight">
                        {motivo}
                    </p>
                </div>

                <div className="shrink-0">
                    {isOwner ? (
                        isEvidenceTask ? (
                            <Button 
                                size="sm"
                                onClick={() => onSelect(tarea)}
                                className="h-7 w-7 p-0 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 rounded-lg transition-all"
                            >
                                <Camera className="w-3.5 h-3.5" />
                            </Button>
                        ) : (
                            <Button 
                                size="sm"
                                onClick={() => onAction(`/dashboard/tareas?tab=${tarea.tipo === 'auditoria_dirigida' ? 'auditoria' : 'gestiones'}`)}
                                className="h-7 px-2 text-[9px] bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 font-black uppercase rounded-lg transition-all flex items-center gap-1.5"
                            >
                                <ClipboardList className="w-3.5 h-3.5" />
                                VER
                            </Button>
                        )
                    ) : (
                        <div className="h-7 w-7 rounded-lg bg-slate-800/30 flex items-center justify-center border border-slate-800" title={`Asignado a: ${tarea.asesor?.nombre_completo}`}>
                            <Clock className="w-3 h-3 text-slate-600" />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 rounded-2xl hover:border-blue-500/30 transition-all group overflow-hidden shadow-xl">
            <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                    <Badge className={cn("h-4 px-2 py-0 text-[8px] font-black uppercase tracking-widest border-none shadow-sm", typeLabel.color)}>
                        {typeLabel.full}
                    </Badge>
                    <div className="text-[9px] font-bold text-slate-500 flex items-center gap-1 uppercase tracking-tighter" suppressHydrationWarning>
                        <Clock className="w-3 h-3" />
                        {new Date(tarea.created_at).toLocaleDateString()}
                    </div>
                </div>
                <CardTitle className="text-sm md:text-base font-black text-white mt-3 truncate uppercase tracking-tight">
                    {tarea.prestamo?.cliente?.nombres || 'Cliente'}
                </CardTitle>
                <CardDescription className="text-slate-500 font-bold text-[10px] md:text-xs leading-tight mt-1 truncate uppercase italic">
                    {motivo}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
                {isOwner ? (
                    isEvidenceTask ? (
                        <Button 
                            onClick={() => onSelect(tarea)}
                            className="w-full h-9 text-[10px] font-black uppercase bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/10 transition-all flex items-center justify-center gap-2"
                        >
                            <Camera className="w-4 h-4" />
                            Subir Evidencia
                        </Button>
                    ) : (
                        <Button 
                            onClick={() => onAction(`/dashboard/tareas?tab=${tarea.tipo === 'auditoria_dirigida' ? 'auditoria' : 'gestiones'}`)}
                            className="w-full h-9 text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2"
                        >
                            <ClipboardList className="w-4 h-4" />
                            Ver {tarea.tipo === 'auditoria_dirigida' ? 'Auditoría' : 'Gestión'}
                        </Button>
                    )
                ) : (
                    <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                            {tarea.asesor?.nombre_completo?.charAt(0) || 'A'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Responsable</p>
                            <p className="text-[10px] font-bold text-slate-300 truncate uppercase mt-0.5">{tarea.asesor?.nombre_completo}</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
