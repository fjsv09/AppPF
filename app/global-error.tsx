'use client'

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-white mb-2">Error Crítico del Sistema</h1>
            <p className="text-slate-400 mb-8 leading-relaxed">
              Lo sentimos, ha ocurrido un error inesperado al cargar la aplicación. 
              El equipo técnico ha sido notificado automáticamente.
            </p>

            <button
              onClick={() => reset()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
            >
              Reintentar Cargar
            </button>
            
            <div className="mt-8 pt-6 border-t border-white/5">
              <button 
                onClick={() => window.location.href = '/'}
                className="text-xs font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest"
              >
                Volver al Inicio
              </button>
            </div>
            
            {error.digest && (
              <p className="mt-4 text-[10px] font-mono text-slate-700">
                ID Error: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
