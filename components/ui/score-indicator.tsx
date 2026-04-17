'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Info, MinusCircle, PlusCircle, TrendingDown, TrendingUp, ShieldCheck, Scale, ArrowUpRight, ArrowDownRight, Calculator } from 'lucide-react'
import { calculateRenovationAdjustment } from '@/lib/financial-logic'

interface ScoreIndicatorProps {
    score: number
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    className?: string
}

export function ScoreIndicator({ score, size = 'md', showLabel = true, className }: ScoreIndicatorProps) {
    // Determinar color basado en score
    const getScoreColor = (s: number) => {
        if (s >= 90) return { bg: 'from-emerald-500 to-green-400', text: 'text-emerald-400', label: 'Excelente' }
        if (s >= 75) return { bg: 'from-blue-500 to-cyan-400', text: 'text-blue-400', label: 'Muy Bueno' }
        if (s >= 60) return { bg: 'from-blue-500 to-cyan-400', text: 'text-blue-400', label: 'Bueno' }
        if (s >= 40) return { bg: 'from-amber-500 to-yellow-400', text: 'text-amber-400', label: 'Regular' }
        return { bg: 'from-red-500 to-rose-400', text: 'text-red-400', label: 'Riesgo' }
    }

    const colors = getScoreColor(score)
    
    // Tamaños
    const sizes = {
        sm: { container: 'w-16 h-16', text: 'text-lg', label: 'text-[10px]' },
        md: { container: 'w-24 h-24', text: 'text-2xl', label: 'text-xs' },
        lg: { container: 'w-32 h-32', text: 'text-4xl', label: 'text-sm' }
    }

    const s = sizes[size]

    // Calcular el porcentaje para el arco
    const percentage = Math.min(100, Math.max(0, score))
    const strokeDasharray = 251.2 // Circunferencia (2 * PI * 40)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * percentage / 100)

    return (
        <div className={cn('flex flex-col items-center gap-1.5', className)}>
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
                        strokeWidth="6"
                        className="text-slate-800/60"
                    />
                    {/* Progress */}
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        strokeWidth="7"
                        strokeLinecap="round"
                        className={cn('transition-all duration-1000 ease-out')}
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
                                    <stop offset="100%" stopColor="#34d399" />
                                </>
                            )}
                            {score >= 60 && score < 80 && (
                                <>
                                    <stop offset="0%" stopColor="#3b82f6" />
                                    <stop offset="100%" stopColor="#60a5fa" />
                                </>
                            )}
                            {score >= 40 && score < 60 && (
                                <>
                                    <stop offset="0%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#fbbf24" />
                                </>
                            )}
                            {score < 40 && (
                                <>
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="100%" stopColor="#f87171" />
                                </>
                            )}
                        </linearGradient>
                    </defs>
                </svg>
                
                {/* Score number */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn('font-black tracking-tighter leading-none', s.text, colors.text)}>
                        {score}
                    </span>
                    {size !== 'sm' && (
                        <span className={cn('font-bold uppercase tracking-widest opacity-60 -mt-0.5', s.label)}>
                            pts
                        </span>
                    )}
                </div>
            </div>
            
            {showLabel && (
                <span className={cn('font-black uppercase tracking-widest mt-1', s.label, colors.text)}>
                    {colors.label}
                </span>
            )}
        </div>
    )
}

interface ScoreDetailItemProps {
    label: string
    value: number
    type: 'increase' | 'penalty' | 'base'
    icon?: any
}

function ScoreDetailItem({ label, value, type, icon: Icon = Info }: ScoreDetailItemProps) {
    const isPenalty = type === 'penalty';
    const isIncrease = type === 'increase';
    
    return (
        <div className="flex justify-between items-center text-sm py-1.5 border-b border-white/5 last:border-0 group">
            <div className="flex items-center gap-2 text-slate-400 group-hover:text-slate-200 transition-colors">
                <Icon className={cn(
                    "w-3.5 h-3.5",
                    isPenalty ? "text-rose-500/70" : 
                    isIncrease ? "text-emerald-500/70" : "text-blue-500/70"
                )} />
                <span className="text-[11px] sm:text-xs">{label}</span>
            </div>
            <span className={cn(
                "font-mono font-bold text-xs",
                value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-slate-500"
            )}>
                {value > 0 ? `+${value}` : value}
            </span>
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
 * Desglose detallado del cálculo del score (Para Préstamo Individual)
 */
export function ScoreBreakdown({ loanScore }: { loanScore: any }) {
    if (!loanScore) return null;

    const { score, increases, penalties, details = [] } = loanScore;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Salud del Préstamo</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Aumentos</span>
                        <span className="text-xs font-bold text-emerald-400">+{increases}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Castigos</span>
                        <span className="text-xs font-bold text-rose-400">-{penalties}</span>
                    </div>
                </div>
            </div>
            
            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                <ScoreDetailItem label="Puntaje Base" value={100} type="base" icon={ShieldCheck} />
                {details.map((item: any, idx: number) => (
                    <ScoreDetailItem 
                        key={idx} 
                        label={item.label} 
                        value={item.type === 'penalty' ? -item.value : item.value} 
                        type={item.type} 
                        icon={item.type === 'penalty' ? MinusCircle : PlusCircle} 
                    />
                ))}
            </div>

            <div className="pt-2 mt-2 border-t border-slate-700 flex justify-between items-center bg-slate-900/40 p-3 rounded-xl border border-white/5">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Score Salud</span>
                    <span className="text-[9px] text-slate-500 italic">Cálculo dinámico individual</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "text-2xl font-black font-mono tracking-tighter",
                        score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-500"
                    )}>
                        {score}
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded font-black">PTS</span>
                </div>
            </div>
        </div>
    );
}

/**
 * Reglas de negocio para límites de monto según Score de Salud y Reputación
 */
export function ScoreLimitRules({ healthScore, reputationScore }: { healthScore: number, reputationScore: number }) {
    // Cálculo centralizado
    const adjustment = calculateRenovationAdjustment(healthScore, reputationScore, 100); // Usamos 100 para obtener porcentajes base
    
    const { baseIncreasePct, reputationBonusPct, totalPotentialPct, detalles } = adjustment;

    const icons: Record<string, any> = {
        'Salud': baseIncreasePct > 0 ? TrendingUp : baseIncreasePct < 0 ? TrendingDown : Scale,
        'Reputación': ShieldCheck
    };

    return (
        <div className="space-y-3 mt-4 pt-4 border-t border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Capacidad de Renovación</span>
            </div>

            <div className="bg-slate-950/40 rounded-xl p-4 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                    <Scale className="w-12 h-12" />
                </div>
                
                <div className="flex justify-between items-center mb-3 relative z-10">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ajuste Recomendado</span>
                    <Badge className={cn(
                        "text-xs font-black px-2 py-0.5",
                        totalPotentialPct > 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : 
                        totalPotentialPct === 0 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : 
                        "bg-rose-500/20 text-rose-400 border-rose-500/30"
                    )}>
                        {totalPotentialPct > 0 ? `+${totalPotentialPct}%` : totalPotentialPct === 0 ? 'MANTENER' : `${totalPotentialPct}%`}
                    </Badge>
                </div>

                <div className="space-y-2 relative z-10">
                    {detalles?.map((rule, idx) => (
                        <div key={idx} className="flex flex-col py-1.5 border-b border-white/5 last:border-0 group">
                            <div className="flex justify-between items-center mb-0.5">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-3 h-3 opacity-60", rule.pct > 0 ? 'text-emerald-400' : rule.pct < 0 ? 'text-red-400' : 'text-slate-400')}>
                                        {(() => {
                                            const Icon = icons[rule.factor] || Info;
                                            return <Icon className="w-full h-full" />;
                                        })()}
                                    </div>

                                    <span className="text-[10px] text-slate-300 font-black uppercase tracking-tight group-hover:text-blue-400 transition-colors">{rule.factor}</span>
                                </div>
                                <span className={cn(
                                    "font-black font-mono text-[10px]", 
                                    rule.pct > 0 ? 'text-emerald-400' : rule.pct < 0 ? 'text-rose-400' : 'text-slate-500'
                                )}>
                                    {rule.pct > 0 ? `+${rule.pct}%` : rule.pct === 0 ? 'MANTENER' : `${rule.pct}%`}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 pl-5">
                                <div className="w-1 h-1 rounded-full bg-slate-800" />
                                <span className="text-[9px] text-slate-500 italic font-medium">{rule.razon}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 p-2 bg-blue-500/5 rounded-lg border border-blue-500/10">
                    <p className="text-[9px] text-blue-300/60 leading-relaxed font-bold italic">
                        * El incremento final se aplica sobre el capital del préstamo anterior.
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * Desglose detallado de la Reputación del Cliente
 */
export function ReputationBreakdown({ reputationData }: { reputationData: any }) {
    if (!reputationData) return null;

    const { score, details = [], metrics = {} } = reputationData;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Auditoría de Reputación</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Score Final</span>
                        <div className="flex items-baseline gap-1">
                            <span className={cn(
                                "text-sm font-black text-blue-400"
                            )}>
                                {score}
                            </span>
                            <span className="text-[8px] text-slate-600 font-bold">PTS</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="space-y-1">
                {details.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-white/5 last:border-0 group">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 text-slate-300 group-hover:text-blue-400 transition-colors">
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-500/70" />
                                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-tight">{item.label}</span>
                            </div>
                            {item.description && (
                                <span className="text-[9px] text-slate-500 ml-5 leading-none">{item.description}</span>
                            )}
                        </div>
                        <span className="font-mono font-bold text-xs text-blue-400">
                            +{item.value}
                        </span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
               <div className="bg-slate-950/60 p-2 rounded-lg border border-white/5 text-center transition-colors hover:border-blue-500/20">
                   <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1 leading-none">Desempeño</div>
                   <div className="text-xs font-black text-white">{Math.round(metrics.avgPerformance || 100)}%</div>
                   <div className="text-[6px] text-slate-600 uppercase font-bold">Avg Salud</div>
               </div>
               <div className="bg-slate-950/60 p-2 rounded-lg border border-white/5 text-center transition-colors hover:border-blue-500/20">
                   <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1 leading-none">Antigüedad</div>
                   <div className="text-xs font-black text-white">{metrics.months || 0}m</div>
                   <div className="text-[6px] text-slate-600 uppercase font-bold">Meses activo</div>
               </div>
               <div className="bg-slate-950/60 p-2 rounded-lg border border-white/5 text-center transition-colors hover:border-blue-500/20">
                   <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1 leading-none">Volumen</div>
                   <div className="text-xs font-black text-white">{metrics.totalFinished || 0}</div>
                   <div className="text-[6px] text-slate-600 uppercase font-bold">Préstamos pagados</div>
               </div>
            </div>
        </div>
    );
}
