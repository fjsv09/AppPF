'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * VisibilityRefresh - Componente global que detecta cuando la PWA/pestaña
 * vuelve al foreground y refresca los datos automáticamente.
 * 
 * Problema que resuelve:
 * En iOS Safari PWA, cuando el usuario minimiza la app o cambia de app,
 * el navegador "congela" la pestaña. Al volver, los datos quedan obsoletos
 * y el usuario tiene que recargar manualmente.
 * 
 * Solución:
 * - Escucha `visibilitychange` (la app vuelve al foreground)
 * - Escucha `focus` (la ventana recupera el foco)  
 * - Escucha `pageshow` con persisted (iOS back-forward cache / BFCache)
 * - Llama a `router.refresh()` para re-ejecutar Server Components
 * - Aplica un debounce para evitar múltiples refreshes simultáneos
 * - Solo refresca si pasaron al menos 30 segundos desde la última vez
 */
export function VisibilityRefresh() {
  const router = useRouter()
  const lastRefreshRef = useRef<number>(Date.now())
  const isRefreshingRef = useRef(false)

  // Tiempo mínimo entre refreshes (30 segundos)
  // Evita que un rápido switch entre apps cause múltiples refreshes
  const MIN_REFRESH_INTERVAL_MS = 30_000

  const doRefresh = useCallback(() => {
    const now = Date.now()
    const elapsed = now - lastRefreshRef.current

    // No refrescar si:
    // 1. Ya estamos refrescando
    // 2. No ha pasado suficiente tiempo desde el último refresh
    if (isRefreshingRef.current || elapsed < MIN_REFRESH_INTERVAL_MS) {
      return
    }

    isRefreshingRef.current = true
    lastRefreshRef.current = now

    console.log('[VisibilityRefresh] App regresó al foreground, refrescando datos...')

    try {
      // router.refresh() re-ejecuta TODOS los Server Components
      // sin perder el state de los Client Components
      router.refresh()
    } catch (e) {
      console.error('[VisibilityRefresh] Error al refrescar:', e)
    } finally {
      // Dar tiempo a que el refresh termine antes de permitir otro
      setTimeout(() => {
        isRefreshingRef.current = false
      }, 2000)
    }
  }, [router])

  useEffect(() => {
    // 1. visibilitychange: Se dispara cuando la pestaña/PWA cambia de visible a oculta y viceversa
    // Este es el evento MÁS confiable en iOS PWA
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        doRefresh()
      }
    }

    // 2. focus: Se dispara cuando la ventana recupera el foco
    // Útil en desktop y algunos escenarios de Android
    const handleFocus = () => {
      doRefresh()
    }

    // 3. pageshow: Se dispara cuando la página se muestra desde el BFCache
    // iOS Safari usa BFCache agresivamente en PWA mode
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // La página viene del BFCache, necesita refresh obligatorio
        console.log('[VisibilityRefresh] Página restaurada desde BFCache')
        lastRefreshRef.current = 0 // Forzar refresh ignorando el intervalo
        doRefresh()
      }
    }

    // 4. online: Cuando el dispositivo recupera conexión
    // Útil cuando el usuario estaba offline y vuelve
    const handleOnline = () => {
      console.log('[VisibilityRefresh] Conexión recuperada, refrescando...')
      lastRefreshRef.current = 0 // Forzar refresh
      doRefresh()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('online', handleOnline)
    }
  }, [doRefresh])

  return null // Componente invisible, solo lógica
}
