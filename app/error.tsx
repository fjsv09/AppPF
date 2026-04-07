'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service like Sentry
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {/* Decorative Background Elements */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-red-600/10 rounded-full blur-[80px]" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-orange-600/10 rounded-full blur-[80px]" />

        {/* Content Card */}
        <div className="relative z-10 backdrop-blur-xl bg-slate-900/60 border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden shadow-black/50">
          <div className="h-1 w-full bg-gradient-to-r from-red-500 to-orange-500 absolute top-0 left-0" />
          
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-red-950/50 border border-red-500/30 flex items-center justify-center mb-6 shadow-inner">
              <AlertCircle className="w-10 h-10 text-red-500 animate-pulse" />
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Algo salió mal</h1>
            <p className="text-slate-400 mb-8 max-w-xs">
              Ha ocurrido un error inesperado. Hemos notificado al equipo técnico.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              <Button
                onClick={() => reset()}
                className="h-12 bg-white text-black hover:bg-slate-200 font-bold rounded-xl transition-all active:scale-95 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reintentar
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 border-slate-700 bg-transparent text-white hover:bg-white/5 font-bold rounded-xl transition-all active:scale-95"
              >
                <Link href="/" className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  Ir al Inicio
                </Link>
              </Button>
            </div>
            
            <div className="mt-8 pt-6 border-t border-white/5 w-full">
              <p className="text-xs text-slate-600 font-mono">
                Error ID: {error.digest || 'system_fault_001'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
