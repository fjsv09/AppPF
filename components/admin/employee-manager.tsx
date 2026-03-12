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
import { User, Shield, ShieldAlert, Edit, Power, Calendar, Wallet, Users } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface EmployeeManagerProps {
  employees: any[]
  supervisors: any[]
}

export function EmployeeManager({ employees: initialEmployees, supervisors }: EmployeeManagerProps) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

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
      sueldo_base: rawSueldo ? parseFloat(rawSueldo as string) : 0,
      fecha_nacimiento: formData.get('fecha_nacimiento') as string || null,
      supervisor_id: supervisorId === 'none' ? null : (supervisorId || null),
    }

    if (isNaN(updates.sueldo_base)) updates.sueldo_base = 0

    setLoading(editingEmployee.id)
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .update(updates)
        .eq('id', editingEmployee.id)
        .select()

      if (error) {
        console.error('Supabase Error:', error)
        throw error
      }

      console.log('Update result:', data)

      const newSup = supervisors.find(s => s.id === updates.supervisor_id)
      
      setEmployees(employees.map(emp => 
        emp.id === editingEmployee.id 
          ? { ...emp, ...updates, supervisor: newSup ? { nombre_completo: newSup.nombre_completo } : null } 
          : emp
      ))
      
      toast.success('Datos actualizados correctamente')
      setEditingEmployee(null)
    } catch (error: any) {
      console.error('Catch Error:', error)
      toast.error('Error al actualizar: ' + (error.message || 'Error desconocido'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
        <CardHeader className="bg-slate-800/30 border-b border-slate-800">
           <div className="flex justify-between items-center">
              <div>
                 <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                    <Users className="w-6 h-6 text-blue-400" />
                    Gestión de Personal
                 </CardTitle>
                 <CardDescription>Control de acceso, sueldos y jerarquía.</CardDescription>
              </div>
           </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
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
                {employees.map((emp) => (
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
            {employees.map((emp) => (
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
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                   <Wallet className="w-3 h-3" />
                   Sueldo Base Mensual
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

             <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditingEmployee(null)}>Cancelar</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8" disabled={!!loading}>
                   {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
