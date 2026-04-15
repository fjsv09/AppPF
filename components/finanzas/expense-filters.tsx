'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, Calendar, User, Tag, X, Loader2 } from 'lucide-react'
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
  
  const [localQ, setLocalQ] = useState(searchParams.get('q') || '')

  // Sync local search when URL changes externally
  useEffect(() => {
    setLocalQ(searchParams.get('q') || '')
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

  // Effect for debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQ !== (searchParams.get('q') || '')) {
        updateParams({ q: localQ })
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [localQ])

  const clearFilters = () => {
    setLocalQ('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  const hasFilters = searchParams.get('advisor') || searchParams.get('category') || searchParams.get('date') || searchParams.get('q')

  return (
    <div className="flex flex-col md:flex-row items-center gap-3 w-full">
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
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            
            {/* Date Filter */}
            <div className="relative shrink-0 w-[145px]">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/70" />
                <input 
                    type="date" 
                    className="bg-slate-950/50 border border-slate-800 text-slate-200 pl-9 pr-2 h-11 text-xs focus:ring-1 focus:ring-emerald-500/50 transition-all rounded-xl w-full outline-none [color-scheme:dark]"
                    value={searchParams.get('date') || ''}
                    onChange={(e) => updateParams({ date: e.target.value })}
                />
            </div>

            {/* Advisor Filter */}
            {!isAsesor && (
                <div className="shrink-0 w-[170px]">
                    <Select value={searchParams.get('advisor') || 'all'} onValueChange={(v) => updateParams({ advisor: v })}>
                        <SelectTrigger className="bg-slate-950/50 border-slate-800 text-slate-300 h-11 px-3 text-xs focus:ring-1 focus:ring-blue-500/30 rounded-xl gap-2 w-full hover:bg-slate-900 transition-colors">
                            <div className="flex items-center gap-2 truncate">
                                <User className="w-3.5 h-3.5 text-blue-500/70 shrink-0" />
                                <SelectValue placeholder="Asesores" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-800 text-slate-200 text-xs shadow-2xl">
                            <SelectItem value="all">Todos los Asesores</SelectItem>
                            {advisors.map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Category Filter */}
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
