'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Edit2, Check, AlertTriangle, ArrowUpDown, Tag, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { BackButton } from '@/components/ui/back-button'

interface Categoria {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
  activo: boolean
}

export default function AdminCategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [isAddMode, setIsAddMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    orden: '0',
    activo: true
  })

  const loadCategorias = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('categorias_gastos')
        .select('*')
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })

      if (error) throw error
      setCategorias(data || [])
    } catch (e: any) {
      toast.error('Error al cargar categorías: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategorias()
  }, [])

  // Auto-refresh (PWA iOS fix)
  useEffect(() => {
    let lastFetch = Date.now()
    const MIN_INTERVAL = 30_000

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch > MIN_INTERVAL) {
        lastFetch = Date.now()
        loadCategorias()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const handleEdit = (cat: Categoria) => {
    setEditingId(cat.id)
    setFormData({
      nombre: cat.nombre,
      descripcion: cat.descripcion || '',
      orden: cat.orden.toString(),
      activo: cat.activo
    })
    setIsAddMode(false)
  }

  const handleAdd = () => {
    setIsAddMode(true)
    setEditingId(null)
    setFormData({
      nombre: '',
      descripcion: '',
      orden: (categorias.length > 0 ? Math.max(...categorias.map(c => c.orden)) + 1 : 1).toString(),
      activo: true
    })
  }

  const handleCancel = () => {
    setIsAddMode(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre de la categoría es requerido')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      
      const payload = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim() || null,
        orden: parseInt(formData.orden) || 0,
        activo: formData.activo
      }

      if (editingId) {
        // Actualizar
        const { error } = await supabase
          .from('categorias_gastos')
          .update(payload)
          .eq('id', editingId)
          
        if (error) throw error
        toast.success('Categoría actualizada')
      } else {
        // Crear
        const { error } = await supabase
          .from('categorias_gastos')
          .insert([payload])
        
        if (error) throw error
        toast.success('Categoría creada exitosamente')
      }
      
      await loadCategorias()
      handleCancel()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActivo = async (id: string, currentStatus: boolean) => {
    if (!confirm(`¿Está seguro de ${currentStatus ? 'desactivar' : 'activar'} esta categoría?`)) return
    
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('categorias_gastos')
        .update({ activo: !currentStatus })
        .eq('id', id)
        
      if (error) throw error
      
      setCategorias(categorias.map(s => s.id === id ? { ...s, activo: !currentStatus } : s))
      toast.success('Estado actualizado')
    } catch (e: any) {
      toast.error('Error al actualizar: ' + e.message)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">Categorías de Gastos</h1>
              <p className="page-subtitle">
                Administra las categorías disponibles para clasificar los egresos de la empresa.
              </p>
            </div>
          </div>
        </div>
        
        {!isAddMode && !editingId && (
            <Button onClick={handleAdd} className="btn-action bg-purple-600 hover:bg-purple-500">
                <Plus className="w-4 h-4 mr-2" /> Añadir Categoría
            </Button>
        )}
      </div>

      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden rounded-2xl">
        <CardHeader className="border-b border-slate-800 bg-slate-800/20 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-slate-200">
            Listado de Categorías
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-purple-500 animate-spin mb-4" />
              <p className="text-slate-400">Cargando categorías...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Formulario Inline (Añadir o Editar) */}
              {(isAddMode || editingId) && (
                  <div className="grid grid-cols-12 gap-4 p-4 border-b border-purple-500/30 bg-purple-500/5 items-center">
                    <div className="col-span-12 md:col-span-4">
                        <label className="text-xs text-slate-400 block mb-1">Nombre de Categoría</label>
                        <Input
                           value={formData.nombre}
                           onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                           placeholder="Ej. Combustible, Sueldos..."
                           className="bg-slate-950/50 border-slate-700 h-10"
                           autoFocus
                        />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                        <label className="text-xs text-slate-400 block mb-1">Descripción (Opcional)</label>
                        <Input
                           value={formData.descripcion}
                           onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                           placeholder="Para qué se usa..."
                           className="bg-slate-950/50 border-slate-700 h-10"
                        />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <label className="text-xs text-slate-400 block mb-1">Orden</label>
                        <Input
                           type="number"
                           value={formData.orden}
                           onChange={(e) => setFormData({...formData, orden: e.target.value})}
                           className="bg-slate-950/50 border-slate-700 h-10"
                        />
                    </div>
                    <div className="col-span-6 md:col-span-1">
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
                    <div className="col-span-12 md:col-span-2 flex items-end gap-2 h-full pb-0 md:pb-px md:pt-5 pt-2">
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
                      <th className="px-6 py-4 font-medium w-16">Orden</th>
                      <th className="px-6 py-4 font-medium">Categoría</th>
                      <th className="px-6 py-4 font-medium">Descripción</th>
                      <th className="px-6 py-4 font-medium">Estado</th>
                      <th className="px-6 py-4 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {categorias.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          No hay categorías registradas.
                        </td>
                      </tr>
                    ) : (
                      categorias.map((cat) => (
                        <tr key={cat.id} className={`hover:bg-slate-800/30 transition-colors ${!cat.activo ? 'opacity-60 bg-slate-900/40' : ''}`}>
                          <td className="px-6 py-4 font-mono text-slate-400">
                             {cat.orden}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-200 flex items-center gap-2">
                                <Tag className="w-3.5 h-3.5 text-purple-400" />
                                {cat.nombre}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1 opacity-50 truncate max-w-[150px]" title={cat.id}>{cat.id}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-400 italic text-xs">
                            {cat.descripcion || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                              cat.activo 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}>
                              {cat.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => handleToggleActivo(cat.id, cat.activo)}
                                 className={cat.activo ? "text-orange-400 hover:text-orange-300 hover:bg-orange-400/10" : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"}
                                 title={cat.activo ? "Desactivar" : "Activar"}
                               >
                                 <ArrowUpDown className="h-4 w-4" />
                               </Button>
                               <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleEdit(cat)}
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
                  {categorias.length === 0 ? (
                      <div className="text-center text-slate-500 py-8 text-sm">
                          No hay categorías registradas.
                      </div>
                  ) : (
                      categorias.map((cat) => (
                          <div key={cat.id} className={`p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm flex flex-col gap-3 transition-opacity ${!cat.activo ? 'opacity-60' : ''}`}>
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-md bg-slate-800/80 flex items-center justify-center font-mono text-xs font-bold text-slate-400 border border-slate-700/50 shrink-0">
                                            {cat.orden}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-200 text-sm truncate">{cat.nombre}</div>
                                            {cat.descripcion && <div className="text-[10px] text-slate-500 italic truncate">{cat.descripcion}</div>}
                                        </div>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                        cat.activo 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                    }`}>
                                        {cat.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>
                                <div className="flex justify-end gap-2 border-t border-slate-800/60 pt-3 mt-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleActivo(cat.id, cat.activo)}
                                      className={`h-8 px-3 text-[11px] ${cat.activo ? 'text-orange-400 hover:text-orange-300 hover:bg-orange-400/10' : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10'}`}
                                    >
                                      <ArrowUpDown className="h-3 w-3 mr-1.5" />
                                      {cat.activo ? 'Desactivar' : 'Activar'}
                                    </Button>
                                    <Button 
                                       variant="ghost" 
                                       size="sm" 
                                       onClick={() => handleEdit(cat)}
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
            <strong>Nota:</strong> Estas categorías aparecen en el formulario de registro de gastos. Se recomienda no eliminar categorías que ya tengan gastos asociados para mantener la integridad de los reportes.
          </p>
      </div>

    </div>
  )
}
