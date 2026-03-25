'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Plus, Receipt } from 'lucide-react'
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

interface ExpenseManagerClientProps {
  expenses: any[]
  carteras: any[]
  cuentas: any[]
  categorias: any[]
  advisors: any[]
  userId: string
  userRole: string
  filters?: ReactNode
}

export function ExpenseManagerClient({ 
  expenses, 
  carteras, 
  cuentas, 
  categorias, 
  advisors, 
  userId, 
  userRole,
  filters
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

      <div className="space-y-4">
        {/* Filters Section Moved Down */}
        <div className="relative z-10">
          {filters}
        </div>
        
        <div className="grid grid-cols-1 items-start">
          <div className="space-y-3">
            <ExpenseList 
              expenses={expenses} 
              onEdit={handleEdit}
              userRole={userRole}
            />
          </div>
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
