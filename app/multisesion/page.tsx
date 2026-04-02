'use client'

import { Button } from '@/components/ui/button'
import { CardDescription, CardFooter, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Home, LogIn } from 'lucide-react'

export default function MultisesionPage() {
    const router = useRouter()

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black text-slate-200">
            {/* Animated Background Blobs */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-rose-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px]" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-orange-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />

            {/* Glassmorphic Card */}
            <div className="relative z-10 w-full max-w-[450px] p-4">
                <div className="backdrop-blur-xl bg-slate-900/60 border border-rose-500/20 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Header Gradient Line */}
                    <div className="h-2 w-full bg-gradient-to-r from-rose-600 via-red-500 to-orange-500" />
                    
                    <div className="p-8">
                        <div className="mb-6 text-center">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/30 mb-6 shadow-lg relative">
                                <AlertTriangle className="w-10 h-10 text-rose-500 absolute animate-pulse" />
                            </div>
                            <CardTitle className="text-3xl font-black text-white mb-3 tracking-tight">Sesión Terminada</CardTitle>
                            <CardDescription className="text-slate-400 text-base leading-relaxed">
                                Tu sesión ha sido cerrada automáticamente porque tu cuenta detectó actividad en otro dispositivo autorizado o el Administrador reseteó tus accesos.
                            </CardDescription>
                        </div>

                        <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800 mb-8">
                            <h4 className="text-sm font-bold text-rose-400 mb-2">Políticas de Seguridad Activadas:</h4>
                            <ul className="text-sm text-slate-400 space-y-2 list-disc pl-4 marker:text-rose-500">
                                <li><strong>Dispositivo Único:</strong> Solo puedes operar desde un equipo a la vez.</li>
                                <li>Si esto fue un error, por favor contacta a soporte técnico o a tu administrador.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <Button 
                                onClick={() => router.push('/login')}
                                className="w-full h-12 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-900/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2" 
                            >
                                <LogIn className="w-5 h-5" />
                                Volver a Iniciar Sesión
                            </Button>
                        </div>
                    </div>

                    <CardFooter className="bg-slate-950/30 p-4 border-t border-rose-500/10 flex justify-center">
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                            <ShieldIcon /> Seguridad del Sistema
                        </p>
                    </CardFooter>
                </div>
            </div>
        </div>
    )
}

function ShieldIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        </svg>
    )
}
