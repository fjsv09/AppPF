'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { User, Shield, Calendar, MapPin, Camera, Lock, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

interface ProfileFormProps {
  perfil: any
  isAdmin: boolean
}

export function ProfileForm({ perfil, isAdmin }: ProfileFormProps) {
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(perfil?.avatar_url || '')
  const [uploading, setUploading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  const supabase = createClient()
  const router = useRouter()

  const canEdit = isAdmin || (perfil?.can_edit_profile && !perfil?.has_edited_profile)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true)
      const file = e.target.files?.[0]
      if (!file) return

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/perfil/upload', {
        method: 'POST',
        body: formData
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al subir imagen')

      setAvatarUrl(result.publicUrl)
      toast.success('Foto cargada virtualmente. Haz clic en Guardar para confirmar.')
    } catch (error: any) {
      toast.error('Error al subir imagen: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canEdit) {
      toast.error('No tienes permisos de edición en este momento.')
      return
    }

    setLoading(true)
    const formData = new FormData(e.currentTarget)
    
    const updates = {
      nombre_completo: formData.get('nombre_completo'),
      dni: formData.get('dni'),
      fecha_ingreso: formData.get('fecha_ingreso'),
      fecha_nacimiento: formData.get('fecha_nacimiento'),
      direccion: formData.get('direccion'),
      avatar_url: avatarUrl,
      password: formData.get('password') || null
    }

    try {
      const res = await fetch('/api/perfil/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al actualizar perfil')

      toast.success('Perfil actualizado correctamente')
      router.refresh()
      
      // Si no es admin, la página se volverá de solo lectura después de refrescar
      if (!isAdmin) {
          setTimeout(() => window.location.reload(), 1500)
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Sidebar de Perfil */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-md overflow-hidden">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="relative inline-block group">
              <div className="w-32 h-32 rounded-full border-4 border-blue-500/20 overflow-hidden bg-slate-800 flex items-center justify-center mx-auto mb-4">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-16 h-16 text-slate-500" />
                )}
              </div>
              {canEdit && (
                <label className="absolute bottom-4 right-0 p-2 bg-blue-600 rounded-full cursor-pointer hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/40">
                  <Camera className="w-4 h-4 text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
              )}
            </div>
            
            <h3 className="text-xl font-bold text-white uppercase tracking-tight">{perfil?.nombre_completo}</h3>
            <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mt-1">{perfil?.rol}</p>
            
            <div className="mt-6 pt-6 border-t border-slate-800/50 flex flex-col items-center gap-2">
                {!isAdmin && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        canEdit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                        {canEdit ? (
                            <><Save className="w-3 h-3" /> Edición Disponible (1/1)</>
                        ) : (
                            <><AlertCircle className="w-3 h-3" /> Edición Bloqueada</>
                        )}
                    </div>
                )}
                {isAdmin && (
                    <div className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                        <Shield className="w-3 h-3" /> Administrador del Sistema
                    </div>
                )}
            </div>
          </CardContent>
        </Card>

        {!canEdit && !isAdmin && (
            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 space-y-2">
                <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase">
                    <AlertCircle className="w-4 h-4" />
                    Información Importante
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                    Ya has realizado tu edición única de datos. Si necesitas realizar algún cambio adicional, por favor solicita a un <span className="text-orange-400 font-bold underline">Administrador</span> que habilite la edición para tu cuenta.
                </p>
            </div>
        )}
      </div>

      {/* Formulario Principal */}
      <div className="lg:col-span-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-md">
            <CardHeader className="border-b border-slate-800">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-blue-400" />
                Información Personal
              </CardTitle>
              <CardDescription>Estos datos se utilizan para contratos y reportes oficiales.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500">Nombres Completos</Label>
                  <Input 
                    name="nombre_completo" 
                    defaultValue={perfil?.nombre_completo} 
                    disabled={!canEdit}
                    required
                    className="bg-slate-950 border-slate-800 h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500">DNI / Documento</Label>
                  <Input 
                    name="dni" 
                    defaultValue={perfil?.dni} 
                    disabled={!canEdit}
                    required
                    className="bg-slate-950 border-slate-800 h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Fecha de Ingreso
                  </Label>
                  <Input 
                    name="fecha_ingreso" 
                    type="date"
                    defaultValue={perfil?.fecha_ingreso} 
                    disabled={!canEdit}
                    required
                    className="bg-slate-950 border-slate-800 h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Fecha de Nacimiento
                  </Label>
                  <Input 
                    name="fecha_nacimiento" 
                    type="date"
                    defaultValue={perfil?.fecha_nacimiento} 
                    disabled={!canEdit}
                    required
                    className="bg-slate-950 border-slate-800 h-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-2">
                   <MapPin className="w-3 h-3" /> Dirección de Domicilio
                </Label>
                <Input 
                  name="direccion" 
                  defaultValue={perfil?.direccion} 
                  disabled={!canEdit}
                  required
                  placeholder="Av. Ejemplo 123, Distrito, Ciudad"
                  className="bg-slate-950 border-slate-800 h-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-md">
            <CardHeader className="border-b border-slate-800">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-400" />
                Seguridad de Acceso
              </CardTitle>
              <CardDescription>Actualiza tu contraseña para mantener tu cuenta segura.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-1.5 max-w-sm">
                <Label className="text-[10px] uppercase font-bold text-slate-500">Nueva Contraseña</Label>
                <div className="relative">
                  <Input 
                    name="password" 
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Dejar vacío para no cambiar"
                    disabled={!canEdit}
                    className="bg-slate-950 border-slate-800 h-10 pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {canEdit && (
            <div className="flex justify-end pt-4">
              <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-12 h-12 shadow-xl shadow-blue-900/30"
                disabled={loading}
              >
                {loading ? (
                    <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 animate-pulse" /> Guardando...
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        <Save className="w-5 h-5" /> Guardar Cambios
                    </span>
                )}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
