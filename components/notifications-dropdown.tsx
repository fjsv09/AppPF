'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, BellOff, Check, ExternalLink, Loader2, Signal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { useNotifications } from './providers/notification-provider'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

interface Notification {
    id: string
    titulo: string
    mensaje: string
    link_accion: string | null
    tipo: string
    leido: boolean
    created_at: string
}

export function NotificationsDropdown() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const { unreadCount, refreshUnread } = useNotifications()
    const dropdownRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    // PUSH STATE
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [subscription, setSubscription] = useState<PushSubscription | null>(null)
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
    const [loadingPush, setLoadingPush] = useState(true)

    // PUSH EFFECTS
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    setRegistration(reg)
                    return reg.pushManager.getSubscription()
                })
                .then(sub => {
                    if (sub) {
                        setSubscription(sub)
                        setIsSubscribed(true)
                    }
                    setLoadingPush(false)
                })
                .catch(err => {
                    console.error('Service Worker registration failed:', err)
                    setLoadingPush(false)
                })
        } else {
            setLoadingPush(false)
        }
    }, [])

    const subscribePush = async () => {
        if (!registration) return
        try {
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            })

            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sub)
            })

            if (res.ok) {
                setSubscription(sub)
                setIsSubscribed(true)
                toast.success('Notificaciones web activadas')
            } else {
                const errData = await res.json()
                toast.error(`Error de servidor: ${errData.error || 'Desconocido'}`)
            }
        } catch (err) {
            console.error('Push subscription failed:', err)
            toast.error('Error al suscribir. Verifica los permisos del navegador.')
        }
    }

    const unsubscribePush = async () => {
        if (!subscription) return
        try {
            await subscription.unsubscribe()
            await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            })
            setSubscription(null)
            setIsSubscribed(false)
            toast.info('Notificaciones web desactivadas')
        } catch (err) {
            console.error('Unsubscribe failed:', err)
        }
    }

    // Fetch notifications
    const fetchNotifications = async () => {
        try {
            const response = await fetch('/api/notificaciones')
            if (response.ok) {
                const data = await response.json()
                setNotifications(data.notificaciones || [])
            }
        } catch (e) {
            console.error('Error fetching notifications:', e)
        } finally {
            setLoading(false)
        }
    }

    // Initial fetch
    useEffect(() => {
        if (open) {
            fetchNotifications()
        }
    }, [open])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Mark as read
    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notificaciones/${id}`, { method: 'PATCH' })
            setNotifications(prev => 
                prev.map(n => n.id === id ? { ...n, leido: true } : n)
            )
            refreshUnread()
        } catch (e) {
            console.error('Error marking as read:', e)
        }
    }

    // Mark all as read
    const markAllAsRead = async () => {
        try {
            await fetch('/api/notificaciones', { 
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true })
            })
            setNotifications(prev => prev.map(n => ({ ...n, leido: true })))
            refreshUnread()
        } catch (e) {
            console.error('Error marking all as read:', e)
        }
    }

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.leido) {
            markAsRead(notification.id)
        }
        if (notification.link_accion) {
            router.push(notification.link_accion)
            setOpen(false)
        }
    }

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMins < 1) return 'Ahora'
        if (diffMins < 60) return `${diffMins}m`
        if (diffHours < 24) return `${diffHours}h`
        return `${diffDays}d`
    }

    const getTypeColor = (tipo: string) => {
        switch (tipo) {
            case 'success': return 'bg-emerald-500'
            case 'warning': return 'bg-yellow-500'
            case 'error': return 'bg-red-500'
            default: return 'bg-blue-500'
        }
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* BELL BUTTON */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(!open)}
                className={`relative h-10 w-10 rounded-xl transition-all border ${
                    open 
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/30" 
                        : "bg-slate-800/40 text-slate-300 border-slate-700/50 hover:bg-slate-800"
                }`}
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse border-2 border-slate-900">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </Button>

            {/* Dropdown with high Z-Index and correct alignment */}
            {open && (
                <div className="absolute right-[-10px] md:right-auto md:left-0 top-full mt-2 w-85 sm:w-80 max-h-[85vh] overflow-hidden rounded-2xl bg-slate-950 border border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[9999] animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header with Push Toggle */}
                    <div className="p-4 border-b border-white/5 bg-slate-900/60 backdrop-blur-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                Notificaciones
                                {unreadCount > 0 && (
                                    <span className="bg-purple-600 text-[9px] px-1.5 py-0.5 rounded-full text-white animate-pulse">
                                        NUEVAS
                                    </span>
                                )}
                            </h3>
                            {unreadCount > 0 && (
                                <button 
                                    onClick={markAllAsRead}
                                    className="text-[10px] font-bold text-slate-500 hover:text-purple-400 uppercase tracking-tight transition-colors"
                                >
                                    Marcar todo leído
                                </button>
                            )}
                        </div>

                        {/* Push Activation UI */}
                        <div 
                            onClick={isSubscribed ? unsubscribePush : subscribePush}
                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border group ${
                                isSubscribed 
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isSubscribed ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                                    {isSubscribed ? <Signal className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold leading-none">Notificaciones Navegador</span>
                                    <span className="text-[10px] opacity-70 mt-1">
                                        {isSubscribed ? 'Vínculo activo' : 'Habilitar alertas nativas'}
                                    </span>
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded-md text-[9px] font-black border transition-all ${
                                isSubscribed 
                                    ? 'bg-emerald-500 text-white border-emerald-400' 
                                    : 'bg-amber-500 text-white border-amber-400 animate-pulse'
                            }`}>
                                {isSubscribed ? 'ON' : 'ACTIVAR'}
                            </div>
                        </div>

                        {/* Manual Tests */}
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (Notification.permission === 'granted') {
                                        new Notification("🔔 Prueba Local", { 
                                            body: "Las notificaciones locales funcionan.", 
                                            icon: '/favicon.ico' 
                                        });
                                    } else {
                                        Notification.requestPermission()
                                    }
                                }}
                                className="flex-1 py-1 px-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center gap-1.5"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                Test Local
                            </button>
                            <button
                                 onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                        const sb = createClient()
                                        const { data: { user } } = await sb.auth.getUser()
                                        if (!user) {
                                            console.error('[PUSH TEST] No hay usuario logueado.');
                                            return;
                                        }

                                        console.log('[PUSH TEST] Iniciando prueba para:', user.id);
                                        const sub = await registration?.pushManager.getSubscription();
                                        console.log('[PUSH TEST] Suscripción actual en navegador:', sub ? 'Existe' : 'No existe (null)');
                                        
                                        toast.promise(
                                            fetch('/api/notificaciones/manual', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    usuario_id: user.id,
                                                    titulo: '🚀 Prueba del Sistema',
                                                    mensaje: 'Validando canal de notificaciones push y realtime.',
                                                    tipo: 'success',
                                                    link: '/dashboard'
                                                })
                                            }).then(async (res) => {
                                                const data = await res.json();
                                                console.log('[PUSH TEST] Respuesta servidor:', data);
                                                if (!res.ok) throw new Error(data.error || 'Server error');
                                                return data;
                                            }),
                                            {
                                                loading: 'Enviando...',
                                                success: 'Prueba enviada - Revisa la consola si no llega el pop-up',
                                                error: 'Error de envío (ver consola)'
                                            }
                                        )
                                    } catch (err) {
                                        console.error('[PUSH TEST] Error capturado:', err);
                                    }
                                }}
                                className="flex-1 py-1 px-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center gap-1.5"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                Test Sistema
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center p-10 gap-3">
                                <Loader2 className="h-6 w-6 text-purple-500 animate-spin" />
                                <span className="text-[10px] text-slate-500 uppercase font-black">Cargando...</span>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-10 text-center">
                                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mb-3">
                                    <Bell className="h-6 w-6 text-slate-700" />
                                </div>
                                <p className="text-sm font-bold text-slate-500">Sin notificaciones</p>
                                <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-tighter">Todo al día por ahora</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => handleNotificationClick(n)}
                                    className={`group p-4 border-b border-white/5 cursor-pointer transition-all hover:bg-white/[0.03] ${
                                        !n.leido ? 'bg-purple-500/[0.03]' : ''
                                    }`}
                                >
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 mt-1">
                                            <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px] ${
                                                n.leido 
                                                    ? 'bg-slate-700 shadow-transparent' 
                                                    : getTypeColor(n.tipo) + ' shadow-current'
                                            }`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold leading-tight ${
                                                n.leido ? 'text-slate-400' : 'text-slate-100'
                                            }`}>
                                                {n.titulo}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                                {n.mensaje}
                                            </p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-[10px] font-mono text-slate-600">
                                                    {formatTime(n.created_at)}
                                                </span>
                                                {n.link_accion && (
                                                    <div className="flex items-center gap-1 text-[9px] font-black text-purple-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                                                        Ver detalle <ExternalLink className="h-2.5 w-2.5" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {!n.leido && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    markAsRead(n.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-all"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* All Notifications Link */}
                    {notifications.length > 0 && (
                        <div className="p-3 bg-slate-900/80 backdrop-blur-md border-t border-white/5">
                            <Link 
                                href="/dashboard/notificaciones"
                                onClick={() => setOpen(false)}
                                className="block w-full py-2 text-center text-[10px] font-black text-slate-500 hover:text-purple-400 uppercase tracking-[0.2em] transition-all"
                            >
                                Ver historial completo
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
