'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
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
import { Briefcase, Plus, User, Building2, Edit2, ChevronRight } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CarteraManagerProps {
  asesores: any[]
  initialCarteras: any[]
}

export function CarteraManager({ asesores, initialCarteras }: CarteraManagerProps) {
  const [carteras, setCarteras] = useState(initialCarteras)
  const [loading, setLoading] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingCartera, setEditingCartera] = useState<any>(null)
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const [isNavigating, startNavigation] = useTransition()

  async function updateCartera() {
    if (!editingCartera.nombre || !editingCartera.asesor_id) {
       toast.error('Complete todos los campos')
       return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('carteras')
        .update({ 
          nombre: editingCartera.nombre, 
          asesor_id: editingCartera.asesor_id 
        })
        .eq('id', editingCartera.id)

      if (error) throw error

      toast.success('Cartera actualizada correctamente')
      setCarteras(carteras.map(c => 
        c.id === editingCartera.id 
          ? { ...c, nombre: editingCartera.nombre, asesor_id: editingCartera.asesor_id, perfiles: asesores.find(a => a.id === editingCartera.asesor_id) } 
          : c
      ))
      setIsEditOpen(false)
      router.refresh()
    } catch (error: any) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
          Carteras Activas
        </h2>
        <div className="h-px flex-1 bg-slate-800/50" />
      </div>

      {/* Modal Edition */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="bg-slate-900/95 border-slate-800 backdrop-blur-xl text-white sm:max-w-[450px]">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-amber-600/20 rounded-lg">
                  <Edit2 className="w-5 h-5 text-amber-400" />
                </div>
                <DialogTitle className="text-2xl font-bold tracking-tight">Editar Cartera</DialogTitle>
              </div>
              <DialogDescription className="text-slate-400">
                Modifica los detalles de la cartera seleccionada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Nombre de la Cartera</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    placeholder="Ej: Cartera Norte" 
                    className="bg-slate-950/50 border-slate-800 focus:border-amber-500/50 focus:ring-amber-500/20 text-white pl-10 h-12 transition-all"
                    value={editingCartera?.nombre || ''}
                    onChange={(e) => setEditingCartera({ ...editingCartera, nombre: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Responsable</Label>
                <Select 
                    onValueChange={(val) => setEditingCartera({ ...editingCartera, asesor_id: val })}
                    value={editingCartera?.asesor_id || ''}
                >
                  <SelectTrigger className="bg-slate-950/50 border-slate-800 focus:border-amber-500/50 text-white h-12 transition-all">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-500" />
                      <SelectValue placeholder="Seleccione un responsable" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white backdrop-blur-xl">
                    {asesores.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="focus:bg-amber-600 focus:text-white cursor-pointer">
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
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold h-12 shadow-lg shadow-amber-900/20 group transition-all duration-300" 
                onClick={updateCartera}
                loading={loading}
              >
                <span className="flex items-center gap-2">
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                  {!loading && <Edit2 className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />}
                </span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      {/* Main Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {carteras.map((c, idx) => (
              <Card 
                key={c.id} 
                className="bg-slate-900/30 border-slate-800/50 hover:border-blue-500/40 hover:bg-slate-900/50 transition-all duration-500 group overflow-hidden relative backdrop-blur-xl shadow-xl border-t-blue-500/5"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/0 via-blue-600/5 to-indigo-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  
                  <CardContent className="p-0">
                      <div className="p-3.5 pb-2.5 flex items-start justify-between">
                          <div className="flex gap-3">
                            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl group-hover:scale-110 transition-transform duration-500 border border-blue-500/10 shadow-lg shadow-blue-900/20">
                                <Briefcase className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                               <h3 className="text-sm font-bold text-white group-hover:text-blue-200 transition-colors line-clamp-1 tracking-tight">{c.nombre}</h3>
                               <div className="flex items-center gap-1.5 mt-1">
                                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                 <span className="text-[9px] text-emerald-400 font-bold tracking-widest uppercase">
                                   En operación
                                 </span>
                               </div>
                            </div>
                          </div>
                          
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-600 hover:text-amber-400 hover:bg-amber-400/10 rounded-full transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingCartera(c);
                                setIsEditOpen(true);
                            }}
                          >
                             <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                      </div>

                      <div className="px-3.5 pb-3.5 space-y-3">
                          <div className="flex items-center justify-between p-2 bg-slate-950/40 rounded-xl border border-slate-800/50 shadow-inner group-hover:bg-slate-950/60 transition-colors">
                             <div className="flex items-center gap-2">
                                <div className="p-1 bg-slate-800 rounded-lg">
                                  <User className="w-3 h-3 text-slate-400" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[7px] text-slate-500 uppercase font-semibold tracking-tighter">Responsable</span>
                                  <span className="text-xs font-medium text-slate-300">{c.perfiles?.nombre_completo || 'Sin asesor'}</span>
                                </div>
                             </div>
                             <Building2 className="w-3 h-3 text-slate-700 group-hover:text-slate-600 transition-colors" />
                          </div>
                      </div>

                      <div className="p-3 bg-slate-950/30 border-t border-slate-800/50 flex justify-center">
                            <Button 
                            variant="default" 
                            className="w-full bg-slate-800/50 hover:bg-blue-600 text-slate-400 hover:text-white border-slate-700/50 hover:border-blue-500 group/btn transition-all flex h-8 gap-2 items-center justify-center shadow-lg font-bold text-[10px] uppercase tracking-wider"
                            loading={isNavigating && navigatingId === c.id}
                            onClick={(e) => {
                              e.preventDefault();
                              setNavigatingId(c.id);
                              startNavigation(() => {
                                router.push(`/dashboard/admin/carteras/${c.id}`);
                              });
                            }}
                          >
                             Gestionar
                             <Plus className="w-3 h-3 opacity-70 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
                          </Button>
                      </div>
                  </CardContent>
              </Card>
          ))}
          
          {carteras.length === 0 && (
              <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-800/50 rounded-[2.5rem] bg-slate-900/10 backdrop-blur-xl transition-all hover:bg-slate-900/20">
                  <div className="w-24 h-24 bg-slate-900/80 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-blue-600/5 blur-xl group-hover:bg-blue-600/10 transition-colors" />
                    <Building2 className="w-12 h-12 text-slate-700 relative z-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-400 mb-3 tracking-tight">No hay carteras aún</h3>
                  <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Comienza creando tu primera cartera usando el botón superior para empezar a gestionar préstamos y asesores.
                  </p>
              </div>
          )}
      </div>
    </div>
  )
}
