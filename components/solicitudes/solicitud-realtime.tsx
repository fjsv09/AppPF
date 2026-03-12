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

    // También hacer polling cada 10 segundos como fallback
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const { data } = await supabase
                    .from('solicitudes')
                    .select('estado_solicitud, updated_at')
                    .eq('id', solicitudId)
                    .single()

                if (data && data.estado_solicitud !== lastEstadoRef.current) {
                    console.log('Estado cambió de', lastEstadoRef.current, 'a', data.estado_solicitud)
                    lastEstadoRef.current = data.estado_solicitud
                    router.refresh()
                }
            } catch (e) {
                // Ignorar errores de polling
            }
        }, 10000) // Cada 10 segundos

        return () => clearInterval(interval)
    }, [solicitudId, supabase, router])

    // Este componente no renderiza nada visible
    return null
}
