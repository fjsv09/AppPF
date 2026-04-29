"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Edit, BellOff, BellRing, Loader2, Lock, Unlock } from "lucide-react"
import { ClientEditModal } from "./client-edit-modal"
import { api } from "@/services/api"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ClientProfileActionsProps {
  cliente: any
  userRole: string
}

export function ClientProfileActions({ cliente, userRole }: ClientProfileActionsProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [updatingExcepcion, setUpdatingExcepcion] = useState(false)
  const [isExempt, setIsExempt] = useState(cliente.excepcion_voucher || false)
  const [isBlocking, setIsBlocking] = useState(false)
  const [isConfirmBlockOpen, setIsConfirmBlockOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsExempt(cliente.excepcion_voucher || false)
  }, [cliente.excepcion_voucher])

  if (userRole !== 'admin' && userRole !== 'supervisor') return null

  const handleToggleBlock = async () => {
    const isBlocked = !!cliente.bloqueado_renovacion
    const action = isBlocked ? 'unblock' : 'block'
    
    try {
        setIsBlocking(true)
        const response = await fetch('/api/clientes/bloquear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cliente_id: cliente.id, action })
        })

        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Error al actualizar')
        
        toast.success(action === 'block' ? 'Cliente bloqueado para renovar' : 'Cliente desbloqueado')
        router.refresh()
    } catch (error: any) {
        toast.error(error.message || 'Error al bloquear/desbloquear cliente')
    } finally {
        setIsBlocking(false)
    }
  }

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
      {(userRole === 'admin' || userRole === 'supervisor') && (
        <Button 
          variant="outline" 
          onClick={() => setIsEditModalOpen(true)}
          className="w-full bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-blue-500/50 transition-all duration-300 h-9 rounded-xl shadow-lg text-xs"
        >
          <Edit className="w-4 h-4 mr-2" />
          Editar Perfil
        </Button>
      )}

      {/* Botón de Bloqueo: Supervisor solo Bloquear, Admin ambos */}
      {(userRole === 'admin' || (userRole === 'supervisor' && !cliente.bloqueado_renovacion)) && (
          <Button 
              variant="outline" 
              className={cn(
                  "w-full font-bold mt-2 h-9 rounded-xl shadow-lg text-xs transition-all duration-300",
                  cliente.bloqueado_renovacion 
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" 
                      : "bg-amber-950/30 border-amber-900/50 text-amber-400 hover:bg-amber-900/40"
              )} 
               onClick={() => {
                  if (cliente.bloqueado_renovacion) handleToggleBlock()
                  else setIsConfirmBlockOpen(true)
               }}
              disabled={isBlocking}
          >
              {cliente.bloqueado_renovacion ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              {isBlocking ? "Procesando..." : (cliente.bloqueado_renovacion ? 'Desbloquear Renovación' : 'Bloquear Renovación')}
          </Button>
      )}

      {/* Alerta de confirmación para Bloqueo */}
      <AlertDialog open={isConfirmBlockOpen} onOpenChange={setIsConfirmBlockOpen}>
          <AlertDialogContent className="bg-slate-900/90 backdrop-blur-xl border-slate-800/50 text-slate-100 shadow-2xl shadow-amber-500/10 max-w-md">
              <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl font-black text-amber-500 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-amber-500/10">
                          <Lock className="w-6 h-6" />
                      </div>
                      ¿Bloquear Cliente?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400 text-base leading-relaxed">
                      El cliente <strong className="text-white">{cliente.nombre_completo}</strong> será bloqueado y <strong className="text-amber-400">no podrá solicitar renovaciones</strong> hasta que un administrador lo desbloquee.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-3 mt-4">
                  <AlertDialogCancel className="bg-slate-800 hover:bg-slate-700 border-none text-slate-300">
                      Cancelar
                  </AlertDialogCancel>
                  <Button
                      disabled={isBlocking}
                      onClick={() => {
                          setIsConfirmBlockOpen(false)
                          handleToggleBlock()
                      }}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-6"
                  >
                      {isBlocking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Sí, Bloquear Cliente
                  </Button>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {/* Excepcion de voucher para admin */}
      {userRole === 'admin' && (
        <Button 
          variant="outline" 
          onClick={handleToggleExcepcion}
          disabled={updatingExcepcion}
          className={cn(
            "w-full h-9 rounded-xl shadow-lg mt-2 text-xs transition-all duration-300",
            isExempt 
              ? "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 hover:text-red-400" 
              : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
          )}
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
      )}

      <ClientEditModal 
        cliente={cliente}
        isOpen={isEditModalOpen}
        userRol={userRole as any}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => {
            // Success handler if needed, router.refresh is handled in modal
            setIsEditModalOpen(false)
        }}
      />
    </div>
  )
}
