'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, Calendar, User, Tag, X, Loader2, ArrowRight } from 'lucide-react'
import { useState, useEffect, TransitionStartFunction } from 'react'
import { cn } from '@/lib/utils'

interface ExpenseFiltersProps {
  advisors: any[]
  categories: any[]
  userRole?: string
  isPending: boolean
  startTransition: TransitionStartFunction
}

export function ExpenseFilters({ advisors, categories, userRole, isPending, startTransition }: ExpenseFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isAsesor = userRole?.toLowerCase() === 'asesor'
  
  const [isRangeMode, setIsRangeMode] = useState(Boolean(searchParams.get('date_start') || searchParams.get('date_end')))
  const [localQ, setLocalQ] = useState(searchParams.get('q') || '')
  const [localDate, setLocalDate] = useState(searchParams.get('date') || '')
  const [localDateStart, setLocalDateStart] = useState(searchParams.get('date_start') || '')
  const [localDateEnd, setLocalDateEnd] = useState(searchParams.get('date_end') || '')

  // Sync local search and date when URL changes externally
  useEffect(() => {
    setLocalQ(searchParams.get('q') || '')
    setLocalDate(searchParams.get('date') || '')
    setLocalDateStart(searchParams.get('date_start') || '')
    setLocalDateEnd(searchParams.get('date_end') || '')
  }, [searchParams])

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    })
    
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQ !== (searchParams.get('q') || '')) {
        updateParams({ q: localQ })
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [localQ])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isRangeMode) {
        if (localDateStart !== (searchParams.get('date_start') || '') || localDateEnd !== (searchParams.get('date_end') || '')) {
          updateParams({ date_start: localDateStart, date_end: localDateEnd, date: null })
        }
      } else {
        if (localDate !== (searchParams.get('date') || '')) {
          updateParams({ date: localDate, date_start: null, date_end: null })
        }
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [localDate, localDateStart, localDateEnd, isRangeMode])

  useEffect(() => {
      // If mode changes, we might need to sync or clear params
      if (isRangeMode) {
          if (!searchParams.get('date_start') && localDate) {
              setLocalDateStart(localDate)
              setLocalDateEnd(localDate)
          }
      } else {
          if (!searchParams.get('date') && localDateStart) {
              setLocalDate(localDateStart)
          }
      }
  }, [isRangeMode])

  const clearFilters = () => {
    setLocalQ('')
    setLocalDate('')
    setLocalDateStart('')
    setLocalDateEnd('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  const hasFilters = searchParams.get('registrado_por') || searchParams.get('category') || searchParams.get('date') || searchParams.get('date_start') || searchParams.get('date_end') || searchParams.get('q')
  const viewType = searchParams.get('view') || 'expenses'

  return (
    <div className="flex flex-col md:flex-row items-center gap-3 w-full">
        {/* Admin View Toggle */}
        {userRole === 'admin' && (
            <div className="flex bg-slate-950/80 border border-slate-800 p-1 rounded-xl shrink-0">
                <button 
                    onClick={() => updateParams({ view: 'expenses' })}
                    className={cn(
                        "px-3 h-9 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider",
                        viewType === 'expenses' ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-slate-500 hover:text-slate-300"
                    )}
                >
                    Gastos
                </button>
                <button 
                    onClick={() => updateParams({ view: 'disbursements' })}
                    className={cn(
                        "px-3 h-9 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider",
                        viewType === 'disbursements' ? "bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "text-slate-500 hover:text-slate-300"
                    )}
                >
                    Desembolsos
                </button>
            </div>
        )}

        {/* Search */}
        <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px] group">
            {isPending ? (
                 <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin z-10" />
            ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
            )}
            <input 
                placeholder="Buscar descripción..." 
                className="bg-slate-950/50 border border-slate-800 text-slate-200 pl-10 pr-10 h-11 text-xs focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-slate-600 rounded-xl w-full outline-none focus:bg-slate-900"
                value={localQ}
                onChange={(e) => setLocalQ(e.target.value)}
            />
            {localQ && (
                <button 
                    onClick={() => setLocalQ('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>

        {/* Scrollable Filters Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 w-full custom-scrollbar">
            
            {/* Date Filter */}
            {userRole === 'admin' ? (
                <div className="flex items-center bg-slate-950/50 border border-slate-800 rounded-2xl p-1 gap-1 pr-3">
                    <button
                        onClick={() => setIsRangeMode(!isRangeMode)}
                        className={cn(
                            "h-9 w-9 shrink-0 flex items-center justify-center rounded-xl transition-all border",
                            isRangeMode 
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border-blue-400" 
                                : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white"
                        )}
                        title={isRangeMode ? "Cambiar a fecha única" : "Cambiar a rango de fechas"}
                    >
                        <ArrowRight className={cn("w-4 h-4 transition-transform", isRangeMode ? "rotate-180" : "")} />
                    </button>

                    {isRangeMode ? (
                        <div className="flex items-center gap-0.5">
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                                <input
                                    type="date"
                                    value={localDateStart}
                                    onChange={(e) => setLocalDateStart(e.target.value)}
                                    className="h-9 pl-8 pr-1 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[135px] focus-visible:ring-0 outline-none [color-scheme:dark]"
                                />
                            </div>
                            <span className="text-slate-700 font-bold px-1">/</span>
                            <div className="relative">
                                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                                <input
                                    type="date"
                                    value={localDateEnd}
                                    onChange={(e) => setLocalDateEnd(e.target.value)}
                                    className="h-9 pl-8 pr-1 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[135px] focus-visible:ring-0 outline-none [color-scheme:dark]"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input
                                type="date"
                                value={localDate}
                                onChange={(e) => setLocalDate(e.target.value)}
                                className="h-9 pl-9 pr-2 bg-transparent border-0 text-[11px] text-slate-300 font-bold w-[160px] focus-visible:ring-0 outline-none [color-scheme:dark]"
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div className="relative shrink-0">
                    <div className="relative w-[150px]">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/70" />
                        <input 
                            type="date" 
                            className="bg-slate-950/50 border border-slate-800 text-slate-200 pl-9 pr-2 h-11 text-xs focus:ring-1 focus:ring-emerald-500/50 transition-all rounded-xl w-full outline-none [color-scheme:dark]"
                            value={localDate}
                            onChange={(e) => setLocalDate(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* Registrado Por Filter (Solo Admin) */}
            {userRole === 'admin' && (
                <div className="shrink-0 w-[170px]">
                    <Select value={searchParams.get('registrado_por') || 'all'} onValueChange={(v) => updateParams({ registrado_por: v })}>
                        <SelectTrigger className="bg-slate-950/50 border-slate-800 text-slate-300 h-11 px-3 text-xs focus:ring-1 focus:ring-blue-500/30 rounded-xl gap-2 w-full hover:bg-slate-900 transition-colors">
                            <div className="flex items-center gap-2 truncate">
                                <User className="w-3.5 h-3.5 text-blue-500/70 shrink-0" />
                                <SelectValue placeholder="Registrado por" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-800 text-slate-200 text-xs shadow-2xl">
                            <SelectItem value="all">Todos los Usuarios</SelectItem>
                            {advisors.map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.nombre_completo} ({a.rol})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Category Filter - Only show if in expenses view */}
            {viewType === 'expenses' && (
                <div className="shrink-0 w-[170px]">
                    <Select value={searchParams.get('category') || 'all'} onValueChange={(v) => updateParams({ category: v })}>
                        <SelectTrigger className="bg-slate-950/50 border-slate-800 text-slate-300 h-11 px-3 text-xs focus:ring-1 focus:ring-purple-500/30 rounded-xl gap-2 w-full hover:bg-slate-900 transition-colors">
                            <div className="flex items-center gap-2 truncate">
                                <Tag className="w-3.5 h-3.5 text-purple-500/70 shrink-0" />
                                <SelectValue placeholder="Categorías" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-800 text-slate-200 text-xs shadow-2xl">
                            <SelectItem value="all">Todas Categorías</SelectItem>
                            {categories.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Clear Button */}
            {hasFilters && (
                <Button 
                    variant="ghost" 
                    onClick={clearFilters}
                    disabled={isPending}
                    className="shrink-0 h-11 px-4 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl gap-2 transition-all font-bold text-[10px] uppercase tracking-wider"
                >
                    <X className="w-4 h-4" />
                    LIMPIAR
                </Button>
            )}
        </div>
    </div>
  )
}
