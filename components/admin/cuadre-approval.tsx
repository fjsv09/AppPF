'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Clock, Landmark, Smartphone, User, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
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

interface CuadreApprovalProps {
  pendingCuadres: any[]
  adminId: string
  globalAccounts: any[]
}

export function CuadreApproval({ pendingCuadres: initialCuadres, adminId, globalAccounts }: CuadreApprovalProps) {
  const [cuadres, setCuadres] = useState(initialCuadres)
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, { caja: string, digital: string }>>({})
  const [expandedId, setExpandedId] = useState<string | null>(initialCuadres[0]?.id || null)
  const [rejectionId, setRejectionId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  async function approveCuadre(cuadreId: string) {
    const selection = selectedAccounts[cuadreId] || {}
    const cuadre = cuadres.find(c => c.id === cuadreId)

    if (cuadre) {
      if (cuadre.monto_cobrado_efectivo > 0 && !selection.caja) {
        toast.error('Seleccione la cuenta de destino para el efectivo')
        return
      }
      if (cuadre.monto_cobrado_digital > 0 && !selection.digital) {
        toast.error('Seleccione la cuenta de destino para digital')
        return
      }
    }

    setLoading(cuadreId)
    try {
      const response = await fetch(`/api/cuadres/${cuadreId}/aprobar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_cuenta_caja_id: selection.caja || null,
          p_cuenta_digital_id: selection.digital || null
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error en el servidor')
      }

      toast.success('Cuadre aprobado y fondos transferidos correctamente')
      setCuadres(prev => prev.filter(c => c.id !== cuadreId))
      // Mover el foco al primero de la lista si hay más
      const remaining = cuadres.filter(c => c.id !== cuadreId)
      if (remaining.length > 0) {
        setExpandedId(remaining[0].id)
      } else {
        setExpandedId(null)
      }
      router.refresh()
    } catch (error: any) {
      toast.error('Error al aprobar: ' + error.message)
    } finally {
      setLoading(null)
    }
  }

  async function rejectCuadre(cuadreId: string) {
    setLoading(cuadreId)
    try {
      const response = await fetch(`/api/cuadres/${cuadreId}/rechazar`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error en el servidor')
      }

      toast.success('Cuadre rechazado correctamente')
      setCuadres(prev => prev.filter(c => c.id !== cuadreId))
      // Mover el foco al primero de la lista si hay más
      const remaining = cuadres.filter(c => c.id !== cuadreId)
      if (remaining.length > 0) {
        setExpandedId(remaining[0].id)
      } else {
        setExpandedId(null)
      }
      router.refresh()
    } catch (error: any) {
      toast.error('Error al rechazar: ' + error.message)
    } finally {
      setLoading(null)
      setRejectionId(null)
    }
  }

  if (cuadres.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
        <CardContent className="py-20 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500/20 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white">¡Todo al día!</h3>
          <p className="text-slate-500 mt-2">No hay solicitudes de cuadre pendientes de aprobación.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        {cuadres.map((c) => {
          const isExpanded = expandedId === c.id;
          
          return (
            <Card 
              key={c.id} 
              className={`bg-slate-900/50 border w-full backdrop-blur-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'border-blue-500/50 border-l-4 border-l-blue-500 shadow-lg shadow-blue-500/10' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'}`}
            >
              <CardHeader 
                className={`py-3 px-4 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-800/40 border-b border-slate-800' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                     <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-blue-500/20' : 'bg-slate-800'}`}>
                        <User className={`w-4 h-4 ${isExpanded ? 'text-blue-400' : 'text-slate-400'}`} />
                     </div>
                     <div>
                        <CardTitle className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                          {c.perfiles?.nombre_completo}
                          {!isExpanded && (
                             <span className="text-xs font-normal text-slate-400 normal-case hidden sm:inline-block">
                               - S/ {c.saldo_entregado}
                             </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                           <Clock className="w-3 h-3" />
                           {format(new Date(c.created_at), "dd MMM, HH:mm", { locale: es })}
                        </CardDescription>
                     </div>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                     <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                       c.tipo_cuadre === 'final' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                     }`}>
                       {c.tipo_cuadre === 'final' ? 'CIERRE FINAL' : 'CIERRE PARCIAL'}
                     </span>
                     {isExpanded ? (
                       <ChevronUp className="w-4 h-4 text-slate-400" />
                     ) : (
                       <ChevronDown className="w-4 h-4 text-slate-400" />
                     )}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-4 animate-in slide-in-from-top-2 fade-in duration-200">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                    {/* Info Panel */}
                    <div className="space-y-3">
                       <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Resumen de Recaudación</p>
                       <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/50">
                             <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                                <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[10px] font-medium tracking-tight">Efectivo</span>
                             </div>
                             <p className="text-lg font-bold text-white tracking-tight">S/ {c.monto_cobrado_efectivo}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/50">
                             <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                                <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-[10px] font-medium tracking-tight">Digital</span>
                             </div>
                             <p className="text-lg font-bold text-white tracking-tight">S/ {c.monto_cobrado_digital}</p>
                          </div>
                       </div>
                       <div className="p-3 rounded-xl bg-slate-800/20 border border-slate-700/50 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-400">TOTAL:</span>
                          <span className="text-xl font-black text-white underline decoration-emerald-500/50 underline-offset-4">
                             S/ {c.saldo_entregado}
                          </span>
                       </div>
                    </div>

                    {/* Account Selection and Actions */}
                    <div className="space-y-4 bg-slate-950/20 p-4 rounded-xl border border-dashed border-slate-800">
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                          <div className="space-y-1.5">
                             <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                                <Landmark className="w-2.5 h-2.5" />
                                Cuenta CAJA
                             </label>
                             <Select 
                               disabled={c.monto_cobrado_efectivo <= 0}
                               onValueChange={(val) => setSelectedAccounts({
                                 ...selectedAccounts,
                                 [c.id]: { ...selectedAccounts[c.id], caja: val }
                               })}
                             >
                               <SelectTrigger className={`bg-slate-950 border-slate-800 text-white h-8 text-xs ${c.monto_cobrado_efectivo <= 0 ? 'opacity-50 grayscale' : ''}`}>
                                 <SelectValue placeholder={c.monto_cobrado_efectivo <= 0 ? "No requerido" : "Destino caja"} />
                               </SelectTrigger>
                               <SelectContent className="bg-slate-950 border-slate-800 text-white">
                                 {globalAccounts.filter(acc => acc.tipo === 'caja').map((acc) => (
                                   <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                     {acc.nombre} (S/ {acc.saldo})
                                   </SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                          </div>

                          <div className="space-y-1.5">
                             <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                                <Smartphone className="w-2.5 h-2.5" />
                                Cuenta DIGITAL
                             </label>
                             <Select 
                               disabled={c.monto_cobrado_digital <= 0}
                               onValueChange={(val) => setSelectedAccounts({
                                 ...selectedAccounts,
                                 [c.id]: { ...selectedAccounts[c.id], digital: val }
                               })}
                             >
                               <SelectTrigger className={`bg-slate-950 border-slate-800 text-white h-8 text-xs ${c.monto_cobrado_digital <= 0 ? 'opacity-50 grayscale' : ''}`}>
                                 <SelectValue placeholder={c.monto_cobrado_digital <= 0 ? "No requerido" : "Destino digital"} />
                               </SelectTrigger>
                               <SelectContent className="bg-slate-950 border-slate-800 text-white">
                                 {globalAccounts.filter(acc => acc.tipo === 'digital').map((acc) => (
                                   <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                     {acc.nombre} (S/ {acc.saldo})
                                   </SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                          </div>
                       </div>

                       <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="flex-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/10 h-9 text-xs font-bold"
                            disabled={!!loading}
                            onClick={() => setRejectionId(c.id)}
                          >
                             <XCircle className="w-3.5 h-3.5 mr-1.5" />
                             Rechazar
                          </Button>
                          <Button 
                            size="sm"
                            className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs shadow-lg shadow-emerald-900/20"
                            onClick={() => approveCuadre(c.id)}
                            disabled={loading === c.id}
                          >
                             {loading === c.id ? '...' : (
                               <>
                                 <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                 Validar y Procesar
                               </>
                             )}
                          </Button>
                       </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <AlertDialog open={!!rejectionId} onOpenChange={() => setRejectionId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <div className="mx-auto p-3 bg-rose-500/10 rounded-full w-fit mb-2">
              <AlertCircle className="w-6 h-6 text-rose-500" />
            </div>
            <AlertDialogTitle className="text-white text-center">¿Confirmar Rechazo?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-center">
              Esta acción notificará al asesor que su cuadre ha sido rechazado y deberá volver a enviarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-2">
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => rejectionId && rejectCuadre(rejectionId)}
              className="bg-rose-600 text-white hover:bg-rose-700 font-bold"
            >
              Sí, rechazar cuadre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
