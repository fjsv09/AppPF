'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, Calendar, User, Tag, Eraser } from 'lucide-react'
import { useState } from 'react'

interface ExpenseFiltersProps {
  advisors: any[]
  categories: any[]
  userRole?: string
}

export function ExpenseFilters({ advisors, categories, userRole }: ExpenseFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isExpanded, setIsExpanded] = useState(false)
  const isAsesor = userRole?.toLowerCase() === 'asesor'

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const clearFilters = () => {
    router.push(pathname)
  }

  const hasFilters = searchParams.get('advisor') || searchParams.get('category') || searchParams.get('date')

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 p-1.5 md:p-2 rounded-xl backdrop-blur-xl shadow-2xl overflow-hidden">
      <div className="flex flex-row items-center gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar px-1">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] md:min-w-[280px] group shrink-0 md:shrink">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input 
            placeholder="Buscar descripción..." 
            className="bg-slate-950/50 border border-slate-800 text-white pl-9 h-9 text-xs focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-slate-600 rounded-lg w-full outline-none"
            value={searchParams.get('q') || ''}
            onChange={(e) => updateFilter('q', e.target.value)}
          />
        </div>

        {/* Date Filter */}
        <div className="relative flex-shrink-0 w-[140px] md:w-[160px]">
           <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Calendar className="w-4 h-4 text-emerald-500" />
           </div>
           <input 
              type="date" 
              className="bg-slate-950/50 border border-slate-800 text-white pl-9 h-9 text-xs focus:ring-1 focus:ring-emerald-500/50 transition-all rounded-lg w-full outline-none [color-scheme:dark]"
              value={searchParams.get('date') || ''}
              onChange={(e) => updateFilter('date', e.target.value)}
           />
        </div>

        {/* Advisor Filter - Hidden for Asesores */}
        {!isAsesor && (
          <div className="flex-shrink-0 w-[160px] md:w-[180px]">
            <Select value={searchParams.get('advisor') || 'all'} onValueChange={(v) => updateFilter('advisor', v)}>
              <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white h-9 px-3 text-xs focus:ring-1 focus:ring-blue-500/50 rounded-lg gap-2 w-full">
                <div className="flex items-center gap-2 truncate">
                  <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <SelectValue placeholder="Asesores" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                <SelectItem value="all">Todos los Asesores</SelectItem>
                {advisors.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Category Filter */}
        <div className="flex-shrink-0 w-[160px] md:w-[180px]">
          <Select value={searchParams.get('category') || 'all'} onValueChange={(v) => updateFilter('category', v)}>
            <SelectTrigger className="bg-slate-950/50 border-slate-800 text-white h-9 px-3 text-xs focus:ring-1 focus:ring-purple-500/50 rounded-lg gap-2 w-full">
              <div className="flex items-center gap-2 truncate">
                <Tag className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <SelectValue placeholder="Categorías" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
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
              className="flex-shrink-0 h-9 px-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg gap-2 transition-all group"
          >
              <Eraser className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Limpiar</span>
          </Button>
        )}
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}
