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
        console.log('Estado Permiso:', Notification.permission)

        if (!("Notification" in window)) {
            console.error('Navegador no soporta notificaciones')
            return
        }

        // Si el permiso es 'default', lo pedimos de nuevo (puede fallar si no es por click, pero intentamos)
        if (Notification.permission === "default") {
            const permission = await Notification.requestPermission()
            if (permission !== "granted") return
        }

        if (Notification.permission === "granted") {
            try {
                const options: NotificationOptions = { 
                    body: mensaje, 
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: 'notif-' + Date.now(),
                    requireInteraction: true, // Para que no se cierre sola en Chrome
                    silent: false
                }

                // Usar Service Worker si está registrado y listo
                if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                    const registration = await navigator.serviceWorker.ready;
                    if (registration && 'showNotification' in registration) {
                        await registration.showNotification(titulo, options);
                        console.log('Enviada vía SW');
                        return;
                    }
                }

                // Fallback tradicional
                new Notification(titulo, options)
                console.log('Enviada vía Objeto Notification');
            } catch (err) {
                console.error('Error disparando notificación:', err)
            }
        } else {
            console.warn('Permisos de notificación denegados o no habilitados')
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
