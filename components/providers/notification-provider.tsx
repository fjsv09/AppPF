'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

interface NotificationContextType {
    unreadCount: number
    refreshUnread: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [unreadCount, setUnreadCount] = useState(0)
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

        if (typeof window === 'undefined' || !("Notification" in window)) {
            console.error('Navegador no soporta notificaciones')
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
        // Cargar usuario inicial y persistir en Ref
        const initUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            userIdRef.current = user?.id || null
            console.log('NotificationProvider: Usuario cargado ->', userIdRef.current)
        }
        
        initUser()
        fetchUnread()
        
        // Registro proactivo de permisos
        if (typeof window !== 'undefined' && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission().then(p => console.log('Respuesta permiso inicial:', p))
            }
        }

        console.log('Configurando canal realtime para notificaciones...')
        
        const channel = supabase
            .channel('notificaciones-globales')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notificaciones'
                },
                (payload) => {
                    const newNotif = payload.new as any
                    console.log('Recibida nueva notificación DB:', newNotif)
                    
                    // Solo si es para mí
                    if (userIdRef.current && newNotif.usuario_destino_id === userIdRef.current) {
                        setUnreadCount(prev => prev + 1)
                        
                        // 1. Toast de Sonner (UI interna)
                        toast.success(newNotif.titulo, {
                            description: newNotif.mensaje,
                            duration: 8000,
                            action: newNotif.link_accion ? {
                                label: 'Ver Clientes',
                                onClick: () => window.location.href = newNotif.link_accion
                            } : undefined
                        })
                        
                        // 2. Notificación Nativa de Chrome
                        showBrowserNotification(newNotif.titulo, newNotif.mensaje)
                    }
                }
            )
            .subscribe((status) => {
                console.log('Estado suscripción realtime:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchUnread, supabase])

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
