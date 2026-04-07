'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Briefcase, User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface CarteraHeaderProps {
  asesores: any[]
}

export function CarteraHeader({ asesores }: CarteraHeaderProps) {
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
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
      const { data: cartera, error: cError } = await supabase
        .from('carteras')
        .insert({ nombre: newCartera.nombre, asesor_id: newCartera.asesor_id })
        .select()
        .single()

      if (cError) throw cError

      const accounts = [
        { cartera_id: cartera.id, tipo: 'cobranzas', nombre: `Cobranzas - ${cartera.nombre}`, saldo: 0 },
        { cartera_id: cartera.id, tipo: 'caja', nombre: `Efectivo Caja - ${cartera.nombre}`, saldo: 0 },
        { cartera_id: cartera.id, tipo: 'digital', nombre: `Yape/Digital - ${cartera.nombre}`, saldo: 0 }
      ]

      const { error: aError } = await supabase.from('cuentas_financieras').insert(accounts)
      if (aError) throw aError

      toast.success('Cartera y cuentas creadas correctamente')
      setNewCartera({ nombre: '', asesor_id: '' })
      setIsModalOpen(false)
      router.refresh()
    } catch (error: any) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-900/20 px-6">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Cartera
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900/95 border-slate-800 backdrop-blur-xl text-white sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Plus className="w-5 h-5 text-blue-400" />
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">Nueva Cartera</DialogTitle>
          </div>
          <DialogDescription className="text-slate-400">
            Configura un nuevo portafolio de inversión y sus cuentas operativas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Nombre de la Cartera</Label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input 
                placeholder="Ej: Cartera Norte" 
                className="bg-slate-950/50 border-slate-800 focus:border-blue-500/50 focus:ring-blue-500/20 text-white pl-10 h-12 transition-all"
                value={newCartera.nombre}
                onChange={(e) => setNewCartera({ ...newCartera, nombre: e.target.value })}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Responsable de la Cartera</Label>
            <Select 
                onValueChange={(val) => setNewCartera({ ...newCartera, asesor_id: val })}
                value={newCartera.asesor_id}
            >
              <SelectTrigger className="bg-slate-950/50 border-slate-800 focus:border-blue-500/50 text-white h-12 transition-all">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <SelectValue placeholder="Seleccione un responsable" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white backdrop-blur-xl">
                {asesores.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="focus:bg-blue-600 focus:text-white cursor-pointer">
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{a.nombre_completo}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold">
                        {a.rol}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold h-12 shadow-lg shadow-blue-900/20 group transition-all duration-300" 
            onClick={createCartera}
            loading={loading}
          >
            <span className="flex items-center gap-2">
              {loading ? 'Creando Cartera...' : 'Crear Cartera'}
              {!loading && <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />}
            </span>
          </Button>
          <p className="text-[10px] text-center text-slate-600 italic">
            * Se crearán automáticamente las cuentas de Caja, Yape y Cobranzas.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
