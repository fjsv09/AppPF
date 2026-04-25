'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  Filter as FunnelIcon, 
  Download, 
  Loader2, 
  Wallet, 
  Tag, 
  X,
  ChevronDown
} from 'lucide-react'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Badge } from '@/components/ui/badge'
import { cn } from "@/lib/utils"

interface MovementsFilterBarProps {
  accounts: any[]
  portfolioId: string
  initialSearch?: string
  initialType?: string
  initialAccount?: string
}

export function MovementsFilterBar({ 
  accounts, 
  portfolioId, 
  initialSearch = '', 
  initialType = 'todos',
  initialAccount = 'todos'
}: MovementsFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [localSearch, setLocalSearch] = useState(initialSearch)

  // Sync search with URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== (searchParams.get('q') || '')) {
        updateParams({ q: localSearch || null })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [localSearch])

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key)
      else params.set(key, value)
    })

    // Reset page when filters change
    params.delete('page')
    
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const handleTypeChange = (val: string) => updateParams({ tipo: val === 'todos' ? null : val })
  const handleAccountChange = (val: string) => updateParams({ cuenta: val === 'todos' ? null : val })

  const currentType = searchParams.get('tipo') || 'todos'
  const currentAccount = searchParams.get('cuenta') || 'todos'

  return (
    <div className="flex flex-col gap-3 mb-6 w-full">
      {/* Header Actions */}
      <div className="flex justify-end gap-2 mb-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-slate-900 border-slate-700 text-slate-400 hover:text-white transition-all text-[11px] font-bold h-9 px-4 rounded-xl border-dashed"
        >
          <Download className="w-3.5 h-3.5 mr-2 text-slate-500" />
          Exportar CSV
        </Button>
      </div>

      {/* Main Filter Bar - Sticky & Blurry */}
      <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50 backdrop-blur-xl mb-4 w-full">
        {/* Search */}
        <div className="relative w-full md:flex-1 md:max-w-none min-w-[180px]">
          {isPending ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          )}
          <Input
            placeholder="Buscar por descripción..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className={cn(
              "h-11 pl-10 bg-slate-950/50 border-slate-800 text-slate-200 placeholder:text-slate-500 focus:bg-slate-900 focus:border-blue-500/50 transition-all w-full rounded-xl text-xs",
              isPending && "opacity-70"
            )}
          />
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          
          {/* Type Filter */}
          <div className="w-auto shrink-0">
            <Select value={currentType} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-11 min-w-[140px] bg-slate-950/50 border-slate-800 text-[11px] font-medium text-slate-400 px-4 rounded-xl hover:bg-slate-900 transition-colors">
                <div className="flex items-center">
                  <FunnelIcon className="w-3.5 h-3.5 mr-2 text-emerald-500 shrink-0" />
                  <SelectValue placeholder="Tipo" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="todos">Todos los Tipos</SelectItem>
                <SelectItem value="ingreso">Ingresos</SelectItem>
                <SelectItem value="egreso">Egresos</SelectItem>
                <SelectItem value="transferencia">Transferencias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Account Filter */}
          <div className="w-auto shrink-0">
            <Select value={currentAccount} onValueChange={handleAccountChange}>
              <SelectTrigger className="h-11 min-w-[180px] bg-slate-950/50 border-slate-800 text-[11px] font-medium text-slate-400 px-4 rounded-xl hover:bg-slate-900 transition-colors">
                <div className="flex items-center">
                  <Wallet className="w-3.5 h-3.5 mr-2 text-blue-500 shrink-0" />
                  <SelectValue placeholder="Cuenta" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                <SelectItem value="todos">Todas las Cuentas</SelectItem>
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear Button */}
          {(currentType !== 'todos' || currentAccount !== 'todos' || localSearch) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setLocalSearch('')
                updateParams({ q: null, tipo: null, cuenta: null })
              }}
              className="h-11 px-4 text-slate-500 hover:text-white hover:bg-slate-900/50 rounded-xl transition-all font-bold text-[10px]"
            >
              <X className="w-3.5 h-3.5 mr-2" />
              LIMPIAR
            </Button>
          )}
        </div>
      </div>
    </div>

  )
}
