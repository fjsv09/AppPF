'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  tipo_cuadre: z.enum(['parcial', 'parcial_mañana', 'final', 'saldo_pendiente']),
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
  isDebtBlocked?: boolean
  isMorningBlocked?: boolean
  isNightBlocked?: boolean
  debtAmount?: number
  systemConfig?: any
  trigger?: React.ReactNode
}

export function CuadreForm({ carteras, userId, isDebtBlocked, isMorningBlocked, isNightBlocked, debtAmount, systemConfig }: CuadreFormProps) {
  const [loading, setLoading] = useState(false)
  const [hasPending, setHasPending] = useState(false)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const [stats, setStats] = useState({ cobrado: 0, gastos: 0, neto: 0 })
  const [morningDone, setMorningDone] = useState(false)
  const [nightDone, setNightDone] = useState(false)
  const [confirmData, setConfirmData] = useState<{ mEfectivo: number, mDigital: number, totalEntregar: number } | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  // --- HELPERS PARA LÓGICA DE NEGOCIO ---
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }

  const getLimaTime = () => {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false })
    const [hNow, mNow] = formatter.format(now).split(':').map(Number)
    return hNow * 60 + mNow
  }

  const tFinTurno1 = timeToMinutes(systemConfig?.horario_fin_turno_1 || '13:00')
  const tCierre = timeToMinutes(systemConfig?.horario_cierre || '19:00')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cartera_id: carteras[0]?.id || '',
      tipo_cuadre: isDebtBlocked ? 'saldo_pendiente' : (isMorningBlocked ? 'parcial_mañana' : (isNightBlocked ? 'final' : 'parcial')),
      monto_efectivo: '',
      monto_digital: '',
    },
  })

  // --- AUTOMATIZACIÓN DE TIPO DE CUADRE ---
  const mEfectivo = form.watch('monto_efectivo')
  const mDigital = form.watch('monto_digital')

  useEffect(() => {
    // Si hay bloqueos explícitos, forzar el tipo correspondiente
    if (isDebtBlocked) {
      form.setValue('tipo_cuadre', 'saldo_pendiente')
      return
    }
    if (isNightBlocked) {
      form.setValue('tipo_cuadre', 'final')
      return
    }
    if (isMorningBlocked) {
      form.setValue('tipo_cuadre', 'parcial_mañana')
      return
    }
    if (nightDone) return;

    const total = (parseFloat(mEfectivo || '0')) + (parseFloat(mDigital || '0'))
    if (total <= 0) return; 

    const tNow = getLimaTime()
    const isTotal = Math.abs(total - stats.neto) < 1.05

    if (!isTotal) {
      // 1. Si entrega menos del saldo neto, sugerimos parcial si está habilitado
      form.setValue('tipo_cuadre', 'parcial')
    } else {
      // 2. Si entrega el TOTAL...
      if (tNow < tFinTurno1 + 120 && !morningDone) { 
        form.setValue('tipo_cuadre', 'parcial_mañana')
      } else {
        form.setValue('tipo_cuadre', 'final')
      }
    }
  }, [mEfectivo, mDigital, stats.neto, form, isDebtBlocked, isMorningBlocked, isNightBlocked, systemConfig, morningDone, nightDone, tFinTurno1])

  // Watch for stats calculation
  const selectedCarteraId = form.watch('cartera_id')

  const fetchStats = useCallback(async () => {
    if (!selectedCarteraId) return
    
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      const { data: lastCuadre, error: lastCuadreError } = await supabase
        .from('cuadres_diarios')
        .select('created_at')
        .eq('asesor_id', userId)
        .eq('fecha', todayStr)
        .in('estado', ['pendiente', 'aprobado'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastCuadreError) throw lastCuadreError;
      const statsStartTime = lastCuadre?.created_at || today.toISOString()

      // Check for completed types today
      const { data: todayCuadres, error: tcError } = await supabase
        .from('cuadres_diarios')
        .select('tipo_cuadre')
        .eq('asesor_id', userId)
        .eq('fecha', todayStr)
        .in('estado', ['pendiente', 'aprobado'])
      
      if (!tcError && todayCuadres) {
        setMorningDone(todayCuadres.some(c => c.tipo_cuadre === 'parcial_mañana' || c.tipo_cuadre === 'final'))
        setNightDone(todayCuadres.some(c => c.tipo_cuadre === 'final'))
      }

      // 1. Get the balance
      const { data: accounts, error: accountError } = await supabase
        .from('cuentas_financieras')
        .select('id, saldo')
        .eq('cartera_id', selectedCarteraId)
        .eq('tipo', 'cobranzas')
        .single()
      
      if (accountError) throw accountError;
      const currentBalance = parseFloat(accounts?.saldo || '0')
      const accountId = accounts?.id

      // 2. Get today's expenses
      const { data: gastosMovs, error: gastosError } = await supabase
        .from('movimientos_financieros')
        .select('monto')
        .eq('cartera_id', selectedCarteraId)
        .eq('cuenta_origen_id', accountId)
        .eq('tipo', 'egreso')
        .gt('created_at', statsStartTime)

      if (gastosError) throw gastosError;
      const totalGastos = gastosMovs?.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0) || 0

      // 3. Check for pending
      const { data: pending, error: pendingError } = await supabase
        .from('cuadres_diarios')
        .select('id')
        .eq('asesor_id', userId)
        .eq('estado', 'pendiente')
        .limit(1)

      if (pendingError) throw pendingError;

      setHasPending(!!(pending && pending.length > 0))
      setStats({
        cobrado: currentBalance + totalGastos,
        gastos: totalGastos,
        neto: currentBalance
      })
    } catch (err: any) {
      console.error("Error fetching stats:", err);
    } finally {
      setInitialCheckDone(true)
    }
  }, [selectedCarteraId, supabase, userId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // --- FIX: Sync selectedCarteraId when carteras loaded ---
  useEffect(() => {
    if (carteras.length > 0 && !form.getValues('cartera_id')) {
      form.setValue('cartera_id', carteras[0].id)
    }
  }, [carteras, form])

  // Real-time subscription to catch approval/rejection
  // --- STABLE REF HOOK ---
  const fetchStatsRef = useRef(fetchStats)
  useEffect(() => {
    fetchStatsRef.current = fetchStats
  }, [fetchStats])

  useEffect(() => {
    const channel = supabase
      .channel('cuadres-sync-global')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cuadres_diarios',
          filter: `asesor_id=eq.${userId}`
        },
        () => {
          console.log('🔄 Actualizando estado de cuadre (DB)...')
          if (fetchStatsRef.current) fetchStatsRef.current()
          router.refresh()
        }
      )
      .on(
        'broadcast',
        { event: 'cuadre_updated' },
        (payload) => {
          if (payload.payload?.asesor_id === userId) {
            console.log('🚀 Actualizando estado de cuadre (BC)...')
            if (fetchStatsRef.current) fetchStatsRef.current()
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId, router])

  const hasMovements = stats.cobrado > 0 || stats.gastos > 0;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Validation: No pending
    if (hasPending) {
        toast.error('Ya tienes una solicitud de cuadre pendiente. Espera a que el administrador la apruebe.')
        return
    }

    const mEfectivo = parseFloat(values.monto_efectivo) || 0
    const mDigital = parseFloat(values.monto_digital) || 0
    const totalEntregar = mEfectivo + mDigital
    
    // ¿Es un cierre que requiere sí o sí reportarse (mañana o noche)?
    const isObligatorio = isMorningBlocked || isNightBlocked || values.tipo_cuadre === 'parcial_mañana' || values.tipo_cuadre === 'final';

    // Validation: Si no hay saldo ni movimientos previos, y no es obligatorio, no hay nada que cuadrar
    if (stats.neto <= 0 && !hasMovements && !isObligatorio) {
        toast.error('No hay saldo recaudado ni movimientos que liquidar.')
        return
    }

    // Validación: El monto debe ser mayor a 0, a menos que haya gastos/cobros que liquidar o sea un cuadre obligatorio
    if (totalEntregar <= 0 && !hasMovements && !isObligatorio) {
        toast.error('No hay movimientos ni saldo por liquidar.')
        return
    }

    // Validation: Cannot exceed amount available (net balance)
    if (totalEntregar > stats.neto + 0.05) { // Small epsilon
        toast.error(`El monto total (S/ ${totalEntregar.toFixed(2)}) no puede exceder el neto disponible (S/ ${stats.neto.toFixed(2)})`)
        return
    }

    // Safety check: Is the amount reported close to the recorded net?
    if (!isDebtBlocked && Math.abs(totalEntregar - stats.neto) > 1) {
       setConfirmData({ mEfectivo, mDigital, totalEntregar })
       return
    }

    await processSubmit(mEfectivo, mDigital, values.tipo_cuadre)
  }

  async function processSubmit(mEfectivo: number, mDigital: number, tipoCuadre: string) {
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
                     <CardTitle className="text-base xs:text-lg md:text-xl font-bold text-white flex items-center gap-2">
                       <Clock className="w-4 h-4 xs:w-5 xs:h-5 text-blue-400 hidden sm:block" />
                       Realizar Cuadre Diario
                     </CardTitle>
                    <CardDescription className="text-slate-400 text-xs md:text-sm mt-0.5">
                      Reporta la recaudación del día.
                    </CardDescription>
                 </div>
              </div>
              <div className="flex sm:block justify-end">
                  <span className={`text-[9px] md:text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest ${
                      form.watch('tipo_cuadre') === 'final' ? 'bg-rose-500/20 text-rose-400' : 
                      form.watch('tipo_cuadre') === 'parcial_mañana' ? 'bg-emerald-500/20 text-emerald-400' :
                      form.watch('tipo_cuadre') === 'saldo_pendiente' ? 'bg-red-500/20 text-red-500' :
                      'bg-blue-500/20 text-blue-400'
                  }`}>
                      {form.watch('tipo_cuadre') === 'final' ? 'Cierre del Día' : 
                       form.watch('tipo_cuadre') === 'parcial_mañana' ? 'Cierre Mañana' : 
                       form.watch('tipo_cuadre') === 'saldo_pendiente' ? 'PAGO SALDO PENDIENTE' : 
                       'Cuadre Parcial'}
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
                  <p className="text-[10px] text-slate-500 font-bold uppercase sm:mb-1">
                    {form.watch('tipo_cuadre') === 'saldo_pendiente' ? 'Deuda Anterior' : 'Cobrado'}
                  </p>
                  <p className={`text-base md:text-lg font-bold ${form.watch('tipo_cuadre') === 'saldo_pendiente' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    S/ {(form.watch('tipo_cuadre') === 'saldo_pendiente' && debtAmount) ? debtAmount.toFixed(2) : stats.cobrado.toFixed(2)}
                  </p>
              </div>
              <div className="p-3 md:p-4 rounded-xl bg-slate-950 border border-slate-800 flex sm:flex-col items-center sm:text-center justify-between sm:justify-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase sm:mb-1">Gastos</p>
                  <p className="text-base md:text-lg font-bold text-rose-400">S/ {stats.gastos.toFixed(2)}</p>
              </div>
              <div className="p-3 md:p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex sm:flex-col items-center sm:text-center justify-between sm:justify-center">
                  <p className="text-[10px] text-blue-400 font-bold uppercase sm:mb-1">
                    {form.watch('tipo_cuadre') === 'saldo_pendiente' ? 'Neto a Pagar' : 'Neto Final'}
                  </p>
                  <p className="text-base md:text-lg font-bold text-white">
                    S/ {(form.watch('tipo_cuadre') === 'saldo_pendiente' && debtAmount) ? debtAmount.toFixed(2) : stats.neto.toFixed(2)}
                  </p>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12">
                            <SelectValue placeholder="Seleccione momento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-950 border-slate-800 text-white">
                          <SelectItem 
                            value="parcial" 
                            disabled={isDebtBlocked || isMorningBlocked || isNightBlocked || nightDone}
                          >
                            Cierre Parcial (Ruta)
                          </SelectItem>
                          <SelectItem 
                            value="parcial_mañana" 
                            disabled={isDebtBlocked || isNightBlocked || morningDone}
                          >
                            Cierre del Primer Turno
                          </SelectItem>
                          <SelectItem 
                            value="final" 
                            disabled={isDebtBlocked || isMorningBlocked || nightDone || getLimaTime() < tFinTurno1}
                          >
                            Cierre del Día
                          </SelectItem>
                          {isDebtBlocked && <SelectItem value="saldo_pendiente">LIQUIDAR SALDO AYER</SelectItem>}
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

              {(() => {
                const isObligatorioForm = isMorningBlocked || isNightBlocked || form.watch('tipo_cuadre') === 'parcial_mañana' || form.watch('tipo_cuadre') === 'final';
                const isZeroDisabled = stats.neto <= 0 && !hasMovements && !isObligatorioForm;
                
                return (
                  <Button
                    type="submit"
                    disabled={loading || !initialCheckDone || hasPending || isZeroDisabled}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold h-14 rounded-xl transition-all shadow-xl shadow-blue-500/10 disabled:opacity-50 disabled:grayscale"
                  >
                    {loading ? 'Procesando...' : 
                     !initialCheckDone ? 'Verificando estado...' :
                     hasPending ? 'Esperando Validación' : 
                     (stats.neto <= 0 && hasMovements) ? 'Liquidar Movimientos/Gastos' :
                     isZeroDisabled ? 'Sin Movimientos por Cuadrar' : 
                     (stats.neto <= 0 && isObligatorioForm) ? 'Reportar Cierre en Cero' :
                     'Enviar Solicitud de Cuadre'}
                  </Button>
                );
              })()}
              
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
              onClick={() => confirmData && processSubmit(confirmData.mEfectivo, confirmData.mDigital, form.getValues('tipo_cuadre'))}
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
