"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Edit, BellOff, BellRing, Loader2 } from "lucide-react"
import { ClientEditModal } from "./client-edit-modal"
import { api } from "@/services/api"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface ClientProfileActionsProps {
  cliente: any
  userRole: string
}

export function ClientProfileActions({ cliente, userRole }: ClientProfileActionsProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [updatingExcepcion, setUpdatingExcepcion] = useState(false)
  const [isExempt, setIsExempt] = useState(cliente.excepcion_voucher || false)
  const router = useRouter()

  useEffect(() => {
    setIsExempt(cliente.excepcion_voucher || false)
  }, [cliente.excepcion_voucher])

  if (userRole !== 'admin') return null

  const handleToggleExcepcion = async () => {
    try {
      setUpdatingExcepcion(true)
      const newValue = !isExempt
      
      // Actualización optimista local
      setIsExempt(newValue)
      
      await api.clientes.toggleExcepcionVoucher(cliente.id, newValue)
      toast.success(newValue ? 'Excepción de recibo ACTIVADA' : 'Excepción de recibo DESACTIVADA')
      router.refresh()
    } catch (e: any) {
      // Revertir en caso de fallar
      setIsExempt(!isExempt)
      toast.error(e.message || 'Error al actualizar excepción')
    } finally {
      setUpdatingExcepcion(false)
    }
  }

  return (
    <div className="w-full">
      <Button 
        variant="outline" 
        onClick={() => setIsEditModalOpen(true)}
        className="w-full bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-blue-500/50 transition-all duration-300 h-9 rounded-xl shadow-lg text-xs"
      >
        <Edit className="w-4 h-4 mr-2" />
        Editar Perfil
      </Button>

      {/* Excepcion de voucher para admin */}
      <Button 
        variant="outline" 
        onClick={handleToggleExcepcion}
        disabled={updatingExcepcion}
        className={`w-full h-9 rounded-xl shadow-lg mt-2 text-xs transition-all duration-300 ${
          isExempt 
            ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 hover:text-red-400' 
            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        {updatingExcepcion ? (
           <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : isExempt ? (
           <BellOff className="w-4 h-4 mr-2" />
        ) : (
           <BellRing className="w-4 h-4 mr-2" />
        )}
        {isExempt ? 'Exento de Recibo' : 'Requerir Recibo'}
      </Button>

      <ClientEditModal 
        cliente={cliente}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => {
            // Success handler if needed, router.refresh is handled in modal
            setIsEditModalOpen(false)
        }}
      />
    </div>
  )
}
