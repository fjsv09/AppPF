'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Check, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/providers/notification-provider'

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

export default function NotificacionesPage() {
    const [loading, setLoading] = useState(true)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const { refreshUnread } = useNotifications()
    const [activeTab, setActiveTab] = useState<'unread' | 'history'>('unread')
    const [isMounted, setIsMounted] = useState(false)
    const router = useRouter()

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // PUSH STATE
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [subscription, setSubscription] = useState<PushSubscription | null>(null)
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
    const [loadingPush, setLoadingPush] = useState(true)

    // PUSH EFFECTS - Wait for SW to be fully active
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready
                .then(async (reg) => {
                    setRegistration(reg)
                    const sub = await reg.pushManager.getSubscription()
                    if (sub) {
                        setSubscription(sub)
                        setIsSubscribed(true)
                        // Re-sync subscription to server
                        try {
                            await fetch('/api/push/subscribe', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(sub)
                            })
                            console.log('[Push] Re-synced subscription to server')
                        } catch (e) {
                            console.warn('[Push] Could not re-sync:', e)
                        }
                    }
                    setLoadingPush(false)
                })
                .catch(err => {
                    console.error('Service Worker ready check failed:', err)
                    setLoadingPush(false)
                })
        } else {
            setLoadingPush(false)
        }
    }, [])

    const subscribePush = async () => {
        let currentReg = registration
        
        // Si no tenemos registro, lo intentamos esperar desde ready
        if (!currentReg) {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                try {
                    currentReg = await navigator.serviceWorker.ready
                    setRegistration(currentReg)
                } catch (err: any) {
                    toast.error(`Error al obtener SW: ${err.message}`)
                    return
                }
            } else {
                toast.error('Las notificaciones Push no son soportadas en este navegador.')
                return
            }
        }
        
        // Si aún así no lo tenemos, abortamos
        if (!currentReg) {
            toast.error('No se pudo inicializar el Service Worker.')
            return
        }

        if (!VAPID_PUBLIC_KEY) {
            toast.error('Faltan claves VAPID en el servidor (Vercel). Configura las variables de entorno.')
            return
        }

        try {
            // Solicitar permiso explícitamente primero
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') {
                toast.error('Permiso de notificaciones denegado por el navegador.')
                return
            }

            const sub = await currentReg.pushManager.subscribe({
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
        } catch (err: any) {
            console.error('Push subscription failed:', err)
            toast.error(`Error al suscribir: ${err.message || 'Verifica los permisos.'}`)
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
                setUnreadCount(data.no_leidas || 0)
            }
        } catch (e) {
            console.error('Error fetching notifications:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchNotifications()
    }, [])

    // Auto-refresh cuando la app vuelve al foreground (PWA iOS fix)
    useEffect(() => {
        let lastFetch = Date.now()
        const MIN_INTERVAL = 15_000 // 15 segundos mínimo entre refetches

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastFetch > MIN_INTERVAL) {
                lastFetch = Date.now()
                fetchNotifications()
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [fetchNotifications])

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notificaciones/${id}`, { method: 'PATCH' })
            setNotifications(prev => 
                prev.map(n => n.id === id ? { ...n, leido: true } : n)
            )
            setUnreadCount(prev => Math.max(0, prev - 1))
            refreshUnread()
        } catch (e) {
            console.error('Error marking as read:', e)
        }
    }

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notificaciones', { 
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true })
            })
            setNotifications(prev => prev.map(n => ({ ...n, leido: true })))
            setUnreadCount(0)
            refreshUnread()
            toast.success('Todas las notificaciones marcadas como leídas')
        } catch (e) {
            console.error('Error marking all as read:', e)
        }
    }

    const unreadNotifications = notifications.filter(n => !n.leido)
    const historyNotifications = notifications.filter(n => n.leido)

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.leido) {
            markAsRead(notification.id)
        }
        if (notification.link_accion) {
            router.push(notification.link_accion)
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
        <div className="page-container max-w-2xl mx-auto">
                {/* Header Compacto */}
                <div className="page-header">
                    <div>
                        <div className="flex items-center gap-3">
                            <BackButton />
                            <div>
                                <h1 className="page-title">Notificaciones</h1>
                                <p className="page-subtitle">Configuración e Historial</p>
                            </div>
                        </div>
                    </div>
                    {isMounted && unreadCount > 0 && (
                        <button 
                            onClick={markAllAsRead}
                            className="text-[10px] font-bold text-slate-500 hover:text-purple-400 uppercase tracking-tighter"
                        >
                            Marcar todo leído
                        </button>
                    )}
                </div>

                {/* PUSH STATUS - Hidden if already subscribed */}
                {isMounted && !isSubscribed && (
                    <div 
                        onClick={subscribePush}
                        className="mb-5 p-4 rounded-xl border transition-all active:scale-[0.98] cursor-pointer bg-orange-500/5 border-orange-500/10 text-orange-400"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-orange-500/20">
                                    <BellOff className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold leading-none">Alertas de Navegador</span>
                                    <span className="text-[10px] opacity-70 mt-1">
                                        Actívalas para no perderte nada
                                    </span>
                                </div>
                            </div>
                            <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-500/20">
                                ACTIVAR
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB NAVIGATION */}
                <div className="flex p-1 bg-slate-900/50 border border-slate-800 rounded-2xl mb-8">
                    <button
                        onClick={() => setActiveTab('unread')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all",
                            activeTab === 'unread' 
                                ? "bg-purple-600 text-white shadow-lg shadow-purple-900/20" 
                                : "text-slate-500 hover:text-slate-300"
                        )}
                    >
                        NO LEÍDAS
                        {unreadNotifications.length > 0 && (
                            <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[9px]",
                                activeTab === 'unread' ? "bg-white text-purple-600" : "bg-slate-800 text-slate-500"
                            )}>
                                {unreadNotifications.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all",
                            activeTab === 'history' 
                                ? "bg-purple-600 text-white shadow-lg shadow-purple-900/20" 
                                : "text-slate-500 hover:text-slate-300"
                        )}
                    >
                        HISTORIAL
                        {historyNotifications.length > 0 && (
                            <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[9px]",
                                activeTab === 'history' ? "bg-white text-purple-600" : "bg-slate-800 text-slate-500"
                            )}>
                                {historyNotifications.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* LISTADO - Contenido según Tab Activa */}
                <div className="pb-10 min-h-[400px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="h-6 w-6 text-slate-700 animate-spin" />
                            <p className="text-xs text-slate-500">Cargando...</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {activeTab === 'unread' ? (
                                <div className="space-y-3">
                                    {unreadNotifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-slate-600 border border-dashed border-slate-800/50 rounded-3xl bg-slate-950/20">
                                            <div className="w-16 h-16 rounded-full bg-slate-900/50 flex items-center justify-center mb-4">
                                                <Check className="h-8 w-8 opacity-20" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Todo al día</p>
                                            <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-tighter">No tienes notificaciones pendientes</p>
                                        </div>
                                    ) : (
                                        unreadNotifications.map((notification) => (
                                            <div
                                                key={notification.id}
                                                onClick={() => handleNotificationClick(notification)}
                                                className="p-4 rounded-xl border transition-all hover:bg-white/5 cursor-pointer relative bg-purple-500/5 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]"
                                            >
                                                <div className="flex gap-3">
                                                    <div className={cn(
                                                        "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                                        getTypeColor(notification.tipo)
                                                    )} />
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <p className="text-sm font-bold truncate text-white">
                                                                {notification.titulo}
                                                            </p>
                                                            <span className="text-[10px] text-slate-600 font-bold whitespace-nowrap">
                                                                {formatTime(notification.created_at)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-snug line-clamp-2 mb-2">
                                                            {notification.mensaje}
                                                        </p>
                                                        
                                                        <div className="flex items-center justify-between">
                                                            {notification.link_accion ? (
                                                                <div className="flex items-center gap-1 text-[10px] font-bold text-blue-400 uppercase tracking-tighter">
                                                                    Ver detalle <ExternalLink className="h-2.5 w-2.5" />
                                                                </div>
                                                            ) : <div />}
                                                            
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    markAsRead(notification.id)
                                                                }}
                                                                className="text-[10px] font-bold text-slate-500 hover:text-emerald-400 transition-colors uppercase"
                                                            >
                                                                Marcar leído
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {historyNotifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-slate-700 border border-dashed border-slate-900 rounded-3xl">
                                            <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Historial vacío</p>
                                            <p className="text-[10px] text-slate-700 mt-1 uppercase tracking-tighter">Las notificaciones leídas aparecerán aquí</p>
                                        </div>
                                    ) : (
                                        historyNotifications.map((notification) => (
                                            <div
                                                key={notification.id}
                                                onClick={() => handleNotificationClick(notification)}
                                                className="p-4 rounded-xl border transition-all hover:bg-white/5 cursor-pointer relative bg-slate-900/20 border-slate-800/40"
                                            >
                                                <div className="flex gap-3">
                                                    <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-slate-700" />
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <p className="text-sm font-bold truncate text-slate-400">
                                                                {notification.titulo}
                                                            </p>
                                                            <span className="text-[10px] text-slate-600 font-bold whitespace-nowrap">
                                                                {formatTime(notification.created_at)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-snug line-clamp-2 mb-2">
                                                            {notification.mensaje}
                                                        </p>
                                                        
                                                        {notification.link_accion && (
                                                            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-400/50 uppercase tracking-tighter">
                                                                Ver detalle <ExternalLink className="h-2.5 w-2.5" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
        </div>
    )
}
