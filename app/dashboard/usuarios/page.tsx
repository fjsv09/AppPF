import { Metadata } from 'next'
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import { EmployeeManager } from "@/components/admin/employee-manager";
import { BackButton } from "@/components/ui/back-button";
import { UserPlus, Users, ShieldAlert, Cake, CalendarDays, Shield, AlertTriangle } from "lucide-react";
import { isSameDay, isSameMonth } from 'date-fns';

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Gestión de Equipo'
}

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

    // Fetch all profiles
    const { data: profiles } = await supabaseAdmin
        .from('perfiles')
        .select('*, supervisor:supervisor_id(nombre_completo)')
        .order('nombre_completo')

    // Fetch all auth users to get emails
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()

    // Merge email into profile data
    const employees = profiles?.map(profile => {
        const authUser = users.find(u => u.id === profile.id)
        return {
            ...profile,
            email: authUser?.email || ''
        }
    }) || []

    const supervisors = employees.filter(e => e.rol === 'supervisor' || e.rol === 'admin')

    // Birthdays today
    const today = new Date()
    const birthdaysToday = employees?.filter(e => {
        if (!e.fecha_nacimiento) return false
        // Assuming fecha_nacimiento is 'YYYY-MM-DD'
        const bday = new Date(e.fecha_nacimiento + 'T00:00:00') 
        return bday.getDate() === today.getDate() && bday.getMonth() === today.getMonth()
    })

    return (
        <div className="page-container">
            {/* Header Section */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Gestión de Equipo</h1>
                            <p className="page-subtitle">
                                Administra accesos, información de personal y jerarquía organizacional.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Main Content: Employee List */}
                <div className="lg:col-span-12 xl:col-span-9 space-y-8">
                    <EmployeeManager employees={employees || []} supervisors={supervisors} />
                </div>

                {/* Sidebar: Info */}
                <div className="lg:col-span-12 xl:col-span-3 space-y-6">
                    {/* Birthdays Card */}
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-600/10 to-transparent border border-purple-500/20 shadow-xl overflow-hidden relative group">
                        <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                            <Cake className="w-24 h-24 text-purple-400" />
                        </div>
                        <h4 className="text-purple-400 font-bold mb-4 flex items-center gap-2">
                            <CalendarDays className="w-5 h-5" />
                            Cumpleaños de hoy
                        </h4>
                        <div className="space-y-4 relative z-10">
                            {birthdaysToday?.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">No hay cumpleaños registrados para hoy.</p>
                            ) : (
                                birthdaysToday?.map(e => (
                                    <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center font-bold text-purple-400">
                                            {e.nombre_completo.charAt(0)}
                                        </div>
                                        <p className="text-sm font-bold text-white uppercase">{e.nombre_completo}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Security Warning */}
                    <div className="p-6 rounded-2xl bg-rose-600/5 border border-rose-500/20">
                        <div className="flex items-center gap-3 mb-3">
                            <ShieldAlert className="w-5 h-5 text-rose-500" />
                            <h4 className="text-rose-400 font-bold text-sm">Control de Seguridad</h4>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Al <span className="text-rose-400 font-bold">suspender</span> a un colaborador, este perderá acceso inmediato a todas las funciones del sistema.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

