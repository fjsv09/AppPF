'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Edit2, Check, AlertTriangle, ArrowUpDown, Trash2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'

interface Sector {
  id: string
  nombre: string
  orden: number
  activo: boolean
}

export default function AdminSectoresPage() {
  const [sectores, setSectores] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [isAddMode, setIsAddMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    nombre: '',
    orden: '0',
    activo: true
  })

  const loadSectores = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sectores')
        .select('*')
        .order('orden', { ascending: true })

      if (error) throw error
      setSectores(data || [])
    } catch (e: any) {
      toast.error('Error al cargar sectores: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSectores()
  }, [])

  const handleEdit = (sector: Sector) => {
    setEditingId(sector.id)
    setFormData({
      nombre: sector.nombre,
      orden: sector.orden.toString(),
      activo: sector.activo
    })
    setIsAddMode(false)
  }

  const handleAdd = () => {
    setIsAddMode(true)
    setEditingId(null)
    setFormData({
      nombre: '',
      orden: (sectores.length + 1).toString(),
      activo: true
    })
  }

  const handleCancel = () => {
    setIsAddMode(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre del sector es requerido')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      
      if (editingId) {
        // Actualizar
        const { error } = await supabase
          .from('sectores')
          .update({
            nombre: formData.nombre.trim(),
            orden: parseInt(formData.orden) || 0,
            activo: formData.activo
          })
          .eq('id', editingId)
          
        if (error) throw error
        toast.success('Sector actualizado')
      } else {
        // Crear
        const res = await fetch('/api/sectores', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            nombre: formData.nombre.trim(),
            orden: parseInt(formData.orden) || 0,
            de_baja: !formData.activo
          })
        })
        
        if (!res.ok) {
           const err = await res.json()
           throw new Error(err.error || 'Error al crear')
        }
        
        toast.success('Sector creado exitosamente')
      }
      
      await loadSectores()
      handleCancel()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActivo = async (id: string, currentStatus: boolean) => {
    if (!confirm(`¿Está seguro de ${currentStatus ? 'desactivar' : 'activar'} este sector?`)) return
    
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('sectores')
        .update({ activo: !currentStatus })
        .eq('id', id)
        
      if (error) throw error
      
      setSectores(sectores.map(s => s.id === id ? { ...s, activo: !currentStatus } : s))
      toast.success('Estado actualizado')
    } catch (e: any) {
      toast.error('Error al actualizar: ' + e.message)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Sectores de Clientes</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Administra los sectores o rutas de cobranza para asignar y agrupar a los clientes.
            </p>
          </div>
        </div>
        
        {!isAddMode && !editingId && (
            <Button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl">
                <Plus className="w-4 h-4 mr-2" /> Añadir Sector
            </Button>
        )}
      </div>

      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden rounded-2xl">
        <CardHeader className="border-b border-slate-800 bg-slate-800/20 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-slate-200">
            Listado de Sectores
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-purple-500 animate-spin mb-4" />
              <p className="text-slate-400">Cargando sectores...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Formulario Inline (Añadir o Editar) */}
              {(isAddMode || editingId) && (
                  <div className="grid grid-cols-12 gap-4 p-4 border-b border-purple-500/30 bg-purple-500/5 items-center">
                    <div className="col-span-12 md:col-span-4">
                        <label className="text-xs text-slate-400 block mb-1">Nombre del Sector</label>
                        <Input
                           value={formData.nombre}
                           onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                           placeholder="Ej. Comerciante, Mototaxista..."
                           className="bg-slate-950/50 border-slate-700 h-10"
                           autoFocus
                        />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <label className="text-xs text-slate-400 block mb-1">Orden (prioridad)</label>
                        <Input
                           type="number"
                           value={formData.orden}
                           onChange={(e) => setFormData({...formData, orden: e.target.value})}
                           className="bg-slate-950/50 border-slate-700 h-10"
                        />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <label className="text-xs text-slate-400 block mb-1">Estado</label>
                        <select 
                            className="w-full h-10 rounded-md border border-slate-700 bg-slate-950/50 text-slate-200 px-3"
                            value={formData.activo ? 'true' : 'false'}
                            onChange={(e) => setFormData({...formData, activo: e.target.value === 'true'})}
                        >
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                        </select>
                    </div>
                    <div className="col-span-12 md:col-span-4 flex items-end gap-2 h-full pb-0 md:pb-px md:pt-5 pt-2">
                        <Button 
                            onClick={handleSave} 
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white w-full md:w-auto flex-1"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                        </Button>
                        <Button 
                            onClick={handleCancel}
                            variant="ghost" 
                            className="text-slate-400 border border-slate-700 hover:bg-slate-800 w-full md:w-auto"
                        >
                            Cancelar
                        </Button>
                    </div>
                  </div>
              )}

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-xs border-y md:border-t-0 border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-medium">Orden</th>
                      <th className="px-6 py-4 font-medium">Nombre de Sector</th>
                      <th className="px-6 py-4 font-medium">Estado</th>
                      <th className="px-6 py-4 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sectores.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                          No hay sectores registrados. Añade el primero ahora.
                        </td>
                      </tr>
                    ) : (
                      sectores.map((sector) => (
                        <tr key={sector.id} className={`hover:bg-slate-800/30 transition-colors ${!sector.activo ? 'opacity-60 bg-slate-900/40' : ''}`}>
                          <td className="px-6 py-4 font-mono text-slate-400">
                             {sector.orden}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-200">{sector.nombre}</div>
                            <div className="text-xs text-slate-500 font-mono mt-1 opacity-50 truncate max-w-[150px]" title={sector.id}>{sector.id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                              sector.activo 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}>
                              {sector.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => handleToggleActivo(sector.id, sector.activo)}
                                 className={sector.activo ? "text-orange-400 hover:text-orange-300 hover:bg-orange-400/10" : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"}
                                 title={sector.activo ? "Desactivar sector" : "Activar sector"}
                               >
                                 <ArrowUpDown className="h-4 w-4" />
                               </Button>
                               <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleEdit(sector)}
                                  className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                               >
                                  <Edit2 className="h-4 w-4" />
                               </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Vista Móvil */}
              <div className="md:hidden flex flex-col gap-3 p-4 bg-slate-900/20 border-t border-slate-800">
                  {sectores.length === 0 ? (
                      <div className="text-center text-slate-500 py-8 text-sm">
                          No hay sectores registrados. Añade el primero ahora.
                      </div>
                  ) : (
                      sectores.map((sector) => (
                          <div key={sector.id} className={`p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm flex flex-col gap-3 transition-opacity ${!sector.activo ? 'opacity-60' : ''}`}>
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-md bg-slate-800/80 flex items-center justify-center font-mono text-xs font-bold text-slate-400 border border-slate-700/50 shrink-0">
                                            {sector.orden}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-200 text-sm truncate">{sector.nombre}</div>
                                            <div className="text-[10px] text-slate-500 font-mono truncate">{sector.id.split('-')[0]}...</div>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                        sector.activo 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                    }`}>
                                        {sector.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>
                                <div className="flex justify-end gap-2 border-t border-slate-800/60 pt-3 mt-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleActivo(sector.id, sector.activo)}
                                      className={`h-8 px-3 text-[11px] ${sector.activo ? 'text-orange-400 hover:text-orange-300 hover:bg-orange-400/10' : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10'}`}
                                    >
                                      <ArrowUpDown className="h-3 w-3 mr-1.5" />
                                      {sector.activo ? 'Desactivar' : 'Activar'}
                                    </Button>
                                    <Button 
                                       variant="ghost" 
                                       size="sm" 
                                       onClick={() => handleEdit(sector)}
                                       className="h-8 px-3 text-[11px] text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                                    >
                                       <Edit2 className="h-3 w-3 mr-1.5" />
                                       Editar
                                    </Button>
                                </div>
                          </div>
                      ))
                  )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex gap-4 text-sm text-slate-400 mt-8">
          <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0" />
          <p>
            <strong>Regla de negocio:</strong> Los sectores no se pueden eliminar definitivamente para proteger el histórico financiero de los perfiles que los tengan asignados. En su lugar, utilice la acción de <strong>desactivar</strong> para que ya no aparezcan disponibles en los nuevos formularios.
          </p>
      </div>

    </div>
  )
}
