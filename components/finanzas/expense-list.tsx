'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Receipt, Calendar, Tag, CreditCard, User, History, Camera, ExternalLink, Pencil, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { useState, useMemo, useTransition, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface ExpenseListProps {
  expenses: any[]
  onEdit?: (expense: any) => void
  userRole?: string
  isPending?: boolean
  advisors?: any[]
}

export function ExpenseList({ expenses, onEdit, userRole, isPending, advisors = [] }: ExpenseListProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const totalPages = Math.ceil(expenses.length / ITEMS_PER_PAGE)
  
  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return expenses.slice(start, start + ITEMS_PER_PAGE)
  }, [expenses, currentPage])

  const getUserInfo = (userId: string) => {
    return advisors.find(a => a.id === userId)
  }

  if (expenses.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
        <CardContent className="pt-6 text-center py-10">
          <Receipt className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500">No se han registrado gastos recientemente.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden relative group">
      {isPending && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] z-50 flex items-center justify-center animate-in fade-in duration-300">
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-700/50 shadow-2xl flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</span>
              </div>
          </div>
      )}
      <CardContent className={cn("p-0 transition-opacity duration-300", isPending ? "opacity-30" : "opacity-100")}>
        {/* Mobile View: Stacked Cards */}
        <div className="md:hidden divide-y divide-slate-800/50">
          {paginatedExpenses.length > 0 ? (
            paginatedExpenses.map((expense) => (
              <div key={expense.id} className="p-3 space-y-3 hover:bg-slate-800/20 transition-colors">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <div className="p-1 bg-purple-500/10 rounded">
                        <Tag className="w-3 h-3 text-purple-400" />
                      </div>
                      <span className="text-xs font-bold text-slate-200 truncate uppercase tracking-tight">
                        {expense.categorias_gastos?.nombre || 'General'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed pl-5">
                      {expense.descripcion}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-rose-400 whitespace-nowrap block">
                      - S/ {parseFloat(expense.monto).toFixed(1)}
                    </span>
                    <span className="text-[9px] text-slate-600 font-medium block">
                      {format(new Date(expense.created_at), 'dd MMM, HH:mm', { locale: es })}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-slate-600" />
                      <span className="text-[9px] text-slate-500 truncate max-w-[100px]">
                        {expense.cuentas_financieras?.nombre || 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {expense.evidencia_url && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="h-7 w-7 flex items-center justify-center bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all border border-blue-500/10">
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          </DialogTrigger>
                          <DialogContent className="bg-slate-950 border-slate-800 p-0 overflow-hidden sm:max-w-xl mx-2">
                             <div className="relative aspect-video w-full">
                                <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={expense.evidencia_url} alt="Evidencia" className="object-contain w-full h-full" />
                                </>
                             </div>
                          </DialogContent>
                        </Dialog>
                    )}
                    {userRole === 'admin' && (
                      <button 
                        onClick={() => onEdit?.(expense)}
                        className="h-7 w-7 flex items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-all border border-amber-500/10"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-10 text-center">
               <Receipt className="w-8 h-8 text-slate-800 mx-auto mb-2 opacity-20" />
               <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Sin gastos registrados</p>
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader className="bg-slate-950/30">
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs h-9">Fecha</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs h-9">Categoría</TableHead>
                {userRole === 'admin' && (
                   <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs h-9">Registrado por</TableHead>
                )}
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs h-9">Descripción</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs h-9 hidden md:table-cell">Cuenta</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs text-center h-9">Evidencia</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs text-right h-9">Monto</TableHead>
                <TableHead className="text-slate-400 font-bold text-[10px] md:text-xs text-center h-9">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedExpenses.map((expense) => (
                <TableRow key={expense.id} className="border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <TableCell className="text-slate-300 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-bold text-[11px] text-slate-200">
                        {format(new Date(expense.created_at), 'dd/MM/yy', { locale: es })}
                      </span>
                      <span className="text-[9px] text-slate-500 font-medium tracking-tight">
                        {format(new Date(expense.created_at), 'HH:mm', { locale: es })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1.5 min-w-[100px]">
                      <div className="p-1 bg-purple-500/10 rounded-md">
                        <Tag className="w-3 h-3 text-purple-400" />
                      </div>
                      <span className="text-[10px] md:text-xs text-slate-200 truncate">{expense.categorias_gastos?.nombre || 'General'}</span>
                    </div>
                  </TableCell>
                  {userRole === 'admin' && (
                    <TableCell className="py-2">
                      {(() => {
                        const creator = getUserInfo(expense.registrado_por)
                        return (
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-200 truncate max-w-[120px]">
                              {creator?.nombre_completo || 'N/A'}
                            </span>
                            <span className="text-[8px] text-slate-500 uppercase font-black tracking-tighter">
                              {creator?.rol || 'N/A'}
                            </span>
                          </div>
                        )
                      })()}
                    </TableCell>
                  )}
                  <TableCell className="py-2 min-w-[120px]">
                    <p className="text-[10px] md:text-xs text-slate-400 truncate max-w-[150px]" title={expense.descripcion}>
                      {expense.descripcion || 'Sin descripción'}
                    </p>
                  </TableCell>
                  <TableCell className="py-2 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                       <CreditCard className="w-3 h-3 text-slate-500" />
                       <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{expense.cuentas_financieras?.nombre || 'N/A'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {expense.evidencia_url ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-md transition-all border border-blue-500/10 group">
                            <Camera className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="bg-slate-950 border-slate-800 p-0 overflow-hidden sm:max-w-xl">
                          <div className="relative aspect-video w-full">
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                  src={expense.evidencia_url} 
                                  alt="Evidencia de gasto" 
                                  className="object-contain w-full h-full"
                                />
                            </>
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                              <p className="text-white text-xs font-bold">{expense.descripcion}</p>
                              <p className="text-slate-400 text-[10px]">
                                {format(new Date(expense.created_at), 'PPPp', { locale: es })}
                              </p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-[8px] text-slate-700 italic">No</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-bold text-rose-400 whitespace-nowrap">
                      - S/ {parseFloat(expense.monto).toFixed(1)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {userRole === 'admin' && (
                      <button 
                        onClick={() => onEdit?.(expense)}
                        className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-md transition-all border border-amber-500/10 group"
                        title="Editar gasto"
                      >
                        <Pencil className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-800/50">
          <PaginationControlled 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalRecords={expenses.length}
            pageSize={ITEMS_PER_PAGE}
          />
        </div>
      </CardContent>
    </Card>
  )
}

