'use client'

import { cn } from '@/lib/utils'
import { Info, MinusCircle, PlusCircle, TrendingDown, TrendingUp, ShieldCheck, Scale, ArrowUpRight, ArrowDownRight } from 'lucide-react'

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
    if (!data) return null;

    const {
        pagos_puntuales = 0,
        pagos_tardios = 0,
        cuotas_vencidas_actual = 0,
        prestamos_finalizados = 0,
        prestamos_renovados = 0,
        meses_cliente = 0,
        historial_mora = 0,
        historial_cpp = 0,
        refinanciamientos = 0
    } = data;

    const totalPagos = pagos_puntuales + pagos_tardios
    const porcentajePuntual = totalPagos > 0 
        ? Math.round((pagos_puntuales / totalPagos) * 100) 
        : 0

    return (
        <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Pagos Puntuales</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-emerald-400">{pagos_puntuales}</span>
                    <span className="text-slate-500 text-xs">({porcentajePuntual}%)</span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Pagos Tardíos</div>
                <div className="flex items-baseline gap-1">
                    <span className={cn(
                        "text-lg font-bold",
                        pagos_tardios > 0 ? "text-amber-400" : "text-emerald-400"
                    )}>
                        {pagos_tardios}
                    </span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Cuotas Vencidas</div>
                <div className="flex items-baseline gap-1">
                    <span className={cn(
                        "text-lg font-bold",
                        cuotas_vencidas_actual > 0 ? "text-red-400" : "text-emerald-400"
                    )}>
                        {cuotas_vencidas_actual}
                    </span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Préstamos Finalizados</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-blue-400">{prestamos_finalizados}</span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Renovaciones</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-purple-400">{prestamos_renovados}</span>
                </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-400 text-xs mb-1">Antigüedad</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-cyan-400">{meses_cliente}</span>
                    <span className="text-slate-500 text-xs">meses</span>
                </div>
            </div>
            
            {(historial_mora > 0 || historial_cpp > 0 || (refinanciamientos ?? 0) > 0) && (
                <div className="col-span-2 bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                    <div className="text-red-400 text-xs mb-1">⚠️ Historial de Riesgo</div>
                    <div className="flex flex-col gap-1">
                        <div className="flex gap-4">
                            {historial_cpp > 0 && (
                                <span className="text-amber-400">
                                    CPP: <strong>{historial_cpp}</strong> {historial_cpp === 1 ? 'vez' : 'veces'}
                                </span>
                            )}
                            {historial_mora > 0 && (
                                <span className="text-red-400">
                                    Mora: <strong>{historial_mora}</strong> {historial_mora === 1 ? 'vez' : 'veces'}
                                </span>
                            )}
                        </div>
                        {(refinanciamientos ?? 0) > 0 && (
                            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-red-800/40">
                                <span className="text-orange-400 font-semibold">
                                    🔁 Refinanciamientos: <strong>{refinanciamientos}</strong>
                                </span>
                                <span className="text-red-300/60 text-[10px] bg-red-900/40 px-1.5 py-0.5 rounded font-mono">
                                    -{(refinanciamientos ?? 0) * 15} pts
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * Desglose detallado del cálculo del score
 */
export function ScoreBreakdown({ data, currentScore }: { data: any, currentScore: number }) {
    if (!data) return null;

    const {
        pagos_puntuales = 0,
        pagos_tardios = 0,
        historial_mora = 0,
        historial_cpp = 0,
        refinanciamientos = 0,
        prestamos_finalizados = 0
    } = data;

    // Lógica de pesos (Coincidente con la explicación dada al usuario)
    const baseScore = 100;
    const penaltyTardios = (pagos_tardios || 0) * 2;
    const penaltyCpp = (historial_cpp || 0) * 5;
    const penaltyRefin = (refinanciamientos || 0) * 15;
    const penaltyMora = (historial_mora || 0) * 20;
    
    // Bonos (Para equilibrar)
    const bonusFinalizados = (prestamos_finalizados || 0) * 5;

    const items = [
        { label: 'Puntaje Base (Confianza Inicial)', value: baseScore, type: 'base', icon: Info, visible: true },
        { label: `Pagos Tardíos (${pagos_tardios} veces)`, value: -penaltyTardios, type: 'penalty', icon: MinusCircle, visible: (pagos_tardios || 0) > 0 },
        { label: `Historial CPP (${historial_cpp} veces)`, value: -penaltyCpp, type: 'penalty', icon: MinusCircle, visible: (historial_cpp || 0) > 0 },
        { label: `Refinanciamientos (${refinanciamientos} veces)`, value: -penaltyRefin, type: 'penalty', icon: MinusCircle, visible: (refinanciamientos || 0) > 0 },
        { label: `Historial de Mora/Vencidos (${historial_mora} veces)`, value: -penaltyMora, type: 'penalty', icon: MinusCircle, visible: (historial_mora || 0) > 0 },
        { label: `Préstamos Finalizados (${prestamos_finalizados})`, value: bonusFinalizados, type: 'bonus', icon: PlusCircle, visible: (prestamos_finalizados || 0) > 0 },
    ].filter(item => item.visible);

    return (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Detalle del Score</span>
            </div>
            
            <div className="space-y-2">
                {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm py-1.5 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-2 text-slate-400">
                            <item.icon className={cn(
                                "w-3.5 h-3.5",
                                item.type === 'penalty' ? "text-rose-500/70" : 
                                item.type === 'bonus' ? "text-emerald-500/70" : "text-blue-500/70"
                            )} />
                            <span>{item.label}</span>
                        </div>
                        <span className={cn(
                            "font-mono font-bold",
                            item.value > 0 ? "text-emerald-400" : item.value < 0 ? "text-rose-400" : "text-slate-500"
                        )}>
                            {item.value > 0 ? `+${item.value}` : item.value}
                        </span>
                    </div>
                ))}
            </div>

            <div className="pt-2 mt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="text-sm font-bold text-white">Puntaje Final Calculado</span>
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "text-lg font-black font-mono",
                        currentScore >= 60 ? "text-emerald-400" : currentScore >= 40 ? "text-amber-400" : "text-rose-500"
                    )}>
                        {currentScore}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">PTS</span>
                </div>
            </div>
            
            <p className="text-[10px] text-slate-500 italic mt-1 bg-slate-950/30 p-2 rounded border border-white/5">
                * Los descuentos se aplican dinámicamente según el historial consolidado de todos los préstamos vinculados al cliente.
            </p>
        </div>
    );
}

/**
 * Reglas de negocio para límites de monto según Score
 */
export function ScoreLimitRules({ currentScore }: { currentScore: number }) {
    const rules = [
        { min: 80, label: 'Excelente', effect: '+40% aumento', color: 'text-emerald-400', icon: ArrowUpRight, active: currentScore >= 80 },
        { min: 60, label: 'Bueno', effect: '+20% aumento', color: 'text-blue-400', icon: ArrowUpRight, active: currentScore >= 60 && currentScore < 80 },
        { min: 40, label: 'Regular', effect: 'Mantener monto', color: 'text-amber-400', icon: Scale, active: currentScore >= 40 && currentScore < 60 },
        { min: 0, label: 'Bajo', effect: '-20% reducción', color: 'text-rose-400', icon: ArrowDownRight, active: currentScore < 40 },
    ];

    return (
        <div className="space-y-3 mt-4 pt-4 border-t border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Criterios de Monto sugerido</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
                {rules.map((rule, idx) => (
                    <div 
                        key={idx} 
                        className={cn(
                            "flex justify-between items-center px-3 py-2 rounded-lg border transition-all",
                            rule.active 
                                ? "bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-500/5" 
                                : "bg-slate-950/20 border-white/5 opacity-40"
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <rule.icon className={cn("w-3.5 h-3.5", rule.color)} />
                            <span className="text-xs font-semibold text-slate-200">Score {rule.min === 0 ? '< 40' : `≥ ${rule.min}`} ({rule.label})</span>
                        </div>
                        <span className={cn("text-xs font-bold", rule.color)}>
                            {rule.effect}
                        </span>
                    </div>
                ))}
            </div>

            <div className="bg-amber-950/20 border border-amber-900/30 p-2.5 rounded-lg">
                <p className="text-[10px] text-amber-200/70 leading-relaxed">
                    <strong>Nota operativa:</strong> El monto máximo está sujeto al <strong>Límite de Crédito</strong> configurado en el perfil del cliente. El monto mínimo siempre se ajustará para cubrir al menos el <strong>Saldo Pendiente</strong> actual.
                </p>
            </div>
        </div>
    );
}
