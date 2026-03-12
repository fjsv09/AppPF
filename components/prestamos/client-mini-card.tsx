'use client'

import { useRouter } from 'next/navigation'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientMiniCardProps {
    clienteId: string
    nombres: string
    fotoPerfil?: string | null
    className?: string
}

export function ClientMiniCard({ clienteId, nombres, fotoPerfil, className }: ClientMiniCardProps) {
    const router = useRouter()

    return (
        <div 
            onClick={() => router.push(`/dashboard/clientes/${clienteId}`)}
            className={cn(
                "flex items-center gap-3 bg-white/5 h-10 md:h-11 px-3 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer group w-fit min-w-[140px]",
                className
            )}
        >
            <div className="h-7 w-7 md:h-8 md:w-8 shrink-0 rounded-full bg-slate-800 flex items-center justify-center shadow-lg border border-white/10 group-hover:scale-105 transition-transform overflow-hidden relative">
                {fotoPerfil ? (
                    <div 
                        onClick={(e) => e.stopPropagation()} 
                        className="w-full h-full relative z-10 overflow-hidden rounded-full"
                    >
                        <ImageLightbox
                            src={fotoPerfil}
                            alt={nombres}
                            className="w-full h-full"
                            thumbnail={
                                <img
                                    src={fotoPerfil}
                                    alt={nombres}
                                    className="w-full h-full object-cover"
                                />
                            }
                        />
                    </div>
                ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                    </div>
                )}
            </div>

            <div className="flex flex-col justify-center min-w-0">
                <span className="text-[8px] md:text-[9px] text-blue-200/50 font-black uppercase tracking-[0.15em] leading-none mb-0.5">Cliente</span>
                <span className="font-bold text-xs md:text-sm text-white/90 leading-tight truncate group-hover:text-blue-300 transition-colors">
                    {nombres}
                </span>
            </div>
        </div>
    )
}
