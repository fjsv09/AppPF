'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Users, Banknote, Calendar, ShieldAlert, History, LogOut, Settings, ChartBar, FileText, Menu, RefreshCw, Cog, Briefcase, Camera, Bell, Landmark, Wallet, UserCog, Receipt, CreditCard, Target, Award, Contact, ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react'
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
import { useSidebar } from './providers/sidebar-provider'
import { SimuladorPrestamoModal } from './prestamos/simulador-prestamo-modal'
import { Calculator } from 'lucide-react'

type Role = 'admin' | 'supervisor' | 'asesor'

interface DashboardNavProps {
    role: Role
    userName?: string
    userAvatar?: string
    systemName?: string
    systemLogo?: string
}

export function DashboardNav({ 
    role, 
    userName = 'Usuario', 
    userAvatar,
    systemName = 'Sistema PF', 
    systemLogo 
}: DashboardNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const { unreadCount } = useNotifications()
    const { isCollapsed, toggleSidebar } = useSidebar()
    const [isSimModalOpen, setIsSimModalOpen] = useState(false)
    const [pendingBonosCount, setPendingBonosCount] = useState(0)

    const [isPending, startTransition] = useTransition()
    const [loadingTarget, setLoadingTarget] = useState<string | null>(null)
    
    // Fetch pending bonuses count for Admin
    useEffect(() => {
        if (role !== 'admin') return

        const fetchCount = async () => {
            const { count, error } = await supabase
                .from('bonos_pagados')
                .select('*', { count: 'exact', head: true })
                .eq('estado', 'pendiente')
            
            if (!error && count !== null) setPendingBonosCount(count)
        }

        fetchCount()

        const channel = supabase
            .channel('pending-bonos')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bonos_pagados' }, fetchCount)
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [role, supabase])

    // Reset loading target when transition ends
    useEffect(() => {
        if (!isPending) setLoadingTarget(null)
    }, [isPending])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/login')
    }

    const handleLinkClick = (href: string) => {
        if (pathname === href) return
        setLoadingTarget(href)
        startTransition(() => {
            router.push(href)
        })
    }

    const links = [
        { href: '/dashboard', label: 'Inicio', icon: Home, roles: ['admin', 'supervisor', 'asesor'], category: 'Principal' },
        { href: '/dashboard/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        { href: '/dashboard/notificaciones', label: 'Notificaciones', icon: Bell, roles: ['admin', 'supervisor', 'asesor'], category: 'Principal' },
        { href: '/dashboard/prestamos', label: 'Préstamos', icon: Banknote, roles: ['admin', 'supervisor', 'asesor'], category: 'Operaciones' },
        { href: '/dashboard/perfil', label: 'Mi Perfil', icon: Contact, roles: ['admin', 'supervisor', 'asesor'], category: 'Principal' },
        
        // --- Gestión Financiera ---
        { href: '/dashboard/admin/carteras', label: 'Gestionar Carteras', icon: Briefcase, roles: ['admin'], category: 'Finanzas' },
        { href: '/dashboard/admin/cuadres', label: 'Gestión de Cuadres', icon: Landmark, roles: ['admin'], category: 'Finanzas' },

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
        { href: '/dashboard/usuarios', label: 'Gestión de Equipo', icon: UserCog, roles: ['admin'], category: 'Gestión' },
        { href: '/dashboard/supervision', label: 'Supervisión', icon: ChartBar, roles: ['admin', 'supervisor'], category: 'Gestión' },
        { href: '/dashboard/auditoria', label: 'Auditoría', icon: History, roles: ['admin', 'supervisor'], category: 'Gestión' },
        { href: '/dashboard/asistencia', label: 'Asistencia', icon: Clock, roles: ['admin', 'supervisor', 'asesor'], category: 'Gestión' },
        
        // --- Configuración y Admin ---
        { href: '/dashboard/admin/sectores', label: 'Sectores', icon: Briefcase, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/config-sistema', label: 'Configuración', icon: Cog, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/alertas', label: 'Alertas', icon: ShieldAlert, roles: ['admin'], category: 'Configuración' },
        { href: '/dashboard/configuracion/feriados', label: 'Feriados', icon: Calendar, roles: ['admin'], category: 'Configuración' },
    ]

    const filteredLinks = links.filter(link => link.roles.includes(role))
    const categories = Array.from(new Set(filteredLinks.map(link => link.category)))

    return (
        <>
            {/* Nav Progress Listener (Global feedback) */}
            {isPending && (
                <div className="fixed top-0 left-0 right-0 h-0.5 bg-blue-500 z-[9999] animate-pulse">
                    <div className="h-full bg-white/30 animate-in fade-in duration-500 w-1/3 shadow-[0_0_8px_white]" />
                </div>
            )}

            {/* Desktop Sidebar */}
            <nav className={cn(
                "hidden md:flex flex-col border-r border-white/5 bg-slate-950/40 backdrop-blur-xl h-full fixed left-0 top-0 z-[100] transition-all duration-300",
                isCollapsed ? "w-16 p-2" : "w-64 p-4"
            )}>
                {/* Brand / Logo */}
                <div className={cn(
                    "mb-10 flex items-center px-2",
                    isCollapsed ? "flex-col gap-6 px-0" : "justify-between"
                )}>
                    <div className="flex items-center gap-3 overflow-hidden">
                        {systemLogo ? (
                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-lg shadow-blue-900/20 border border-white/10">
                                <img src={systemLogo} alt="Logo" className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-lg shadow-blue-900/20">
                                <Banknote className="w-6 h-6 text-white" />
                            </div>
                        )}
                        {!isCollapsed && (
                            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                <h1 className="text-lg font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent truncate w-28" title={systemName}>
                                    {systemName}
                                </h1>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold border-t border-slate-800/50 pt-0.5 mt-0.5 block">
                                    Professional
                                </span>
                            </div>
                        )}
                    </div>
                    {/* Notifications (Restored) */}
                    <div className={cn(
                        "flex items-center gap-2 ml-auto pl-4",
                        isCollapsed ? "justify-center mt-2 ml-0 pl-0" : ""
                    )}>
                        <NotificationsDropdown />
                    </div>
                </div>

                {/* Quick Action: Simulator */}
                <div className={cn(
                    "mb-6 px-2 animate-in fade-in duration-500 delay-150",
                    isCollapsed ? "flex justify-center" : ""
                )}>
                    <Button
                        onClick={() => setIsSimModalOpen(true)}
                        className={cn(
                            "w-full bg-gradient-to-r from-blue-600/10 to-indigo-600/10 hover:from-blue-600/20 hover:to-indigo-600/20 border border-blue-500/20 text-blue-400 group transition-all duration-300 rounded-xl flex items-center shadow-lg shadow-blue-500/5",
                            isCollapsed ? "justify-center p-0 h-10 w-10" : "justify-start gap-3 h-11 px-4"
                        )}
                        title={isCollapsed ? "Simulador Ágil" : ""}
                    >
                        <Calculator className={cn(
                            "transition-transform group-hover:scale-110 duration-300",
                            isCollapsed ? "h-5 w-5" : "h-5 w-5"
                        )} />
                        {!isCollapsed && (
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-[11px] font-bold uppercase tracking-wider">Simulador</span>
                                <span className="text-[8px] text-blue-400/50 uppercase font-medium tracking-widest">Ágil e Instantáneo</span>
                            </div>
                        )}
                    </Button>
                </div>

                {/* Sidebar Collapse Toggle */}
                <button
                    onClick={toggleSidebar}
                    className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all z-50 shadow-md"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                    {categories.map((category) => (
                        <div key={category} className="space-y-2">
                            {!isCollapsed && (
                                <h2 className="px-4 text-[9px] font-bold uppercase tracking-widest text-slate-500/70 animate-in fade-in duration-300">
                                    {category}
                                </h2>
                            )}
                            <div className="space-y-1">
                                {filteredLinks
                                    .filter(link => link.category === category && link.href !== '/dashboard/notificaciones')
                                    .map((link) => {
                                        const Icon = link.icon
                                        const isActive = pathname === link.href
                                        const isThisLoading = loadingTarget === link.href && isPending
                                        
                                        return (
                                            <button
                                                key={link.href}
                                                onClick={() => handleLinkClick(link.href)}
                                                title={isCollapsed ? link.label : ""}
                                                className={cn(
                                                    "w-full group flex items-center rounded-xl p-2.5 text-sm font-medium transition-all duration-300 relative overflow-hidden",
                                                    isCollapsed ? "justify-center" : "gap-3 px-4",
                                                    isActive
                                                        ? "text-white shadow-lg shadow-blue-900/20"
                                                        : "text-slate-400 hover:text-white hover:bg-white/5",
                                                    isPending && "pointer-events-none"
                                                )}
                                            >
                                                {isActive && (
                                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/10 rounded-xl" />
                                                )}
                                                
                                                <Icon className={cn(
                                                    "h-5 w-5 transition-colors relative z-10 flex-shrink-0",
                                                    isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                                                )} />
                                                
                                                {!isCollapsed && (
                                                    <span className="relative z-10 animate-in fade-in slide-in-from-left-1 duration-300">{link.label}</span>
                                                )}
                                                
                                                {!isCollapsed && (
                                                    <div className="absolute right-3 flex items-center gap-2">
                                                        {isThisLoading && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                                                        {link.href === '/dashboard/admin/metas' && pendingBonosCount > 0 && (
                                                            <span className="h-4 min-w-[16px] px-1 rounded-full bg-blue-500 text-[9px] font-black text-white flex items-center justify-center border border-slate-900 shadow-[0_0_10px_rgba(59,130,246,0.6)]">
                                                                {pendingBonosCount}
                                                            </span>
                                                        )}
                                                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />}
                                                    </div>
                                                )}
                                                
                                                {isCollapsed && isThisLoading && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-20">
                                                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                                    </div>
                                                )}
                                            </button>
                                        )
                                    })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* User Profile / Footer */}
                <div className="mt-8 pt-6 border-t border-white/5">
                    <button 
                        onClick={() => handleLinkClick('/dashboard/perfil')}
                        className={cn(
                            "flex items-center gap-3 px-2 mb-4 hover:bg-white/5 p-1.5 rounded-xl transition-all w-full text-left",
                            isCollapsed ? "justify-center" : ""
                        )}
                    >
                        <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border border-white/10 flex-shrink-0 flex items-center justify-center text-slate-300 font-bold text-sm shadow-inner group-hover:border-blue-500/50 transition-colors overflow-hidden">
                            {userAvatar ? (
                                <img src={userAvatar} alt="Perfil" className="w-full h-full object-cover" />
                            ) : (
                                <UserCog className="w-5 h-5 text-slate-400" />
                            )}
                        </div>
                        {!isCollapsed && (
                            <div className="overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300">
                                <p className="text-sm font-bold text-slate-200 truncate">{userName}</p>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <p className="text-xs text-slate-500 capitalize">{role}</p>
                                </div>
                            </div>
                        )}
                    </button>
                    
                    <Button 
                        variant="ghost" 
                        title={isCollapsed ? "Cerrar Sesión" : ""}
                        className={cn(
                            "w-full text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 transition-all group rounded-xl",
                            isCollapsed ? "justify-center px-0" : "justify-start"
                        )} 
                        onClick={handleSignOut}
                    >
                        <LogOut className={cn(
                            "group-hover:translate-x-1 transition-transform",
                            isCollapsed ? "h-5 w-5" : "mr-2 h-4 w-4"
                        )} />
                        {!isCollapsed && <span>Cerrar Sesión</span>}
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

                        {/* Simulator Mobile */}
                        <DropdownMenuItem onClick={() => setIsSimModalOpen(true)} className="flex items-center gap-2 cursor-pointer text-blue-400 hover:text-blue-300 focus:text-blue-300 hover:bg-blue-500/10 focus:bg-blue-500/10">
                            <Calculator className="h-4 w-4" />
                            <span className="font-bold">Simulador Ágil</span>
                        </DropdownMenuItem>
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

            <SimuladorPrestamoModal 
                isOpen={isSimModalOpen} 
                onClose={() => setIsSimModalOpen(false)} 
            />
        </>
    )
}
