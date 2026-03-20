'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Landmark, Smartphone, Receipt, CheckCircle2, Clock, Wallet, AlertCircle } from 'lucide-react'
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

const formSchema = z.object({
  cartera_id: z.string().uuid('Seleccione una cartera'),
  tipo_cuadre: z.enum(['parcial', 'final']),
  monto_efectivo: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Monto inválido',
  }),
  monto_digital: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: 'Monto inválido',
  }),
})

interface CuadreFormProps {
  carteras: any[]
  userId: string
}

export function CuadreForm({ carteras, userId }: CuadreFormProps) {
  const [loading, setLoading] = useState(false)
  const [hasPending, setHasPending] = useState(false)
  const [stats, setStats] = useState({ cobrado: 0, gastos: 0, neto: 0 })
  const [confirmData, setConfirmData] = useState<{ mEfectivo: number, mDigital: number, totalEntregar: number } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cartera_id: carteras[0]?.id || '',
      tipo_cuadre: 'parcial',
      monto_efectivo: '',
      monto_digital: '',
    },
  })

  // Watch for stats calculation
  const selectedCarteraId = form.watch('cartera_id')

  useEffect(() => {
    async function fetchStats() {
      if (!selectedCarteraId) return

      // 1. Get the balance from the 'cobranzas' account
      const { data: accounts } = await supabase
        .from('cuentas_financieras')
        .select('saldo')
        .eq('cartera_id', selectedCarteraId)
        .eq('tipo', 'cobranzas')
        .single()

      const totalCobrado = parseFloat(accounts?.saldo || '0')

      // 2. Get today's expenses
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const { data: gastos } = await supabase
        .from('movimientos_financieros')
        .select('monto')
        .eq('cartera_id', selectedCarteraId)
        .eq('tipo', 'egreso')
        .gte('created_at', today.toISOString())

      const totalGastos = gastos?.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0) || 0

      // 3. Check for pending cuadres for this advisor
      const { data: pending } = await supabase
        .from('cuadres_diarios')
        .select('id')
        .eq('asesor_id', userId)
        .eq('estado', 'pendiente')
        .limit(1)

      setHasPending(!!(pending && pending.length > 0))
      setStats({
        cobrado: totalCobrado,
        gastos: totalGastos,
        neto: totalCobrado - totalGastos
      })
    }

    fetchStats()
  }, [selectedCarteraId, supabase, userId])

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Validation: No pending
    if (hasPending) {
        toast.error('Ya tienes una solicitud de cuadre pendiente. Espera a que el administrador la apruebe.')
        return
    }

    // Validation: Amount cannot be 0 if trying to clear (or at least cobrado must be > 0)
    if (stats.neto <= 0) {
        toast.error('No hay saldo recaudado por liquidar en esta cartera.')
        return
    }

    const mEfectivo = parseFloat(values.monto_efectivo) || 0
    const mDigital = parseFloat(values.monto_digital) || 0
    const totalEntregar = mEfectivo + mDigital
    
    // Validation: Total cannot be 0
    if (totalEntregar <= 0) {
        toast.error('El monto total a liquidar debe ser mayor a 0.')
        return
    }

    // Validation: Cannot exceed collected gross
    if (totalEntregar > stats.cobrado) {
        toast.error(`El monto total (S/ ${totalEntregar.toFixed(2)}) no puede exceder el monto cobrado (S/ ${stats.cobrado.toFixed(2)})`)
        return
    }

    // Safety check: Is the amount reported close to the recorded net?
    if (Math.abs(totalEntregar - stats.neto) > 1) {
       setConfirmData({ mEfectivo, mDigital, totalEntregar })
       return
    }

    await processSubmit(mEfectivo, mDigital, values.tipo_cuadre)
  }

  async function processSubmit(mEfectivo: number, mDigital: number, tipoCuadre: 'parcial' | 'final') {
    setLoading(true)
    setConfirmData(null)
    
    try {
      const response = await fetch('/api/cuadres/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_monto_efectivo: mEfectivo,
          p_monto_digital: mDigital,
          p_total_gastos: stats.gastos,
          p_tipo_cuadre: tipoCuadre
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error en el servidor')
      }

      toast.success('Solicitud de cuadre enviada correctamente. Admin recibirá notificación push.')
      form.reset()
      setHasPending(true) // Immediate feedback
      router.refresh()
    } catch (error: any) {
      toast.error('Error al solicitar cuadre: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-b border-slate-800 p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-500/10 rounded-lg sm:hidden">
                    <Clock className="w-5 h-5 text-blue-400" />
                 </div>
                 <div>
                    <CardTitle className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-blue-400 hidden sm:block" />
                      Realizar Cuadre Diario
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-xs md:text-sm mt-0.5">
                      Reporta la recaudación del día.
                    </CardDescription>
                 </div>
              </div>
              <div className="flex sm:block justify-end">
                  <span className={`text-[9px] md:text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest ${form.watch('tipo_cuadre') === 'final' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {form.watch('tipo_cuadre') === 'final' ? 'Cierre del Día' : 'Cierre Parcial'}
                  </span>
              </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {hasPending && (
            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <p>Tienes una solicitud de cuadre <b>esperando validación</b>. No puedes enviar otra hasta que sea procesada.</p>
            </div>
          )}
          
          {/* Stats Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-8">
              <div className="p-3 md:p-4 rounded-xl bg-slate-950 border border-slate-800 flex sm:flex-col items-center sm:text-center justify-between sm:justify-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase sm:mb-1">Cobrado</p>
                  <p className="text-base md:text-lg font-bold text-emerald-400">S/ {stats.cobrado.toFixed(2)}</p>
              </div>
              <div className="p-3 md:p-4 rounded-xl bg-slate-950 border border-slate-800 flex sm:flex-col items-center sm:text-center justify-between sm:justify-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase sm:mb-1">Gastos</p>
                  <p className="text-base md:text-lg font-bold text-rose-400">S/ {stats.gastos.toFixed(2)}</p>
              </div>
              <div className="p-3 md:p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex sm:flex-col items-center sm:text-center justify-between sm:justify-center">
                  <p className="text-[10px] text-blue-400 font-bold uppercase sm:mb-1">Neto Final</p>
                  <p className="text-base md:text-lg font-bold text-white">S/ {stats.neto.toFixed(2)}</p>
              </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="cartera_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">Cartera a Liquidar</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12">
                            <SelectValue placeholder="Seleccione cartera" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-950 border-slate-800 text-white">
                          {carteras.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tipo_cuadre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">Tipo de Cuadre</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12">
                            <SelectValue placeholder="Seleccione momento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-950 border-slate-800 text-white">
                          <SelectItem value="parcial">Cierre Parcial (3:00 PM)</SelectItem>
                          <SelectItem value="final">Cierre del Día (7:00 PM)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="bg-slate-950/50 p-4 md:p-6 rounded-2xl border border-slate-800 space-y-6">
                  <p className="text-xs md:text-sm font-bold text-slate-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Distribución de Montos a Entregar
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="monto_efectivo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-400 flex items-center gap-2">
                              <Landmark className="w-4 h-4" />
                              Efectivo (Físico)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="bg-slate-900 border-slate-800 text-white text-lg font-bold h-12"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="monto_digital"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-slate-400 flex items-center gap-2">
                              <Smartphone className="w-4 h-4" />
                              Digital (Yape/Plin)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="bg-slate-900 border-slate-800 text-white text-lg font-bold h-12"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center px-2">
                      <span className="text-sm text-slate-500 font-medium">Total a Liquidar:</span>
                      <span className="text-2xl font-black text-white">
                          S/ {(parseFloat(form.watch('monto_efectivo') || '0') + parseFloat(form.watch('monto_digital') || '0')).toFixed(2)}
                      </span>
                  </div>
              </div>

              <Button
                type="submit"
                disabled={loading || hasPending || stats.neto <= 0}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold h-14 rounded-xl transition-all shadow-xl shadow-blue-500/10 disabled:opacity-50 disabled:grayscale"
              >
                {loading ? 'Procesando...' : hasPending ? 'Esperando Validación' : stats.neto <= 0 ? 'Sin Saldo por Cuadrar' : 'Enviar Solicitud de Cuadre'}
              </Button>
              
              <p className="text-[10px] text-center text-slate-500 italic">
                 * El Admin recibirá una notificación para validar y autorizar el movimiento de los fondos.
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmData} onOpenChange={() => setConfirmData(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <div className="mx-auto p-3 bg-amber-500/10 rounded-full w-fit mb-2">
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </div>
            <AlertDialogTitle className="text-white text-center">Diferencia de Cuadre</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-center">
              El monto total a entregar (<strong>S/ {confirmData?.totalEntregar.toFixed(2)}</strong>) no coincide con el neto calculado (<strong>S/ {stats.neto.toFixed(2)}</strong>).
              <br /><br />
              ¿Estás seguro de que deseas enviar esta solicitud con diferencia? El administrador  será notificado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-2">
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Corregir Monto
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => confirmData && processSubmit(confirmData.mEfectivo, confirmData.mDigital, form.getValues('tipo_cuadre') as 'parcial' | 'final')}
              className="bg-amber-600 text-white hover:bg-amber-700 font-bold"
            >
              Sí, enviar con diferencia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
