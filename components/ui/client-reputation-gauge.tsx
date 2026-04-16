'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface ClientReputationGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showLabel?: boolean
}

export function ClientReputationGauge({ 
  score, 
  size = 'md', 
  className,
  showLabel = true 
}: ClientReputationGaugeProps) {
  // Determinar color
  const getColor = (s: number) => {
    if (s >= 80) return { text: 'text-emerald-500', label: 'Excelente' }
    if (s >= 60) return { text: 'text-amber-500', label: 'Bueno' }
    if (s >= 40) return { text: 'text-orange-500', label: 'Regular' }
    return { text: 'text-rose-500', label: 'Riesgo' }
  }

  const colors = getColor(score)

  const sizeClasses = {
    sm: { container: 'w-16 h-16', text: 'text-lg', label: 'text-[10px]' },
    md: { container: 'w-24 h-24', text: 'text-2xl', label: 'text-xs' },
    lg: { container: 'w-32 h-32', text: 'text-4xl', label: 'text-sm' }
  }

  const s = sizeClasses[size]
  const strokeDasharray = 251.2
  const strokeDashoffset = strokeDasharray - (strokeDasharray * Math.min(100, score) / 100)

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className={cn("relative", s.container)}>
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
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeDashoffset={strokeDashoffset}
            strokeDasharray={strokeDasharray}
            className={cn("transition-all duration-1000 ease-out", colors.text)}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-black tracking-tighter leading-none", s.text, colors.text)}>
            {Math.round(score)}
          </span>
          {size !== 'sm' && (
            <span className={cn("font-bold uppercase tracking-widest opacity-60 -mt-0.5", s.label)}>
              pts
            </span>
          )}
        </div>
      </div>
      {showLabel && (
        <div className="mt-1 text-center">
            <p className={cn("font-black uppercase tracking-widest leading-none", s.label, colors.text)}>
                {colors.label}
            </p>
        </div>
      )}
    </div>
  )
}
