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
        // Cargar usuario inicial y persistir en Ref
        const initUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            userIdRef.current = user?.id || null
            console.log('NotificationProvider: Usuario cargado ->', userIdRef.current)
        }
        
        initUser()
        fetchUnread()
        
        // Registro proactivo de permisos (Solo si el navegador lo permite sin gesto de usuario)
        // En iOS Safari, esto puede fallar o no hacer nada si no es PWA.
        const checkNotificationInit = async () => {
            if (typeof window !== 'undefined' && "Notification" in window) {
                // Verificamos si es iOS Safari (donde Notification solo existe si es PWA)
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                const isStandalone = (window as any).navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
                
                if (isIOS && !isStandalone) {
                    console.info('Notificaciones nativas no disponibles en Safari móvil (requiere instalar en inicio)')
                    return
                }

                try {
                    if (Notification.permission === "default") {
                        // Intentamos pedir permiso, pero lo envolvemos en un try-catch
                        // porque algunos navegadores requieren gesto de usuario obligatorio
                        await Notification.requestPermission()
                    }
                } catch (err) {
                    console.warn('No se pudo solicitar permiso de notificación automáticamente:', err)
                }
            }
        }
        
        checkNotificationInit()

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
                        
                        // 3. Refrescar datos de la ruta actual (RSC) para sincronizar UI en tiempo real
                        router.refresh()
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
