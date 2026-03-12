'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Briefcase, Plus, User, Building2 } from 'lucide-react'

interface CarteraManagerProps {
  asesores: any[]
  initialCarteras: any[]
}

export function CarteraManager({ asesores, initialCarteras }: CarteraManagerProps) {
  const [carteras, setCarteras] = useState(initialCarteras)
  const [loading, setLoading] = useState(false)
  const [newCartera, setNewCartera] = useState({ nombre: '', asesor_id: '' })
  const supabase = createClient()
  const router = useRouter()

  async function createCartera() {
    if (!newCartera.nombre || !newCartera.asesor_id) {
       toast.error('Complete todos los campos')
       return
    }

    setLoading(true)
    try {
      // 1. Create Cartera
      const { data: cartera, error: cError } = await supabase
        .from('carteras')
        .insert({ nombre: newCartera.nombre, asesor_id: newCartera.asesor_id })
        .select()
        .single()

      if (cError) throw cError

      // 2. Create default accounts for this cartera: Cobranzas, Caja, Yape
      const accounts = [
        { cartera_id: cartera.id, tipo: 'cobranzas', nombre: `Cobranzas - ${cartera.nombre}`, saldo: 0 },
        { cartera_id: cartera.id, tipo: 'caja', nombre: `Efectivo Caja - ${cartera.nombre}`, saldo: 0 },
        { cartera_id: cartera.id, tipo: 'digital', nombre: `Yape/Digital - ${cartera.nombre}`, saldo: 0 }
      ]

      const { error: aError } = await supabase.from('cuentas_financieras').insert(accounts)
      if (aError) throw aError

      toast.success('Cartera y cuentas creadas correctamente')
      setNewCartera({ nombre: '', asesor_id: '' })
      
      // Update local state
      setCarteras([...carteras, { ...cartera, perfiles: asesores.find(a => a.id === newCartera.asesor_id) }])
      router.refresh()
    } catch (error: any) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Create Form */}
      <Card className="lg:col-span-4 bg-slate-900/50 border-slate-800 backdrop-blur-sm h-fit sticky top-8">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2 text-white font-bold">
            <Plus className="w-5 h-5 text-blue-400" />
            Nueva Cartera
          </CardTitle>
          <CardDescription className="text-slate-400">
            Crea una cartera y sus cuentas automáticas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-400">Nombre de la Cartera</Label>
            <Input 
              placeholder="Ej: Cartera Norte" 
              className="bg-slate-950 border-slate-800 text-white"
              value={newCartera.nombre}
              onChange={(e) => setNewCartera({ ...newCartera, nombre: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-400">Asesor Responsable</Label>
            <Select 
                onValueChange={(val) => setNewCartera({ ...newCartera, asesor_id: val })}
                value={newCartera.asesor_id}
            >
              <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                <SelectValue placeholder="Seleccione asesor" />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-800 text-white">
                {asesores.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold" 
            onClick={createCartera}
            disabled={loading}
          >
            {loading ? 'Creando...' : 'Crear Cartera'}
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="lg:col-span-8 space-y-4">
          <h2 className="text-xl font-bold text-white mb-4">Carteras Activas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {carteras.map((c) => (
                  <Card key={c.id} className="bg-slate-900/40 border-slate-800 hover:border-blue-500/30 transition-all group">
                      <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-4">
                              <div className="p-3 bg-blue-500/10 rounded-xl">
                                  <Briefcase className="w-6 h-6 text-blue-400" />
                              </div>
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-bold tracking-widest uppercase">
                                Activa
                              </span>
                          </div>
                          <h3 className="text-lg font-bold text-white group-hover:text-blue-200 transition-colors uppercase">{c.nombre}</h3>
                          <div className="mt-4 flex items-center gap-2 text-slate-400">
                             <User className="w-4 h-4 text-slate-500" />
                             <span className="text-sm">{c.perfiles?.nombre_completo || 'Sin asesor'}</span>
                          </div>
                          <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                              <span className="text-xs text-slate-500">Cuentas vinculadas: 3</span>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-blue-400 hover:text-blue-300 p-0 h-auto"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    router.push(`/dashboard/admin/carteras/${c.id}`);
                                  }}
                                >
                                  Ver detalles
                                </Button>
                          </div>
                      </CardContent>
                  </Card>
              ))}
              {carteras.length === 0 && (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-2xl">
                      <Building2 className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                      <p className="text-slate-500">No hay carteras registradas. Comienza creando una.</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  )
}
