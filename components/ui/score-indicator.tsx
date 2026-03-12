'use client'

import { cn } from '@/lib/utils'

interface ScoreIndicatorProps {
    score: number
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    className?: string
}

export function ScoreIndicator({ score, size = 'md', showLabel = true, className }: ScoreIndicatorProps) {
    // Determinar color basado en score
    const getScoreColor = (s: number) => {
        if (s >= 80) return { bg: 'from-emerald-500 to-green-400', text: 'text-emerald-400', label: 'Excelente' }
        if (s >= 60) return { bg: 'from-blue-500 to-cyan-400', text: 'text-blue-400', label: 'Bueno' }
        if (s >= 40) return { bg: 'from-amber-500 to-yellow-400', text: 'text-amber-400', label: 'Regular' }
        return { bg: 'from-red-500 to-rose-400', text: 'text-red-400', label: 'Bajo' }
    }

    const colors = getScoreColor(score)
    
    // Tamaños
    const sizes = {
        sm: { container: 'w-16 h-16', text: 'text-lg', label: 'text-[10px]' },
        md: { container: 'w-24 h-24', text: 'text-2xl', label: 'text-xs' },
        lg: { container: 'w-32 h-32', text: 'text-4xl', label: 'text-sm' }
    }

    const s = sizes[size]

    // Calcular el porcentaje para el arco (270 grados max)
    const percentage = Math.min(100, Math.max(0, score))
    const strokeDasharray = 251.2 // Circunferencia (2 * PI * 40)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * percentage / 100)

    return (
        <div className={cn('flex flex-col items-center gap-1', className)}>
            <div className={cn('relative', s.container)}>
                {/* Background circle */}
                <svg 
                    className="absolute inset-0 w-full h-full -rotate-90"
                    viewBox="0 0 100 100"
                >
                    {/* Track */}
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-slate-800"
                    />
                    {/* Progress */}
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        className={cn('transition-all duration-500')}
                        style={{
                            stroke: `url(#scoreGradient-${score})`,
                            strokeDasharray: strokeDasharray,
                            strokeDashoffset: strokeDashoffset
                        }}
                    />
                    <defs>
                        <linearGradient id={`scoreGradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            {score >= 80 && (
                                <>
                                    <stop offset="0%" stopColor="#10b981" />
                                    <stop offset="100%" stopColor="#4ade80" />
                                </>
                            )}
                            {score >= 60 && score < 80 && (
                                <>
                                    <stop offset="0%" stopColor="#3b82f6" />
                                    <stop offset="100%" stopColor="#22d3ee" />
                                </>
                            )}
                            {score >= 40 && score < 60 && (
                                <>
                                    <stop offset="0%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#facc15" />
                                </>
                            )}
                            {score < 40 && (
                                <>
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="100%" stopColor="#fb7185" />
                                </>
                            )}
                        </linearGradient>
                    </defs>
                </svg>
                
                {/* Score number */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn('font-bold', s.text, colors.text)}>
                        {score}
                    </span>
                </div>
            </div>
            
            {showLabel && (
                <span className={cn('font-medium', s.label, colors.text)}>
                    {colors.label}
                </span>
            )}
        </div>
    )
}

// Componente de resumen de comportamiento
interface BehaviorSummaryProps {
    data: {
        pagos_puntuales: number
        pagos_tardios: number
        cuotas_vencidas_actual: number
        prestamos_finalizados: number
        prestamos_renovados: number
        meses_cliente: number
        historial_mora: number
        historial_cpp: number
        refinanciamientos?: number  // Nuevo campo: refinanciamientos directos
    }
}

export function BehaviorSummary({ data }: BehaviorSummaryProps) {
    const totalPagos = data.pagos_puntuales + data.pagos_tardios
    const porcentajePuntual = totalPagos > 0 
        ? Math.round((data.pagos_puntuales / totalPagos) * 100) 
        : 0

    return (
        <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Pagos Puntuales</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-emerald-400">{data.pagos_puntuales}</span>
                    <span className="text-slate-500 text-xs">({porcentajePuntual}%)</span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Pagos Tardíos</div>
                <div className="flex items-baseline gap-1">
                    <span className={cn(
                        "text-lg font-bold",
                        data.pagos_tardios > 0 ? "text-amber-400" : "text-emerald-400"
                    )}>
                        {data.pagos_tardios}
                    </span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Cuotas Vencidas</div>
                <div className="flex items-baseline gap-1">
                    <span className={cn(
                        "text-lg font-bold",
                        data.cuotas_vencidas_actual > 0 ? "text-red-400" : "text-emerald-400"
                    )}>
                        {data.cuotas_vencidas_actual}
                    </span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Préstamos Finalizados</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-blue-400">{data.prestamos_finalizados}</span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Renovaciones</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-purple-400">{data.prestamos_renovados}</span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Antigüedad</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-cyan-400">{data.meses_cliente}</span>
                    <span className="text-slate-500 text-xs">meses</span>
                </div>
            </div>
            
            {(data.historial_mora > 0 || data.historial_cpp > 0 || (data.refinanciamientos ?? 0) > 0) && (
                <div className="col-span-2 bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                    <div className="text-red-400 text-xs mb-1">⚠️ Historial de Riesgo</div>
                    <div className="flex flex-col gap-1">
                        <div className="flex gap-4">
                            {data.historial_cpp > 0 && (
                                <span className="text-amber-400">
                                    CPP: <strong>{data.historial_cpp}</strong> {data.historial_cpp === 1 ? 'vez' : 'veces'}
                                </span>
                            )}
                            {data.historial_mora > 0 && (
                                <span className="text-red-400">
                                    Mora: <strong>{data.historial_mora}</strong> {data.historial_mora === 1 ? 'vez' : 'veces'}
                                </span>
                            )}
                        </div>
                        {(data.refinanciamientos ?? 0) > 0 && (
                            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-red-800/40">
                                <span className="text-orange-400 font-semibold">
                                    🔁 Refinanciamientos: <strong>{data.refinanciamientos}</strong>
                                </span>
                                <span className="text-red-300/60 text-[10px] bg-red-900/40 px-1.5 py-0.5 rounded font-mono">
                                    -{(data.refinanciamientos ?? 0) * 15} pts
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
