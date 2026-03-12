'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Clock, Landmark, Smartphone, User, History } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface CuadreApprovalProps {
  pendingCuadres: any[]
  adminId: string
  globalAccounts: any[]
}

export function CuadreApproval({ pendingCuadres: initialCuadres, adminId, globalAccounts }: CuadreApprovalProps) {
  const [cuadres, setCuadres] = useState(initialCuadres)
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, { caja: string, digital: string }>>({})
  const supabase = createClient()
  const router = useRouter()

  async function approveCuadre(cuadreId: string) {
    const selection = selectedAccounts[cuadreId]
    if (!selection?.caja || !selection?.digital) {
      toast.error('Seleccione las cuentas de destino para caja y digital')
      return
    }

    setLoading(cuadreId)
    try {
      const response = await fetch(`/api/cuadres/${cuadreId}/aprobar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_cuenta_caja_id: selection.caja,
          p_cuenta_digital_id: selection.digital
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error en el servidor')
      }

      toast.success('Cuadre aprobado y fondos transferidos correctamente')
      setCuadres(cuadres.filter(c => c.id !== cuadreId))
      router.refresh()
    } catch (error: any) {
      toast.error('Error al aprobar: ' + error.message)
    } finally {
      setLoading(null)
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {cuadres.map((c) => (
          <Card key={c.id} className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden border-l-4 border-l-blue-500">
            <CardHeader className="bg-slate-800/20 border-b border-slate-800 pb-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-blue-500/10 rounded-xl">
                      <User className="w-6 h-6 text-blue-400" />
                   </div>
                   <div>
                      <CardTitle className="text-lg font-bold text-white uppercase">
                        {c.perfiles?.nombre_completo}
                      </CardTitle>
                      <CardDescription className="text-slate-400 flex items-center gap-2">
                         <Clock className="w-3.5 h-3.5" />
                         Solicitado el {format(new Date(c.created_at), "dd 'de' MMMM, HH:mm", { locale: es })}
                      </CardDescription>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                   <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                     c.tipo_cuadre === 'final' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                   }`}>
                     {c.tipo_cuadre === 'final' ? 'CIERRE FINAL' : 'CIERRE PARCIAL'}
                   </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full items-stretch">
                {/* Info Panel */}
                <div className="space-y-4">
                   <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Resumen de Recaudación</p>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/50">
                         <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <Landmark className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-medium">Efectivo</span>
                         </div>
                         <p className="text-2xl font-bold text-white tracking-tight">S/ {c.monto_cobrado_efectivo}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/50">
                         <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <Smartphone className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-medium">Digital</span>
                         </div>
                         <p className="text-2xl font-bold text-white tracking-tight">S/ {c.monto_cobrado_digital}</p>
                      </div>
                   </div>
                   <div className="p-4 rounded-2xl bg-slate-800/30 border border-slate-700/50 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-400">TOTAL ENTREGADO:</span>
                      <span className="text-2xl font-black text-white underline decoration-emerald-500/50 underline-offset-8">
                         S/ {c.saldo_entregado}
                      </span>
                   </div>
                </div>

                {/* Account Selection and Actions */}
                <div className="space-y-6 flex flex-col justify-center bg-slate-950/30 p-6 rounded-2xl border border-dashed border-slate-800">
                   <div className="space-y-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Landmark className="w-3 h-3" />
                            ¿A qué cuenta de CAJA va el efectivo?
                         </label>
                         <Select onValueChange={(val) => setSelectedAccounts({
                           ...selectedAccounts,
                           [c.id]: { ...selectedAccounts[c.id], caja: val }
                         })}>
                           <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-10">
                             <SelectValue placeholder="Seleccionar cuenta de caja" />
                           </SelectTrigger>
                           <SelectContent className="bg-slate-950 border-slate-800 text-white">
                             {globalAccounts.filter(acc => acc.tipo === 'caja').map((acc) => (
                               <SelectItem key={acc.id} value={acc.id}>
                                 {acc.nombre} (S/ {acc.saldo})
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Smartphone className="w-3 h-3" />
                            ¿A qué cuenta DIGITAL va el Yape/otros?
                         </label>
                         <Select onValueChange={(val) => setSelectedAccounts({
                           ...selectedAccounts,
                           [c.id]: { ...selectedAccounts[c.id], digital: val }
                         })}>
                           <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-10">
                             <SelectValue placeholder="Seleccionar cuenta digital" />
                           </SelectTrigger>
                           <SelectContent className="bg-slate-950 border-slate-800 text-white">
                             {globalAccounts.filter(acc => acc.tipo === 'digital').map((acc) => (
                               <SelectItem key={acc.id} value={acc.id}>
                                 {acc.nombre} (S/ {acc.saldo})
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                      </div>
                   </div>

                   <div className="flex gap-3">
                      <Button 
                        variant="ghost" 
                        className="flex-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/10"
                        disabled={!!loading}
                      >
                         <XCircle className="w-4 h-4 mr-2" />
                         Rechazar
                      </Button>
                      <Button 
                        className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 shadow-lg shadow-emerald-900/20"
                        onClick={() => approveCuadre(c.id)}
                        disabled={loading === c.id}
                      >
                         {loading === c.id ? 'Aprobando...' : (
                           <>
                             <CheckCircle2 className="w-5 h-5 mr-2" />
                             Validar y Procesar
                           </>
                         )}
                      </Button>
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
