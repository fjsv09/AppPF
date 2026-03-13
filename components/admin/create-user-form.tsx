'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { UserPlus, Loader2, Users, Shield, User, Eye, EyeOff, Wallet, Calendar } from 'lucide-react'

interface Supervisor {
    id: string
    nombre_completo: string
}

interface CreateUserFormProps {
    onSuccess?: () => void
    supervisores?: Supervisor[]
}

export function CreateUserForm({ onSuccess, supervisores = [] }: CreateUserFormProps) {
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        nombre: '',
        rol: 'asesor' as 'admin' | 'supervisor' | 'asesor',
        supervisor_id: '' as string,
        sueldo_base: '' as string,
        fecha_nacimiento: '' as string
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!formData.email || !formData.password || !formData.nombre) {
            toast.error('Todos los campos son requeridos')
            return
        }

        if (formData.password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres')
            return
        }

        // Validate supervisor is selected for asesor role
        if (formData.rol === 'asesor' && !formData.supervisor_id && supervisores.length > 0) {
            toast.error('Debe seleccionar un supervisor para el asesor')
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/admin/crear-usuario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    supervisor_id: formData.rol === 'asesor' ? formData.supervisor_id : null,
                    sueldo_base: formData.sueldo_base ? parseFloat(formData.sueldo_base) : 0,
                    fecha_nacimiento: formData.fecha_nacimiento || null
                })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Error al crear usuario')
            }

            toast.success(`Usuario ${formData.nombre} creado exitosamente`)
            setFormData({ email: '', password: '', nombre: '', rol: 'asesor', supervisor_id: '', sueldo_base: '', fecha_nacimiento: '' })
            onSuccess?.()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const getRoleIcon = (rol: string) => {
        switch (rol) {
            case 'admin': return <Shield className="w-4 h-4 text-red-400" />
            case 'supervisor': return <Users className="w-4 h-4 text-purple-400" />
            default: return <User className="w-4 h-4 text-blue-400" />
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                {/* Nombre Completo */}
                <div className="space-y-2">
                    <Label htmlFor="nombre" className="text-slate-300">Nombre Completo</Label>
                    <Input
                        id="nombre"
                        placeholder="Ej: Juan Pérez García"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    />
                </div>

                {/* Email */}
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-300">Correo Electrónico</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="usuario@empresa.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    />
                </div>

                {/* Password */}
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-300">Contraseña</Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Mínimo 6 caracteres"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Sueldo Base */}
                    <div className="space-y-2">
                        <Label htmlFor="sueldo_base" className="text-slate-300 flex items-center gap-2">
                            <Wallet className="w-3.5 h-3.5" />
                            Sueldo Base
                        </Label>
                        <Input
                            id="sueldo_base"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={formData.sueldo_base}
                            onChange={(e) => setFormData({ ...formData, sueldo_base: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                        />
                    </div>

                    {/* Fecha de Nacimiento */}
                    <div className="space-y-2">
                        <Label htmlFor="fecha_nacimiento" className="text-slate-300 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            Nacimiento
                        </Label>
                        <Input
                            id="fecha_nacimiento"
                            type="date"
                            value={formData.fecha_nacimiento}
                            onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                        />
                    </div>
                </div>

                {/* Rol */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Rol</Label>
                    <Select 
                        value={formData.rol} 
                        onValueChange={(value: any) => setFormData({ ...formData, rol: value, supervisor_id: '' })}
                    >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="asesor" className="text-white hover:bg-slate-800">
                                <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-400" />
                                    Asesor
                                </div>
                            </SelectItem>
                            <SelectItem value="supervisor" className="text-white hover:bg-slate-800">
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-purple-400" />
                                    Supervisor
                                </div>
                            </SelectItem>
                            <SelectItem value="admin" className="text-white hover:bg-slate-800">
                                <div className="flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-red-400" />
                                    Administrador
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Supervisor Selector - Only show when creating asesor */}
                {formData.rol === 'asesor' && supervisores.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-slate-300">Supervisor a Cargo</Label>
                        <Select 
                            value={formData.supervisor_id} 
                            onValueChange={(value) => setFormData({ ...formData, supervisor_id: value })}
                        >
                            <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                                <SelectValue placeholder="Seleccionar supervisor..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                {supervisores.map((sup) => (
                                    <SelectItem 
                                        key={sup.id} 
                                        value={sup.id}
                                        className="text-white hover:bg-slate-800"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-purple-900/50 flex items-center justify-center text-xs font-bold text-purple-400">
                                                {sup.nombre_completo?.charAt(0) || '?'}
                                            </div>
                                            {sup.nombre_completo}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">Este supervisor supervisará las actividades del asesor</p>
                    </div>
                )}

                {/* Role Description */}
                <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-1">
                        {getRoleIcon(formData.rol)}
                        <span className="text-sm font-medium text-white capitalize">{formData.rol}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                        {formData.rol === 'admin' && 'Acceso total al sistema. Puede gestionar usuarios, ver reportes y configurar el sistema.'}
                        {formData.rol === 'supervisor' && 'Puede ver todos los préstamos y clientes. Supervisa el trabajo de los asesores.'}
                        {formData.rol === 'asesor' && 'Puede registrar clientes, crear préstamos y registrar pagos. Acceso limitado a sus operaciones.'}
                    </p>
                </div>
            </div>

            <Button 
                type="submit" 
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 rounded-xl shadow-lg shadow-emerald-900/20"
            >
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                    <UserPlus className="w-5 h-5 mr-2" />
                )}
                Crear Usuario
            </Button>
        </form>
    )
}
