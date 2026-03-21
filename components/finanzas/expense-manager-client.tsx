'use client'

import { useState, type ReactNode } from 'react'
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

  const handleEdit = (expense: any) => {
    setEditingExpense(expense)
    setIsEditOpen(true)
  }

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
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end shrink-0">
          <Button 
            onClick={() => setIsCreateOpen(true)}
            className="btn-action bg-blue-600 hover:bg-blue-500 shadow-blue-500/20 group"
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
