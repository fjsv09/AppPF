'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { User, Shield, ShieldAlert, Edit, Power, Calendar, Wallet, Users, UserPlus, Eye, EyeOff, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CreateUserForm } from './create-user-form'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { useMemo } from 'react'

interface EmployeeManagerProps {
  employees: any[]
  supervisors: any[]
}

export function EmployeeManager({ employees: initialEmployees, supervisors }: EmployeeManagerProps) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const totalPages = Math.ceil(employees.length / ITEMS_PER_PAGE)
  
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return employees.slice(start, start + ITEMS_PER_PAGE)
  }, [employees, currentPage])

  async function toggleStatus(id: string, currentStatus: boolean) {
    const userToToggle = employees.find(e => e.id === id)
    // Protection: don't allow deactivating admins
    if (userToToggle?.rol === 'admin' && currentStatus === true) {
      toast.error('Protección de Sistema: No se puede desactivar a un Administrador.')
      return
    }

    setLoading(id)
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ activo: !currentStatus })
        .eq('id', id)

      if (error) throw error

      setEmployees(employees.map(e => e.id === id ? { ...e, activo: !currentStatus } : e))
      toast.success(`Usuario ${currentStatus ? 'desactivado' : 'activado'} correctamente`)
    } catch (error: any) {
      toast.error('Error: ' + error.message)
    } finally {
      setLoading(null)
    }
  }

  async function updateEmployee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingEmployee) return

    const formData = new FormData(e.currentTarget)
    const supervisorId = formData.get('supervisor_id')
    const rawSueldo = formData.get('sueldo_base')
    
    console.log('Updating employee:', editingEmployee.id, { supervisorId, rawSueldo })

    const updates: any = {
      nombre_completo: formData.get('nombre_completo') as string,
      sueldo_base: rawSueldo ? parseFloat(rawSueldo as string) : 0,
      fecha_nacimiento: formData.get('fecha_nacimiento') as string || null,
      fecha_ingreso: formData.get('fecha_ingreso') as string || null,
      frecuencia_pago: formData.get('frecuencia_pago') as string || 'mensual',
      supervisor_id: supervisorId === 'none' ? null : (supervisorId || null),
      rol: formData.get('rol') as string,
      sesion_unica_activa: formData.get('sesion_unica_activa') === 'true',
      dni: formData.get('dni') as string || null,
      direccion: formData.get('direccion') as string || null,
      can_edit_profile: formData.get('can_edit_profile') === 'true',
      has_edited_profile: formData.get('has_edited_profile') === 'true',
    }

    if (isNaN(updates.sueldo_base)) updates.sueldo_base = 0

    setLoading(editingEmployee.id)
    try {
      // Validation: If changing role from advisor to something else, check if they have clients
      if (editingEmployee.rol === 'asesor' && updates.rol !== 'asesor') {
          const { count, error: countError } = await supabase
              .from('clientes')
              .select('*', { count: 'exact', head: true })
              .eq('asesor_id', editingEmployee.id)
          
          if (countError) throw countError
          
          if (count && count > 0) {
              toast.error(`Restricción de Negocio: No se puede cambiar el rol de este asesor porque tiene ${count} clientes a su cargo. Primero reasigne los clientes a otro asesor.`, {
                  duration: 5000
              })
              setLoading(null)
              return
          }
      }

      // 1. Update Auth (Email, Password, Role) if changed
      const email = formData.get('email') as string
      const password = formData.get('password') as string
      
      const authUpdates: any = { id: editingEmployee.id }
      if (email !== editingEmployee.email) authUpdates.email = email
      if (password) authUpdates.password = password
      if (updates.rol !== editingEmployee.rol) authUpdates.role = updates.rol
      if (updates.nombre_completo !== editingEmployee.nombre_completo) authUpdates.nombre = updates.nombre_completo

      if (Object.keys(authUpdates).length > 1) {
        const authRes = await fetch('/api/admin/update-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authUpdates)
        })
        if (!authRes.ok) {
            const err = await authRes.json()
            throw new Error(err.error || 'Error al actualizar credenciales')
        }
      }

      // 2. Update Profile Table
      const { error } = await supabase
        .from('perfiles')
        .update(updates)
        .eq('id', editingEmployee.id)

      if (error) throw error

      setEmployees(employees.map(emp => 
        emp.id === editingEmployee.id 
          ? { ...emp, ...updates, email: email || emp.email, supervisor: supervisors.find(s => s.id === updates.supervisor_id) ? { nombre_completo: supervisors.find(s => s.id === updates.supervisor_id).nombre_completo } : null } 
          : emp
      ))
      
      toast.success('Datos actualizados correctamente')
      setEditingEmployee(null)
      router.refresh()
    } catch (error: any) {
      toast.error('Error al actualizar: ' + (error.message || 'Error desconocido'))
    } finally {
      setLoading(null)
    }
  }

  async function handleReleaseDevice() {
    if (!editingEmployee) return
    if (!confirm('¿Seguro que deseas liberar el dispositivo vinculado de este usuario? Tendrá que iniciar sesión de nuevo en su equipo.')) return
    
    setLoading(editingEmployee.id)
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ dispositivo_id: null, sesion_id: null })
        .eq('id', editingEmployee.id)

      if (error) throw error

      setEmployees(employees.map(emp => 
        emp.id === editingEmployee.id ? { ...emp, dispositivo_id: null, sesion_id: null } : emp
      ))
      setEditingEmployee({ ...editingEmployee, dispositivo_id: null })
      toast.success('Dispositivo liberado exitosamente')
      router.refresh()
    } catch (error: any) {
      toast.error('Error al liberar dispositivo: ' + error.message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
        <CardHeader className="bg-slate-800/30 border-b border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-4">
                 <div>
                    <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                       <Users className="w-6 h-6 text-blue-400" />
                       Gestión de Personal
                    </CardTitle>
                    <CardDescription>Control de acceso, sueldos y jerarquía.</CardDescription>
                 </div>
                 <Button 
                    onClick={() => setIsCreating(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/20"
                 >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Nuevo Colaborador
                 </Button>
              </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-slate-950/50">
                <TableRow className="hover:bg-transparent border-slate-800">
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px]">Colaborador</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px]">Rol</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px]">Supervisor</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px]">Sueldo Base</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px]">Estado</TableHead>
                  <TableHead className="text-slate-500 font-bold uppercase text-[10px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEmployees.map((emp) => (
                  <TableRow key={emp.id} className="border-slate-800 hover:bg-slate-800/20 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-200 text-sm truncate max-w-[150px] uppercase">{emp.nombre_completo}</p>
                          <p className="text-[10px] text-slate-500">{emp.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-widest ${
                        emp.rol === 'admin' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        emp.rol === 'supervisor' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}>
                         {emp.rol}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-slate-400 uppercase font-bold truncate max-w-[120px]">
                          {emp.supervisor?.nombre_completo || 'Directo Admin'}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">
                      S/ {emp.sueldo_base || '0.00'}
                    </TableCell>
                    <TableCell>
                      <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase ${emp.activo ? 'text-emerald-400' : 'text-rose-500'}`}>
                         <span className={`w-1.5 h-1.5 rounded-full ${emp.activo ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-500'}`} />
                         {emp.activo ? 'Activo' : 'Suspendido'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 hover:bg-slate-800 text-slate-400"
                        onClick={() => setEditingEmployee(emp)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className={`h-8 w-8 p-0 hover:bg-slate-800 ${emp.activo ? 'text-rose-500 hover:text-rose-400' : 'text-emerald-500 hover:text-emerald-400'}`}
                        onClick={() => toggleStatus(emp.id, emp.activo)}
                        disabled={loading === emp.id || (emp.rol === 'admin' && emp.activo)}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden divide-y divide-slate-800">
            {paginatedEmployees.map((emp) => (
              <div key={emp.id} className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                      <User className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-100 text-sm uppercase">{emp.nombre_completo}</p>
                      <p className="text-[10px] text-slate-500 uppercase">{emp.rol}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-widest ${
                    emp.rol === 'admin' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                    emp.rol === 'supervisor' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                    'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  }`}>
                    {emp.rol}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-950/30 p-3 rounded-xl border border-slate-800/50">
                  <div>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Supervisor</p>
                    <p className="text-[10px] text-slate-300 font-bold uppercase truncate">
                      {emp.supervisor?.nombre_completo || 'Directo Admin'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Sueldo Base</p>
                    <p className="text-[10px] text-emerald-400 font-bold font-mono">
                      S/ {emp.sueldo_base || '0.00'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase ${emp.activo ? 'text-emerald-400' : 'text-rose-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${emp.activo ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-500'}`} />
                    {emp.activo ? 'Contrato Activo' : 'Acceso Suspendido'}
                  </span>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-9 px-3 bg-slate-800 border-slate-700 text-slate-400 flex items-center gap-2"
                      onClick={() => setEditingEmployee(emp)}
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase">Editar</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`h-9 px-3 bg-slate-800 border-slate-700 flex items-center gap-2 ${emp.activo ? 'text-rose-500' : 'text-emerald-500'}`}
                      onClick={() => toggleStatus(emp.id, emp.activo)}
                      disabled={loading === emp.id || (emp.rol === 'admin' && emp.activo)}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase">{emp.activo ? 'Suspender' : 'Activar'}</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-800/50">
              <PaginationControlled 
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalRecords={employees.length}
                pageSize={ITEMS_PER_PAGE}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editingEmployee} onOpenChange={() => setEditingEmployee(null)}>
        <DialogContent key={editingEmployee?.id} className="bg-slate-900 border-slate-800 text-white md:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
               <Shield className="w-5 h-5 text-blue-500" />
               Configurar Colaborador
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={updateEmployee} className="space-y-4 py-4">
              <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nombre Completo</label>
                  <Input 
                      name="nombre_completo" 
                      defaultValue={editingEmployee?.nombre_completo} 
                      className="bg-slate-950 border-slate-800 h-10"
                      required
                  />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Correo Electrónico</label>
                    <Input 
                        name="email" 
                        type="email" 
                        defaultValue={editingEmployee?.email} 
                        className="bg-slate-950 border-slate-800 h-10"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nueva Contraseña</label>
                    <div className="relative">
                        <Input 
                            name="password" 
                            type={showEditPassword ? 'text' : 'password'} 
                            placeholder="••••••"
                            className="bg-slate-950 border-slate-800 h-10 pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowEditPassword(!showEditPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Wallet className="w-3 h-3" />
                    Sueldo Base
                    </label>
                    <Input 
                    name="sueldo_base" 
                    type="number" 
                    step="0.01" 
                    defaultValue={editingEmployee?.sueldo_base} 
                    className="bg-slate-950 border-slate-800 h-10"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    Rol del Usuario
                    </label>
                    <Select name="rol" defaultValue={editingEmployee?.rol}>
                    <SelectTrigger className="bg-slate-950 border-slate-800 h-10">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-800 text-white">
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                        <SelectItem value="asesor">Asesor</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
             </div>
             
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                   <Shield className="w-3 h-3" />
                   Supervisor a Cargo
                </label>
                <Select name="supervisor_id" defaultValue={editingEmployee?.supervisor_id || "none"}>
                   <SelectTrigger className="bg-slate-950 border-slate-800 h-10">
                      <SelectValue placeholder="Seleccionar supervisor" />
                   </SelectTrigger>
                   <SelectContent className="bg-slate-950 border-slate-800 text-white">
                      <SelectItem value="none">Sin Supervisor (Directo Admin)</SelectItem>
                      {supervisors.filter(s => s.id !== editingEmployee?.id).map((s) => (
                         <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>
                      ))}
                   </SelectContent>
                </Select>
             </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">DNI / Documento</label>
                    <Input 
                        name="dni" 
                        defaultValue={editingEmployee?.dni} 
                        className="bg-slate-950 border-slate-800 h-10"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Dirección</label>
                    <Input 
                        name="direccion" 
                        defaultValue={editingEmployee?.direccion} 
                        className="bg-slate-950 border-slate-800 h-10"
                    />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Permitir Edición Perfil</label>
                    <Select name="can_edit_profile" defaultValue={editingEmployee?.can_edit_profile ? "true" : "false"}>
                       <SelectTrigger className="bg-slate-950 border-slate-800 h-10">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent className="bg-slate-950 border-slate-800 text-white">
                          <SelectItem value="true">Habilitado</SelectItem>
                          <SelectItem value="false">Bloqueado</SelectItem>
                       </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Estado Edición Única</label>
                    <Select name="has_edited_profile" defaultValue={editingEmployee?.has_edited_profile ? "true" : "false"}>
                       <SelectTrigger className="bg-slate-950 border-slate-800 h-10">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent className="bg-slate-950 border-slate-800 text-white">
                          <SelectItem value="true">Ya Editó (Bloqueado)</SelectItem>
                          <SelectItem value="false">Pendiente (Puede Editar)</SelectItem>
                       </SelectContent>
                    </Select>
                 </div>
              </div>

             <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                       <ShieldAlert className="w-3 h-3" />
                       Bloquear a 1 Dispositivo
                    </label>
                    <Select name="sesion_unica_activa" defaultValue={editingEmployee?.sesion_unica_activa ? "true" : "false"}>
                       <SelectTrigger className="bg-slate-950 border-slate-800 h-10">
                          <SelectValue />
                       </SelectTrigger>
                       <SelectContent className="bg-slate-950 border-slate-800 text-white">
                          <SelectItem value="true">Activado (Estricto)</SelectItem>
                          <SelectItem value="false">Desactivado (Libre)</SelectItem>
                       </SelectContent>
                    </Select>
                 </div>

                 <div className="space-y-1.5 flex flex-col justify-end">
                    {editingEmployee?.dispositivo_id && (
                        <Button 
                            type="button" 
                            variant="outline" 
                            className="bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500 flex-1 hover:text-white mb-0.5 mt-auto"
                            onClick={handleReleaseDevice}
                            disabled={!!loading}
                        >
                            <Power className="mr-2 h-4 w-4" />
                            Liberar Dispositivo
                        </Button>
                    )}
                 </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Fecha de Nacimiento
                   </label>
                   <Input 
                      name="fecha_nacimiento" 
                      type="date" 
                      defaultValue={editingEmployee?.fecha_nacimiento} 
                      className="bg-slate-950 border-slate-800 h-10"
                   />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Fecha de Ingreso
                   </label>
                   <Input 
                      name="fecha_ingreso" 
                      type="date" 
                      defaultValue={editingEmployee?.fecha_ingreso} 
                      className="bg-slate-950 border-slate-800 h-10"
                   />
                </div>
             </div>

             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                   <Clock className="w-3 h-3" />
                   Frecuencia de Pago
                </label>
                <Select name="frecuencia_pago" defaultValue={editingEmployee?.frecuencia_pago || 'mensual'}>
                   <SelectTrigger className="bg-slate-950 border-slate-800 h-10">
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent className="bg-slate-950 border-slate-800 text-white">
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quincenal">Quincenal</SelectItem>
                      <SelectItem value="mensual">Mensual</SelectItem>
                   </SelectContent>
                </Select>
             </div>

             <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditingEmployee(null)}>Cancelar</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8" disabled={!!loading}>
                   {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Create Modal */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white md:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
               <UserPlus className="w-5 h-5 text-emerald-500" />
               Nuevo Colaborador
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <CreateUserForm 
                supervisores={supervisors} 
                onSuccess={() => {
                    setIsCreating(false)
                    router.refresh()
                }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
