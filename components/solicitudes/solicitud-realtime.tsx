'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

interface SolicitudRealtimeProps {
    solicitudId: string
    currentEstado: string
}

export function SolicitudRealtime({ solicitudId, currentEstado }: SolicitudRealtimeProps) {
    const router = useRouter()
    const supabase = createClient()
    const lastEstadoRef = useRef(currentEstado)

    useEffect(() => {
        // Actualizar la referencia cuando cambie el estado desde el servidor
        lastEstadoRef.current = currentEstado
    }, [currentEstado])

    useEffect(() => {
        // Suscribirse a cambios en tiempo real
        const channel = supabase
            .channel(`solicitud-${solicitudId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'solicitudes',
                    filter: `id=eq.${solicitudId}`
                },
                (payload) => {
                    console.log('Solicitud actualizada:', payload)
                    // Refrescar la página cuando hay cambios
                    router.refresh()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [solicitudId, supabase, router])

    // Este componente no renderiza nada visible
    return null
}
