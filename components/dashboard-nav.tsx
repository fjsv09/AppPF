'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Users, Banknote, Calendar, ShieldAlert, History, LogOut, Settings, ChartBar, FileText, Menu, RefreshCw, Cog, Briefcase, Camera, Bell, Landmark, Wallet, UserCog, Receipt, CreditCard, Target, Award } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from './ui/button'
import { NotificationsDropdown } from './notifications-dropdown'
import { useNotifications } from './providers/notification-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Role = 'admin' | 'supervisor' | 'asesor'

interface DashboardNavProps {
    role: Role
    userName?: string
}

export function DashboardNav({ role, userName = 'Usuario' }: DashboardNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const { unreadCount } = useNotifications()

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/login')
    }

    const links = [
        { href: '/dashboard', label: 'Inicio', icon: Home, roles: ['admin', 'supervisor', 'asesor'], category: 'Principal' },
        { href: '/dashboard/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        { href: '/dashboard/notificaciones', label: 'Notificaciones', icon: Bell, roles: ['admin', 'supervisor', 'asesor'], category: 'Principal' },
        { href: '/dashboard/prestamos', label: 'Préstamos', icon: Banknote, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        
        // --- Gestión Financiera ---
        { href: '/dashboard/admin/cuadres', label: 'Aprobar Cuadres', icon: Landmark, roles: ['admin'], category: 'Finanzas' },
        { href: '/dashboard/cuadre', label: 'Cuadre de Caja', icon: Wallet, roles: ['asesor'], category: 'Finanzas' },
        { href: '/dashboard/gastos', label: 'Gastos Operativos', icon: Receipt, roles: ['admin', 'supervisor', 'asesor'], category: 'Finanzas' },
        { href: '/dashboard/nomina', label: 'Nómina y Bonos', icon: CreditCard, roles: ['admin', 'supervisor', 'asesor'], category: 'Finanzas' },
        { href: '/dashboard/admin/metas', label: 'Gestión de Metas', icon: Target, roles: ['admin'], category: 'Finanzas' },
        { href: '/dashboard/metas', label: 'Metas y Bonos', icon: Award, roles: ['admin', 'supervisor', 'asesor'], category: 'Finanzas' },
        
        // --- Operaciones ---
        { href: '/dashboard/solicitudes', label: 'Solicitudes', icon: FileText, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        { href: '/dashboard/renovaciones', label: 'Renovaciones', icon: RefreshCw, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        { href: '/dashboard/tareas', label: 'Tareas', icon: Camera, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        { href: '/dashboard/pagos', label: 'Pagos', icon: Calendar, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        
        // --- Gestión y Supervisión ---
        { href: '/dashboard/supervision', label: 'Supervisión', icon: ChartBar, roles: ['admin', 'supervisor'], category: 'Gestión' },
        { href: '/dashboard/auditoria', label: 'Auditoría', icon: History, roles: ['admin', 'supervisor'], category: 'Gestión' },
        
        // --- Configuración y Admin ---
        { href: '/dashboard/admin/carteras', label: 'Gestionar Carteras', icon: Briefcase, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/usuarios', label: 'Gestionar Equipo', icon: UserCog, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/admin/sectores', label: 'Sectores', icon: Briefcase, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/config-sistema', label: 'Configuración', icon: Cog, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/alertas', label: 'Alertas', icon: ShieldAlert, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/configuracion/feriados', label: 'Feriados', icon: Calendar, roles: ['admin'], category: 'Configuración' },
    ]

    const filteredLinks = links.filter(link => link.roles.includes(role))
    const categories = Array.from(new Set(filteredLinks.map(link => link.category)))

    return (
        <>
            {/* Desktop Sidebar */}
            <nav className="hidden md:flex flex-col w-72 border-r border-white/5 bg-slate-950/40 backdrop-blur-xl p-6 h-full fixed left-0 top-0 z-[100]">
                {/* Brand / Logo */}
                <div className="mb-8 flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <Banknote className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                                Sistema PF
                            </h1>
                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold border-t border-slate-800/50 pt-0.5 mt-0.5 block">
                                Professional
                            </span>
                        </div>
                    </div>
                    {/* Top Actions */}
                    <div className="flex items-center gap-2">
                        <NotificationsDropdown />
                    </div>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                    {categories.map((category) => (
                        <div key={category} className="space-y-2">
                            <h2 className="px-4 text-[10px] font-bold uppercase tracking-widest text-slate-500/70">
                                {category}
                            </h2>
                            <div className="space-y-1">
                                {filteredLinks
                                    .filter(link => link.category === category && link.href !== '/dashboard/notificaciones')
                                    .map((link) => {
                                        const Icon = link.icon
                                        const isActive = pathname === link.href
                                        
                                        return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                className={cn(
                                                    "group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 relative overflow-hidden",
                                                    isActive
                                                        ? "text-white shadow-lg shadow-blue-900/20"
                                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                                )}
                                            >
                                                {isActive && (
                                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/10 rounded-xl" />
                                                )}
                                                
                                                <Icon className={cn(
                                                    "h-5 w-5 transition-colors relative z-10",
                                                    isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                                                )} />
                                                <span className="relative z-10">{link.label}</span>
                                                
                                                {isActive && (
                                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                                )}
                                            </Link>
                                        )
                                    })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* User Profile / Footer */}
                <div className="mt-8 pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3 px-2 mb-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 font-bold text-sm shadow-inner">
                            {userName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold text-slate-200 truncate">{userName}</p>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-xs text-slate-500 capitalize">{role}</p>
                            </div>
                        </div>
                    </div>
                    
                    <Button 
                        variant="ghost" 
                        className="w-full justify-start text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 transition-all group rounded-xl" 
                        onClick={handleSignOut}
                    >
                        <LogOut className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        Cerrar Sesión
                    </Button>
                </div>
            </nav>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 bg-slate-950/90 backdrop-blur-xl p-2 px-4 flex justify-around items-center z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
                {filteredLinks.slice(0, 4).map((link) => {
                    const Icon = link.icon
                    const isActive = pathname === link.href
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-xl transition-all relative w-16",
                                isActive ? "text-blue-400" : "text-slate-500 scale-95"
                            )}
                        >
                             {isActive && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-500 rounded-b-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                            )}
                            <div className="relative">
                                <Icon className={cn("h-6 w-6", isActive && "animate-bounce-subtle")} />
                                {link.href === '/dashboard/notificaciones' && unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center border border-slate-900">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-medium mt-1">{link.label}</span>
                        </Link>
                    )
                })}

                {/* More Menu (Replaces direct Logout) */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex flex-col items-center justify-center p-2 text-slate-500 hover:text-white transition-colors w-16 outline-none focus:text-white">
                            <Menu className="h-6 w-6" />
                            <span className="text-[10px] font-medium mt-1">Más</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-56 bg-slate-900 border-slate-800 mb-2">
                        <DropdownMenuLabel className="text-slate-400 text-xs uppercase tracking-wider">Opciones</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-slate-800" />

                        {/* Hidden Links */}
                        {filteredLinks.slice(4).map((link) => {
                            const Icon = link.icon
                            return (
                                <DropdownMenuItem key={link.href} asChild>
                                    <Link href={link.href} className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white focus:text-white hover:bg-slate-800/50 focus:bg-slate-800/50">
                                        <Icon className="h-4 w-4 text-blue-400" />
                                        <span>{link.label}</span>
                                    </Link>
                                </DropdownMenuItem>
                            )
                        })}

                        {filteredLinks.length > 4 && <DropdownMenuSeparator className="bg-slate-800" />}
                        
                        {/* Logout Option */}
                        <DropdownMenuItem 
                            onClick={handleSignOut}
                            className="text-red-400 focus:text-red-300 focus:bg-red-950/20 cursor-pointer flex items-center gap-2"
                        >
                            <LogOut className="h-4 w-4" />
                            <span>Cerrar Sesión</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </nav>
        </>
    )
}
