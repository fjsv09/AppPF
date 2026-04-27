'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PaginationControlledProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalRecords?: number
  pageSize?: number
  className?: string
}

export function PaginationControlled({
  currentPage,
  totalPages,
  onPageChange,
  totalRecords,
  pageSize = 10,
  className
}: PaginationControlledProps) {
  const startRecord = (currentPage - 1) * pageSize + 1
  const endRecord = Math.min(currentPage * pageSize, totalRecords || 0)

  if (totalPages <= 1) {
    if (totalRecords === undefined || totalRecords === 0) return null
    return (
      <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 w-full", className)}>
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          Mostrando <span className="text-slate-200">{startRecord}-{endRecord}</span> de <span className="text-slate-200">{totalRecords}</span> registros
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 w-full", className)}>
      {totalRecords !== undefined && (
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:block">
          Mostrando <span className="text-slate-200">{startRecord}-{endRecord}</span> de <span className="text-slate-200">{totalRecords}</span> registros
        </div>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all rounded-lg"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all rounded-lg"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center px-4 bg-slate-900/50 border border-slate-800 h-8 rounded-lg">
          <span className="text-[10px] font-black text-slate-200">
            PÁGINA <span className="text-blue-400">{currentPage}</span> DE {totalPages}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all rounded-lg"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all rounded-lg"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile view info */}
      {totalRecords !== undefined && (
        <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest sm:hidden">
          {startRecord}-{endRecord} de {totalRecords}
        </div>
      )}
    </div>
  )
}
