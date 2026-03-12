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
        console.log('Intentando mostrar notificación de navegador:', titulo)
        if (!("Notification" in window)) {
            console.warn('Este navegador no soporta notificaciones de escritorio')
            return
        }

        if (Notification.permission === "granted") {
            try {
                const options: NotificationOptions = { 
                    body: mensaje, 
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: 'notif-' + Date.now()
                }

                // Intentar usar Service Worker si está listo (más confiable)
                if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
                    const registration = await navigator.serviceWorker.ready;
                    if (registration && 'showNotification' in registration) {
                        registration.showNotification(titulo, options);
                        return;
                    }
                }

                // Fallback a objeto Notification tradicional
                new Notification(titulo, options)
            } catch (err) {
                console.error('Error al crear objeto Notification:', err)
            }
        } else if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission()
            if (permission === "granted") {
                showBrowserNotification(titulo, mensaje)
            }
        } else {
            console.warn('Permiso de notificación denegado')
        }
    }

    useEffect(() => {
        // Cargar usuario inicial
        supabase.auth.getUser().then(({ data: { user } }) => {
            userIdRef.current = user?.id || null
            
            // Sync Push Subscription if enabled
            if (user && 'serviceWorker' in navigator && 'PushManager' in window) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.pushManager.getSubscription().then(sub => {
                        if (sub) {
                            // Enviar al servidor para asegurar que esté actualizada
                            fetch('/api/push/subscribe', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(sub)
                            }).catch(err => console.error('Error syncing push sub:', err))
                        }
                    })
                })
            }
        })

        fetchUnread()
        
        // Solicitar permiso de forma proactiva
        if (typeof window !== 'undefined' && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission()
            }
        }

        console.log('Iniciando suscripción Realtime para notificaciones...')
        
        // Suscripción Realtime a nuevas notificaciones
        const channel = supabase
            .channel('realtime_notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notificaciones'
                },
                (payload) => {
                    console.log('Evento Realtime recibido:', payload)
                    const newNotif = payload.new as any
                    
                    if (userIdRef.current && newNotif.usuario_destino_id === userIdRef.current) {
                        console.log('Notificación válida para el usuario actual!')
                        setUnreadCount(prev => prev + 1)
                        
                        // Sonner Toast
                        toast.info(newNotif.titulo, {
                            description: newNotif.mensaje,
                            action: newNotif.link_accion ? {
                                label: 'Ver',
                                onClick: () => window.location.href = newNotif.link_accion
                            } : undefined
                        })
                        
                        // Browser Notification
                        showBrowserNotification(newNotif.titulo, newNotif.mensaje)
                    }
                }
            )
            .subscribe()

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
