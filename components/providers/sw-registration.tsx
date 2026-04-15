'use client'

import { useEffect } from 'react'

export function SWRegistration() {
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            const registerSW = async () => {
                try {
                    const registration = await navigator.serviceWorker.register('/sw.js', {
                        scope: '/',
                        updateViaCache: 'none'
                    })
                    
                    console.log('[SW] Registrado con éxito:', registration.scope)
                    
                    // Actualización proactiva si hay un nuevo SW
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('[SW] Nueva versión disponible. Recarga para actualizar.');
                                }
                            });
                        }
                    });
                } catch (error) {
                    console.error('[SW] Error de registro:', error)
                }
            }

            // Registrar cuando la página esté lista
            if (document.readyState === 'complete') {
                registerSW()
            } else {
                window.addEventListener('load', registerSW)
                return () => window.removeEventListener('load', registerSW)
            }
        }
    }, [])

    return null
}
