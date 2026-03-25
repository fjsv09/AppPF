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
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Banknote, Receipt, Tag, FileText, Wallet, Camera } from 'lucide-react'

import { SimpleImageUpload } from '@/components/wizard/simple-image-upload'

const formSchema = z.object({
  cartera_id: z.string().uuid('Seleccione una cartera'),
  cuenta_id: z.string().uuid('Seleccione una cuenta'),
  categoria_id: z.string().uuid('Seleccione una categoría'),
  monto: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'El monto debe ser un número positivo',
  }),
  descripcion: z.string().min(3, 'La descripción es muy corta').max(200),
  evidencia_url: z.string().min(1, 'La evidencia es obligatoria (Foto de la boleta/recibo)'),
})

interface ExpenseFormProps {
  carteras: any[]
  cuentas: any[]
  categorias: any[]
  advisors: any[]
  userId: string
  userRole: string
  initialData?: any
  onSuccess?: () => void
}

export function ExpenseForm({ carteras, cuentas, categorias, advisors, userId, userRole, initialData, onSuccess }: ExpenseFormProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cartera_id: initialData?.cartera_id || carteras[0]?.id || '',
      cuenta_id: initialData?.cuenta_origen_id || '',
      categoria_id: initialData?.categoria_id || '',
      monto: initialData?.monto?.toString() || '',
      descripcion: initialData?.descripcion || '',
      evidencia_url: initialData?.evidencia_url || '',
    },
  })

  const selectedCarteraId = form.watch('cartera_id')

  // Reset account selection when cartera changes
  useEffect(() => {
    form.setValue('cuenta_id', '')
  }, [selectedCarteraId, form])

  const filteredCuentas = cuentas.filter(c => {
    // Basic filter by cartera
    if (c.cartera_id !== selectedCarteraId) return false
    
    // Role-based restrictions
    // Supervisor and Asesor can only see 'cobranzas' accounts
    if (userRole === 'asesor' || userRole === 'supervisor') {
      return c.tipo === 'cobranzas'
    }
    
    return true
  })

  const filteredCategorias = categorias.filter(cat => {
    // Supervisor can only see 'Gasto' categories
    if (userRole === 'supervisor') {
      return cat.nombre.toLowerCase().includes('gasto')
    }
    return true
  })

  // Pre-fill account/category if only one is available or editing
  useEffect(() => {
    // If NOT editing, and there's only one account/category option, select it
    if (!initialData) {
      if (filteredCuentas.length === 1 && !form.getValues('cuenta_id')) {
        form.setValue('cuenta_id', filteredCuentas[0].id)
      }
      if (filteredCategorias.length === 1 && !form.getValues('categoria_id')) {
        form.setValue('categoria_id', filteredCategorias[0].id)
      }
    } else {
      // MODO EDICION: Pre-fill if matches
      if (initialData?.cuenta_origen_id) {
        const hasCuenta = filteredCuentas.some(c => c.id === initialData.cuenta_origen_id)
        if (hasCuenta) form.setValue('cuenta_id', initialData.cuenta_origen_id)
      }
      if (initialData?.categoria_id) {
        const hasCat = filteredCategorias.some(c => c.id === initialData.categoria_id)
        if (hasCat) form.setValue('categoria_id', initialData.categoria_id)
      }
    }
  }, [initialData, filteredCuentas, filteredCategorias, form])

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const selectedCuenta = cuentas.find(c => c.id === values.cuenta_id)
    const montoNum = parseFloat(values.monto)

    // Solo validar saldo si es nuevo o si el monto aumentó (simplificado, la DB valida)
    if (selectedCuenta && !initialData && parseFloat(selectedCuenta.saldo) < montoNum) {
      toast.error(`Saldo insuficiente (Disponible: S/ ${selectedCuenta.saldo})`)
      return
    }

    setLoading(true)
    try {
      if (initialData?.id) {
        // MODO EDICION: Solo el administrador puede editar gastos
        if (userRole !== 'admin') {
           toast.error('Solo administradores pueden editar gastos registrados.')
           setLoading(false)
           return
        }
        
        const { error } = await supabase.rpc('actualizar_gasto_db', {
          p_gasto_id: initialData.id,
          p_cuenta_id: values.cuenta_id,
          p_monto: montoNum,
          p_categoria_id: values.categoria_id,
          p_descripcion: values.descripcion,
          p_evidencia_url: values.evidencia_url || null
        })
        if (error) throw error
        toast.success('Gasto actualizado correctamente')
      } else {
        // MODO NUEVO
        const { error } = await supabase.rpc('registrar_gasto_db', {
          p_cartera_id: values.cartera_id,
          p_cuenta_id: values.cuenta_id,
          p_monto: montoNum,
          p_categoria_id: values.categoria_id,
          p_descripcion: values.descripcion,
          p_usuario_id: userId,
          p_evidencia_url: values.evidencia_url || null
        })
        if (error) throw error
        toast.success('Gasto registrado correctamente')
      }

      if (!initialData) {
        form.reset({
          ...form.getValues(),
          monto: '',
          descripcion: '',
          evidencia_url: ''
        })
      }
      
      if (onSuccess) onSuccess()
      router.refresh()
    } catch (error: any) {
      console.error(error)
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 relative pb-2">
        {/* Background Subtle Glows */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="grid grid-cols-2 gap-2">
          <FormField
            control={form.control}
            name="cartera_id"
            render={({ field }) => (
              <FormItem className="space-y-0.5">
                <FormLabel className="text-slate-500 font-bold flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
                  <Tag className="w-2.5 h-2.5 text-blue-500" />
                  Cartera
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-slate-900/40 border-slate-800 text-white h-8 rounded-md text-[11px] focus:ring-1 focus:ring-blue-500/40 transition-all backdrop-blur-sm px-2 w-full [&>span]:line-clamp-1 [&>span]:truncate [&>span]:flex-1 [&>span]:text-left overflow-hidden">
                      <SelectValue placeholder="Cartera" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white rounded-lg backdrop-blur-xl">
                    {carteras.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs uppercase focus:bg-blue-500/10 max-w-[300px] truncate">
                        {c.nombre} {c.perfiles?.nombre_completo ? ` — ${c.perfiles.nombre_completo}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[8px] text-rose-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cuenta_id"
            render={({ field }) => (
              <FormItem className="space-y-0.5">
                <FormLabel className="text-slate-500 font-bold flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
                  <Wallet className="w-2.5 h-2.5 text-emerald-500" />
                  Origen
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-slate-900/40 border-slate-800 text-white h-8 rounded-md text-[11px] focus:ring-1 focus:ring-emerald-500/40 transition-all backdrop-blur-sm px-2 w-full [&>span]:line-clamp-1 [&>span]:truncate [&>span]:flex-1 [&>span]:text-left overflow-hidden">
                      <SelectValue placeholder="Cuenta" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white rounded-lg backdrop-blur-xl">
                    {filteredCuentas.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs focus:bg-emerald-500/10 max-w-[300px] truncate">
                        {c.nombre} ({c.tipo}) — S/ {c.saldo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[8px] text-rose-500" />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FormField
            control={form.control}
            name="categoria_id"
            render={({ field }) => (
              <FormItem className="space-y-0.5">
                <FormLabel className="text-slate-500 font-bold flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
                  <Tag className="w-2.5 h-2.5 text-purple-500" />
                  Categoría
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-slate-900/40 border-slate-800 text-white h-8 rounded-md text-[11px] focus:ring-1 focus:ring-purple-500/40 transition-all backdrop-blur-sm px-2 w-full [&>span]:line-clamp-1 [&>span]:truncate [&>span]:flex-1 [&>span]:text-left overflow-hidden">
                      <SelectValue placeholder="Gasto" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white rounded-lg backdrop-blur-xl">
                    {filteredCategorias.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id} className="text-xs focus:bg-purple-500/10 truncate">{cat.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[8px] text-rose-500" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="monto"
            render={({ field }) => (
              <FormItem className="space-y-0.5">
                <FormLabel className="text-slate-500 font-bold flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
                  <Banknote className="w-2.5 h-2.5 text-amber-500" />
                  Monto
                </FormLabel>
                <FormControl>
                  <div className="relative group">
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 group-focus-within:text-amber-500 transition-colors font-bold">S/</div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="bg-slate-900/40 border-slate-800 text-white pl-6 h-8 rounded-md text-[13px] focus:ring-1 focus:ring-amber-500/40 transition-all font-black"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-[8px] text-rose-500" />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="evidencia_url"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-slate-500 font-bold flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
                <Camera className="w-2.5 h-2.5 text-blue-400" />
                Evidencia / Foto <span className="text-rose-500">*</span>
              </FormLabel>
              <FormControl>
                <div className="min-h-[130px] w-full rounded-lg border border-dashed border-slate-800 bg-slate-900/30 flex items-center justify-center overflow-hidden">
                  <SimpleImageUpload
                    label="Subir Boleta"
                    value={field.value || ''}
                    onChange={field.onChange}
                    folder="gastos_evidencia"
                  />
                </div>
              </FormControl>
              <FormMessage className="text-[8px] text-rose-500" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="descripcion"
          render={({ field }) => (
            <FormItem className="space-y-1 min-w-0">
              <FormLabel className="text-slate-500 font-bold flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
                <FileText className="w-2.5 h-2.5 text-slate-500" />
                Motivo / Descripción <span className="text-rose-500">*</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Descripción breve..."
                  className="bg-slate-900/40 border-slate-800 text-white h-20 resize-none rounded-md text-[11px] focus:ring-1 focus:ring-blue-500/40 transition-all placeholder:text-slate-600 min-w-0"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-[8px] text-rose-500" />
            </FormItem>
          )}
        />

        <div className="pt-3">
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold h-10 rounded-lg transition-all shadow-lg shadow-blue-500/10 active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-widest text-[11px]"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Receipt className="w-4 h-4" />
                Registrar Gasto
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
