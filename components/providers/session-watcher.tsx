'use client'

import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

interface SessionWatcherProps {
  userId: string
}

export function SessionWatcher({ userId }: SessionWatcherProps) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // 1. Fetch current user config to see if we should watch
    const initWatcher = async () => {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('sesion_unica_activa, sesion_id')
        .eq('id', userId)
        .single()

      if (!perfil || !perfil.sesion_unica_activa) {
        return // No need to watch if setting is disabled for this user
      }

      const localSessionId = localStorage.getItem('local_session_id')

      // Initial check (in case it was updated while loading)
      if (perfil.sesion_id && localSessionId && perfil.sesion_id !== localSessionId) {
        await forceLogout()
        return
      }

      // 2. Setup Realtime Subscription
      const channel = supabase
        .channel(`public:perfiles:id=eq.${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'perfiles', filter: `id=eq.${userId}` },
          async (payload) => {
            const newSesionId = payload.new.sesion_id
            const isActive = payload.new.sesion_unica_activa

            if (isActive && newSesionId && newSesionId !== localSessionId) {
              await forceLogout()
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    const forceLogout = async () => {
      await supabase.auth.signOut()
      localStorage.removeItem('local_session_id')
      router.push('/multisesion')
    }

    initWatcher()
  }, [userId, supabase, router])

  return null // This is a logic-only component
}
