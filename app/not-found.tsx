import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SearchIcon, HomeIcon, ArrowRight } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg">
        {/* Animated Background Blobs */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-[80px]" />

        {/* Content Card */}
        <div className="relative z-10 backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-3xl p-10 shadow-2xl overflow-hidden shadow-black/70">
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 absolute top-0 left-0" />
          
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-8">
              <span className="text-[120px] font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-white to-white/10 select-none">404</span>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center shadow-lg rotate-12">
                <SearchIcon className="w-8 h-8 text-blue-400" />
              </div>
            </div>

            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Página no encontrada</h1>
            <p className="text-slate-400 mb-10 max-w-sm text-lg leading-relaxed">
              Lo sentimos, la página que buscas no existe o ha sido movida a otra ubicación.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 w-full">
              <Button
                asChild
                className="flex-1 h-14 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-2xl shadow-xl shadow-blue-900/30 transition-all hover:scale-[1.03] active:scale-95 group"
              >
                <Link href="/" className="flex items-center justify-center gap-2">
                  <HomeIcon className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                  Ir al Inicio
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
            
            <div className="mt-12 pt-8 border-t border-white/5 w-full flex justify-between items-center px-4">
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">
                Sistema PF • v2.0
              </p>
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-pink-500/50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
