'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface NotificationContextType {
    unreadCount: number
    refreshUnread: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [unreadCount, setUnreadCount] = useState(0)
    const router = useRouter()
    const supabase = React.useMemo(() => createClient(), [])
    const userIdRef = useRef<string | null>(null)

    const fetchUnread = useCallback(async () => {
        try {
            const response = await fetch('/api/notificaciones')
            if (response.ok) {
                const data = await response.json()
                setUnreadCount(data.no_leidas || 0)
            }
        } catch (e) {
            console.error('Error fetching unread count:', e)
        }
    }, [])

    const showBrowserNotification = async (titulo: string, mensaje: string) => {
        console.log('--- NOTIFICACIÓN NATIVA ---')
        console.log('Título:', titulo)
        console.log('Estado Permiso:', typeof Notification !== 'undefined' ? Notification.permission : 'N/A')

        if (typeof window === 'undefined') return
        
        const hasNotificationSupport = "Notification" in window
        if (!hasNotificationSupport) {
            console.warn('Navegador no soporta API de Notificaciones')
            return
        }

        // Si el permiso es 'default', lo pedimos
        if (Notification.permission === "default") {
            const permission = await Notification.requestPermission()
            if (permission !== "granted") return
        }

        if (Notification.permission !== "granted") {
            console.warn('Permisos de notificación denegados o no habilitados')
            return
        }

        try {
            const options: NotificationOptions = { 
                body: mensaje, 
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'realtime-notif-' + Date.now(),
                requireInteraction: false,
                silent: false
            }

            // Try Service Worker first with a timeout
            let usedSW = false
            if ('serviceWorker' in navigator) {
                try {
                    // Use a timeout to avoid hanging forever on serviceWorker.ready
                    const swReady = await Promise.race([
                        navigator.serviceWorker.ready,
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
                    ])
                    
                    if (swReady && 'showNotification' in swReady) {
                        await swReady.showNotification(titulo, options)
                        console.log('Enviada vía SW')
                        usedSW = true
                    }
                } catch (swErr) {
                    console.warn('SW notification failed, using fallback:', swErr)
                }
            }

            // Fallback to native Notification API
            if (!usedSW) {
                new Notification(titulo, options)
                console.log('Enviada vía Objeto Notification (fallback)')
            }
        } catch (err) {
            console.error('Error disparando notificación:', err)
        }
    }

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            userIdRef.current = user?.id || null

            fetchUnread()

            // Pedir permiso de notificaciones nativas si es posible
            if (typeof window !== 'undefined' && "Notification" in window) {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                const isStandalone = (window as any).navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
                if (!isIOS || isStandalone) {
                    try {
                        if (Notification.permission === "default") await Notification.requestPermission()
                    } catch (err) {
                        console.warn('No se pudo solicitar permiso de notificación automáticamente:', err)
                    }
                }
            }

            if (!user?.id) return

            channel = supabase
                .channel('notificaciones-globales')
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notificaciones',
                        filter: `usuario_destino_id=eq.${user.id}`
                    },
                    (payload) => {
                        const newNotif = payload.new as any
                        setUnreadCount(prev => prev + 1)
                        toast.success(newNotif.titulo, {
                            description: newNotif.mensaje,
                            duration: 8000,
                            action: newNotif.link_accion ? {
                                label: 'Ver Clientes',
                                onClick: () => window.location.href = newNotif.link_accion
                            } : undefined
                        })
                        showBrowserNotification(newNotif.titulo, newNotif.mensaje)
                        router.refresh()
                    }
                )
                .subscribe()
        }

        init()

        return () => {
            if (channel) supabase.removeChannel(channel)
        }
    }, [fetchUnread, supabase])

    // Auto-refresh del badge cuando la app vuelve al foreground (PWA iOS fix)
    useEffect(() => {
        let lastFetch = Date.now()
        const MIN_INTERVAL = 20_000 // 20 segundos mínimo entre refetches

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastFetch > MIN_INTERVAL) {
                lastFetch = Date.now()
                fetchUnread()
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [fetchUnread])

    return (
        <NotificationContext.Provider value={{ unreadCount, refreshUnread: fetchUnread }}>
            {children}
        </NotificationContext.Provider>
    )
}

export const useNotifications = () => {
    const context = useContext(NotificationContext)
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider')
    }
    return context
}
