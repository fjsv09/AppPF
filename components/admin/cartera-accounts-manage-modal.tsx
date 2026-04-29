'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings2, Plus, Edit2, Landmark, Banknote, Trash2, AlertTriangle, Users, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'


interface Cuenta {
    id: string
    nombre: string
    tipo: string
    saldo: string | number
    usuarios_autorizados?: string[]
}

interface Usuario {
    id: string
    nombre_completo: string
    rol: string
}

interface ManageAccountsModalProps {
    carteraId: string
    accounts: Cuenta[]
    isGlobal?: boolean
}

export function CarteraAccountsManageModal({ carteraId, accounts, isGlobal = false }: ManageAccountsModalProps) {
    const router = useRouter()
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    // Users list for sharing
    const [usuarios, setUsuarios] = useState<Usuario[]>([])
    const [isLoadingUsuarios, setIsLoadingUsuarios] = useState(false)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    useEffect(() => {
        const fetchUserData = async () => {
            setIsLoadingUsuarios(true)
            try {
                // Fetch current user and profile
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
                    setUserRole(perfil?.rol || null)
                    setCurrentUserId(user.id)
                }

                // Fetch users list (only if admin, but we fetch it anyway for the list)
                const res = await fetch('/api/admin/usuarios')
                const data = await res.json()
                if (Array.isArray(data)) setUsuarios(data)
            } catch (error) {
                console.error('Error fetching data:', error)
            } finally {
                setIsLoadingUsuarios(false)
            }
        }
        if (open) fetchUserData()
    }, [open])

    // New account state
    const [isAddingNew, setIsAddingNew] = useState(false)
    const [newForm, setNewForm] = useState({ nombre: '', tipo: 'digital', usuarios_autorizados: [] as string[] })

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ nombre: '', tipo: '', usuarios_autorizados: [] as string[] })

    // Delete state
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const startEdit = (cuenta: Cuenta) => {
        setEditingId(cuenta.id)
        setEditForm({ 
            nombre: cuenta.nombre, 
            tipo: cuenta.tipo,
            usuarios_autorizados: cuenta.usuarios_autorizados || []
        })
        setIsAddingNew(false)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditForm({ nombre: '', tipo: '', usuarios_autorizados: [] })
    }

    const handleSaveEdit = async () => {
        if (!editForm.nombre.trim() || !editForm.tipo) {
            toast.error('Completa los campos requeridos.')
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/admin/carteras/cuentas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    id: editingId,
                    nombre: editForm.nombre,
                    tipo: editForm.tipo,
                    usuarios_autorizados: editForm.usuarios_autorizados
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            
            toast.success('Cuenta actualizada con éxito.')
            setEditingId(null)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al actualizar.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAccountDelete = async (id: string) => {
        setIsSubmitting(true)
        try {
            const res = await fetch('/api/admin/carteras/cuentas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            
            toast.success('Cuenta eliminada con éxito.')
            setDeletingId(null)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al eliminar.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCreateNew = async () => {
        if (!newForm.nombre.trim() || !newForm.tipo) {
            toast.error('Completa los campos requeridos.')
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/admin/carteras/cuentas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    cartera_id: carteraId,
                    nombre: newForm.nombre,
                    tipo: newForm.tipo,
                    usuarios_autorizados: newForm.usuarios_autorizados
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            
            toast.success('Cuenta creada con éxito.')
            setIsAddingNew(false)
            setNewForm({ nombre: '', tipo: 'digital', usuarios_autorizados: [] })
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al crear la cuenta.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!isOpen) {
                cancelEdit()
                setIsAddingNew(false)
            }
        }}>
            <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg px-3 text-[10px] font-bold uppercase tracking-widest transition-all">
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                    Administrar Cuentas
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white p-0 overflow-hidden rounded-[2rem] shadow-2xl">
                <DialogHeader className="p-6 pb-4 bg-slate-950/50 border-b border-slate-800/50">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-indigo-400" />
                        Administrar Cuentas
                    </DialogTitle>
                </DialogHeader>
                
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Lista de cuentas existentes */}
                    <div className="space-y-3">
                        {accounts.map(acc => (
                            <div key={acc.id} className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3">
                                {editingId === acc.id ? (
                                    <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Nombre</label>
                                                <Input 
                                                    value={editForm.nombre}
                                                    onChange={e => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                                                    className="h-9 bg-slate-900 border-slate-800 text-xs font-bold uppercase"
                                                    placeholder="Ej: YAPE CAJA"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Tipo</label>
                                                <Select value={editForm.tipo} onValueChange={v => setEditForm(prev => ({ ...prev, tipo: v }))}>
                                                    <SelectTrigger className="h-9 bg-slate-900 border-slate-800 text-xs font-bold uppercase">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-800 text-white z-[600]">
                                                        <SelectItem value="digital" className="font-bold uppercase text-[10px]">Digital / Banco</SelectItem>
                                                        <SelectItem value="caja" className="font-bold uppercase text-[10px]">Caja Física</SelectItem>
                                                        <SelectItem value="cobranzas" className="font-bold uppercase text-[10px]">Cobranzas</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* SECCIÓN DE COMPARTIR CUENTA (Solo ADMIN) */}
                                        {userRole === 'admin' && (
                                            <div className="mt-4 space-y-2">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Users className="w-3 h-3 text-indigo-400" />
                                                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Compartir con Personal</label>
                                                </div>
                                                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar">
                                                    {isLoadingUsuarios ? (
                                                        <div className="flex justify-center py-4">
                                                            <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                                        </div>
                                                    ) : usuarios.length === 0 ? (
                                                        <p className="text-[8px] text-slate-600 uppercase text-center py-2">No hay usuarios disponibles</p>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-1">
                                                            {usuarios.map(u => (
                                                                <div 
                                                                    key={u.id} 
                                                                    className={cn(
                                                                        "flex items-center justify-between p-1.5 rounded-md transition-colors cursor-pointer",
                                                                        editForm.usuarios_autorizados.includes(u.id) ? "bg-indigo-500/10 border border-indigo-500/20" : "hover:bg-slate-900 border border-transparent"
                                                                    )}
                                                                    onClick={() => {
                                                                        const current = editForm.usuarios_autorizados
                                                                        if (current.includes(u.id)) {
                                                                            setEditForm(prev => ({ ...prev, usuarios_autorizados: current.filter(id => id !== u.id) }))
                                                                        } else {
                                                                            setEditForm(prev => ({ ...prev, usuarios_autorizados: [...current, u.id] }))
                                                                        }
                                                                    }}
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-bold text-white uppercase leading-none">
                                                                            {u.nombre_completo} {u.id === currentUserId && <span className="text-indigo-400 normal-case ml-1">(Tú)</span>}
                                                                        </span>
                                                                        <span className="text-[7px] font-medium text-slate-500 uppercase mt-1">{u.rol}</span>
                                                                    </div>
                                                                    {editForm.usuarios_autorizados.includes(u.id) && (
                                                                        <Check className="w-3 h-3 text-indigo-400" />
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex justify-end gap-2 pt-1">
                                            <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={isSubmitting} className="h-7 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest">
                                                Cancelar
                                            </Button>
                                            <Button size="sm" onClick={handleSaveEdit} disabled={isSubmitting} className="h-7 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white uppercase tracking-widest px-4">
                                                {isSubmitting ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Guardar'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center border",
                                                acc.tipo === 'digital' || acc.tipo === 'cobranzas' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                            )}>
                                                {acc.tipo === 'digital' || acc.tipo === 'cobranzas' ? <Landmark className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-white uppercase tracking-tight">{acc.nombre}</h4>
                                                <Badge className="bg-slate-800 text-slate-400 border-none px-1.5 py-0 mt-0.5 text-[8px] font-black tracking-widest uppercase">
                                                    {acc.tipo} • Saldo: S/ {parseFloat(acc.saldo.toString()).toFixed(2)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                size="sm" 
                                                variant="ghost" 
                                                onClick={() => startEdit(acc)}
                                                className="w-8 h-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            {deletingId === acc.id ? (
                                                <div className="flex items-center gap-1 animate-in slide-in-from-right-2 duration-200">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => setDeletingId(null)}
                                                        className="h-7 px-2 text-[8px] font-black uppercase text-slate-500 hover:text-white"
                                                    >
                                                        No
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="destructive" 
                                                        onClick={() => handleAccountDelete(acc.id)}
                                                        disabled={isSubmitting}
                                                        className="h-7 px-2 text-[8px] font-black uppercase"
                                                    >
                                                        {isSubmitting ? '...' : 'Sí, borrar'}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    onClick={() => setDeletingId(acc.id)}
                                                    className="w-8 h-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        
                        {accounts.length === 0 && !isAddingNew && (
                            <div className="text-center py-6 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Sin cuentas</p>
                            </div>
                        )}
                    </div>

                    {/* Agregar nueva cuenta */}
                    {isAddingNew ? (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3 flex items-center gap-1.5">
                                <Plus className="w-3 h-3" /> Nueva Cuenta
                            </h4>
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Nombre</label>
                                        <Input 
                                            value={newForm.nombre}
                                            onChange={e => setNewForm(prev => ({ ...prev, nombre: e.target.value }))}
                                            className="h-9 bg-slate-950 border-slate-800 text-xs font-bold uppercase focus-visible:ring-indigo-500/50"
                                            placeholder="Ej: BCP EMPRESA"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Tipo</label>
                                        <Select value={newForm.tipo} onValueChange={v => setNewForm(prev => ({ ...prev, tipo: v }))}>
                                            <SelectTrigger className="h-9 bg-slate-950 border-slate-800 text-xs font-bold uppercase focus:ring-indigo-500/50">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-800 text-white z-[600]">
                                                <SelectItem value="digital" className="font-bold uppercase text-[10px]">Digital / Banco</SelectItem>
                                                <SelectItem value="caja" className="font-bold uppercase text-[10px]">Caja Física</SelectItem>
                                                <SelectItem value="cobranzas" className="font-bold uppercase text-[10px]">Cobranzas</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* SECCIÓN DE RESPONSABLES (Solo ADMIN) */}
                                {userRole === 'admin' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Users className="w-3 h-3 text-indigo-400" />
                                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Responsables de la Cuenta</label>
                                        </div>
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar">
                                            {isLoadingUsuarios ? (
                                                <div className="flex justify-center py-4">
                                                    <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                                </div>
                                            ) : usuarios.length === 0 ? (
                                                <p className="text-[8px] text-slate-600 uppercase text-center py-2">No hay usuarios disponibles</p>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-1">
                                                    {usuarios.map(u => (
                                                        <div 
                                                            key={u.id} 
                                                            className={cn(
                                                                "flex items-center justify-between p-1.5 rounded-md transition-colors cursor-pointer",
                                                                newForm.usuarios_autorizados.includes(u.id) ? "bg-indigo-500/10 border border-indigo-500/20" : "hover:bg-slate-900 border border-transparent"
                                                            )}
                                                            onClick={() => {
                                                                const current = newForm.usuarios_autorizados
                                                                if (current.includes(u.id)) {
                                                                    setNewForm(prev => ({ ...prev, usuarios_autorizados: current.filter(id => id !== u.id) }))
                                                                } else {
                                                                    setNewForm(prev => ({ ...prev, usuarios_autorizados: [...current, u.id] }))
                                                                }
                                                            }}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-white uppercase leading-none">
                                                                    {u.nombre_completo} {u.id === currentUserId && <span className="text-indigo-400 normal-case ml-1">(Tú)</span>}
                                                                </span>
                                                                <span className="text-[7px] font-medium text-slate-500 uppercase mt-1">{u.rol}</span>
                                                            </div>
                                                            {newForm.usuarios_autorizados.includes(u.id) && (
                                                                <Check className="w-3 h-3 text-indigo-400" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[8px] text-slate-500 italic px-1">Selecciona quiénes podrán gestionar esta cuenta.</p>
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button size="sm" variant="ghost" onClick={() => setIsAddingNew(false)} disabled={isSubmitting} className="h-8 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest">
                                        Cancelar
                                    </Button>
                                    <Button size="sm" onClick={handleCreateNew} disabled={isSubmitting} className="h-8 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white uppercase tracking-widest px-5">
                                        {isSubmitting ? <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Crear Cuenta'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        accounts.length >= 1 && !isGlobal ? (
                            <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-center gap-2">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <p className="text-[9px] font-bold text-amber-500/80 uppercase tracking-tight">Las carteras de asesores están limitadas a una sola cuenta.</p>
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                className="w-full h-10 border-dashed border-slate-700 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                onClick={() => setIsAddingNew(true)}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1.5" /> Agregar Cuenta
                            </Button>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
