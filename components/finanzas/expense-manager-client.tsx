'use client'

import { useState, useTransition, useEffect, type ReactNode } from 'react'
import { Plus, Receipt, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ExpenseForm } from './expense-form'
import { ExpenseList } from './expense-list'
import { BackButton } from '@/components/ui/back-button'
import { Suspense } from 'react'
import { ExpenseFilters } from './expense-filters'

interface ExpenseManagerClientProps {
  expenses: any[]
  carteras: any[]
  cuentas: any[]
  categorias: any[]
  advisors: any[]
  userId: string
  userRole: string
}

export function ExpenseManagerClient({ 
  expenses, 
  carteras, 
  cuentas, 
  categorias, 
  advisors, 
  userId, 
  userRole
}: ExpenseManagerClientProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any>(null)
  const [accessResult, setAccessResult] = useState<any>(null)

  useEffect(() => {
    const checkAccess = async () => {
      const { createClient } = await import('@/utils/supabase/client')
      const { checkSystemAccess } = await import('@/utils/systemRestrictions')
      const supabase = createClient()
      const access = await checkSystemAccess(supabase, userId, userRole, 'otros')
      setAccessResult(access)
    }
    checkAccess()
  }, [userId, userRole])

  const [isPending, startTransition] = useTransition()

  const handleEdit = (expense: any) => {
    setEditingExpense(expense)
    setIsEditOpen(true)
  }

  const canCreate = !accessResult || accessResult.allowed || userRole === 'admin'

  return (
    <div className="page-container pb-16">
      {/* Header Section */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">Gestión de Gastos</h1>
              <p className="page-subtitle max-w-sm">
                Registra y audita los gastos operativos de manera eficiente.
                {!canCreate && accessResult?.reason && (
                  <span className="block mt-1 text-amber-500 font-bold text-[10px] animate-pulse">
                    ⚠️ {accessResult.reason}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end shrink-0">
          <Button 
            onClick={() => setIsCreateOpen(true)}
            disabled={!canCreate}
            className={`btn-action bg-blue-600 hover:bg-blue-500 shadow-blue-500/20 group ${!canCreate ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
          >
            <Plus className="w-4 h-4 mr-1.5 group-hover:rotate-90 transition-transform" />
            Registrar Gasto
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Filters Section - Premium Sticky Bar */}
        <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/50 backdrop-blur-xl mb-6 w-full shadow-2xl">
          <Suspense fallback={<div className="h-12 w-full bg-slate-900/50 animate-pulse rounded-xl" />}>
            <ExpenseFilters 
              advisors={advisors} 
              categories={categorias || []} 
              userRole={userRole || 'asesor'}
              isPending={isPending}
              startTransition={startTransition}
            />
          </Suspense>
        </div>
        
        <div className="relative">
          <ExpenseList 
            expenses={expenses} 
            onEdit={handleEdit}
            userRole={userRole}
            isPending={isPending}
          />
        </div>
      </div>

      {/* CREATE MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-white flex items-center gap-2">
              <Receipt className="w-6 h-6 text-blue-500" />
              Nuevo Gasto
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 px-1">
            <ExpenseForm 
              carteras={carteras} 
              cuentas={cuentas} 
              categorias={categorias} 
              advisors={advisors}
              userId={userId}
              userRole={userRole}
              onSuccess={() => setIsCreateOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT MODAL */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-white flex items-center gap-2">
              <Receipt className="w-6 h-6 text-amber-500" />
              Editar Gasto
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 px-1">
            <ExpenseForm 
              carteras={carteras} 
              cuentas={cuentas} 
              categorias={categorias} 
              advisors={advisors}
              userId={userId}
              userRole={userRole}
              initialData={editingExpense}
              onSuccess={() => setIsEditOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
