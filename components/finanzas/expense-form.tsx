'use client'

import { useState } from 'react'
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
import { Banknote, Receipt, Tag, FileText } from 'lucide-react'

const formSchema = z.object({
  cartera_id: z.string().uuid('Seleccione una cartera'),
  cuenta_id: z.string().uuid('Seleccione una cuenta'),
  categoria_id: z.string().uuid('Seleccione una categoría'),
  monto: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'El monto debe ser un número positivo',
  }),
  descripcion: z.string().min(3, 'La descripción es muy corta').max(200),
})

interface ExpenseFormProps {
  carteras: any[]
  cuentas: any[]
  categorias: any[]
  userId: string
}

export function ExpenseForm({ carteras, cuentas, categorias, userId }: ExpenseFormProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cartera_id: carteras[0]?.id || '',
      cuenta_id: '',
      categoria_id: '',
      monto: '',
      descripcion: '',
    },
  })

  // Filter accounts based on selected cartera
  const selectedCarteraId = form.watch('cartera_id')
  const filteredCuentas = cuentas.filter(c => c.cartera_id === selectedCarteraId)

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('registrar_gasto_db', {
        p_cartera_id: values.cartera_id,
        p_cuenta_id: values.cuenta_id,
        p_monto: parseFloat(values.monto),
        p_categoria_id: values.categoria_id,
        p_descripcion: values.descripcion,
        p_usuario_id: userId
      })

      if (error) throw error

      toast.success('Gasto registrado correctamente')
      form.reset({
        ...form.getValues(),
        monto: '',
        descripcion: ''
      })
      router.refresh()
    } catch (error: any) {
        console.error(error)
      toast.error('Error al registrar gasto: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-blue-400" />
          Registrar Gasto Diario
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cartera_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-400">Cartera</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
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
                name="cuenta_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-400">Cuenta de Origen</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                          <SelectValue placeholder="¿De dónde sale el dinero?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-950 border-slate-800 text-white">
                        {filteredCuentas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre} (Saldo: S/ {c.saldo})
                          </SelectItem>
                        ))}
                        {filteredCuentas.length === 0 && (
                            <SelectItem value="none" disabled>No hay cuentas disponibles</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="categoria_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-400">Categoría</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                          <SelectValue placeholder="Tipo de gasto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-950 border-slate-800 text-white">
                        {categorias.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-400">Monto (S/)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Banknote className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          className="bg-slate-950 border-slate-800 text-white pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-400">Descripción / Motivo</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Combustible para la ruta norte"
                      className="bg-slate-950 border-slate-800 text-white resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl transition-all shadow-lg shadow-blue-500/20"
            >
              {loading ? 'Registrando...' : 'Registrar Gasto'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
