import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { BackButton } from "@/components/ui/back-button";
import { UserPlus, Users, Shield, User, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    
    // Get current user's profile to check if admin
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect('/login')
    }

    // Check if user is admin - use Admin Client to bypass RLS
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    const isAdmin = perfil?.rol === 'admin'

    // Get all users (only if admin) - use Admin Client
    let usuarios: any[] = []
    let supervisores: any[] = []
    if (isAdmin) {
        const { data } = await supabaseAdmin
            .from('perfiles')
            .select('*')
            .order('created_at', { ascending: false })
        usuarios = data || []

        // Get supervisors for the form
        const { data: sups } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo')
            .eq('rol', 'supervisor')
            .order('nombre_completo')
        supervisores = sups || []
    }

    const getRoleIcon = (rol: string) => {
        switch (rol) {
            case 'admin': return <Shield className="w-4 h-4 text-red-400" />
            case 'supervisor': return <Users className="w-4 h-4 text-purple-400" />
            default: return <User className="w-4 h-4 text-blue-400" />
        }
    }

    const getRoleBadgeClass = (rol: string) => {
        switch (rol) {
            case 'admin': return 'bg-red-950/50 text-red-400 border-red-900/50'
            case 'supervisor': return 'bg-purple-950/50 text-purple-400 border-purple-900/50'
            default: return 'bg-blue-950/50 text-blue-400 border-blue-900/50'
        }
    }

    // If not admin, show access denied
    if (!isAdmin) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Acceso Denegado</h1>
                    <p className="text-slate-400">Solo los administradores pueden gestionar usuarios.</p>
                    <p className="text-sm text-slate-500">Tu rol actual: <span className="font-bold capitalize">{perfil?.rol || 'desconocido'}</span></p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="border-b border-white/5 pb-6">
                <div className="flex items-center gap-3">
                    <BackButton />
                    <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">Gestión de Usuarios</h1>
                </div>
                <p className="text-slate-400 mt-2 md:mt-1">Administra los usuarios del sistema</p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Create User Form */}
                <div className="lg:col-span-1">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl sticky top-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-emerald-900/30 rounded-xl flex items-center justify-center">
                                <UserPlus className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">Nuevo Usuario</h2>
                                <p className="text-xs text-slate-400">Crear cuenta de acceso</p>
                            </div>
                        </div>
                        <CreateUserForm supervisores={supervisores} />
                    </div>
                </div>

                {/* Users List */}
                <div className="lg:col-span-2">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Users className="w-5 h-5 text-slate-500" />
                                Usuarios Registrados
                            </h3>
                            <span className="text-sm text-slate-500">{usuarios.length} usuarios</span>
                        </div>

                        {/* Table */}
                        <div className="divide-y divide-slate-800/50">
                            {usuarios.map((usuario) => (
                                <div key={usuario.id} className="px-6 py-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                                            ${usuario.rol === 'admin' ? 'bg-red-900/30 text-red-400' : 
                                              usuario.rol === 'supervisor' ? 'bg-purple-900/30 text-purple-400' : 
                                              'bg-blue-900/30 text-blue-400'}`}>
                                            {usuario.nombre_completo?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{usuario.nombre_completo || 'Sin nombre'}</p>
                                            <p className="text-xs text-slate-500 font-mono">{usuario.id.slice(0, 8)}...</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className={getRoleBadgeClass(usuario.rol)}>
                                            <span className="flex items-center gap-1.5">
                                                {getRoleIcon(usuario.rol)}
                                                {usuario.rol.toUpperCase()}
                                            </span>
                                        </Badge>
                                    </div>
                                </div>
                            ))}

                            {usuarios.length === 0 && (
                                <div className="px-6 py-12 text-center text-slate-500">
                                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No hay usuarios registrados</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
