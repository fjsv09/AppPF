'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

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

export function PushSubscriptionManager() {
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [subscription, setSubscription] = useState<PushSubscription | null>(null)
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
    const [loading, setLoading] = useState(true)

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
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Service Worker registration failed:', err)
                    setLoading(false)
                })
        } else {
            setLoading(false)
        }
    }, [])

    const subscribe = async () => {
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
                toast.success('Notificaciones web activadas correctamente')
            } else {
                const errData = await res.json()
                toast.error(`Error de servidor: ${errData.error || 'Desconocido'}`)
            }
        } catch (err) {
            console.error('Push subscription failed:', err)
            toast.error('Error al suscribir notificaciones. Verifica los permisos del navegador.')
        }
    }

    const unsubscribe = async () => {
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

    if (loading) return (
        <Button variant="ghost" size="sm" disabled className="w-9 h-9 p-0 opacity-50">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        </Button>
    )

    if (!registration) return null

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={isSubscribed ? unsubscribe : subscribe}
            className={`w-10 h-10 p-0 rounded-full transition-all border ${
                isSubscribed 
                    ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/50 hover:bg-emerald-900/30" 
                    : "bg-slate-900/50 text-slate-500 border-slate-800 hover:text-white hover:bg-slate-800"
            }`}
            title={isSubscribed ? "Notificaciones Activadas" : "Activar Notificaciones"}
        >
            {isSubscribed ? (
                <Bell className="w-5 h-5" />
            ) : (
                <BellOff className="w-5 h-5" />
            )}
        </Button>
    )
}
