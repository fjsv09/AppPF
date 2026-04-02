'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Lock, Mail, ArrowRight } from 'lucide-react'

export function LoginFormContent({ 
    systemName = 'Sistema PF', 
    systemLogo 
}: { 
    systemName?: string; 
    systemLogo?: string 
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const errorParam = searchParams.get('error')
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    useEffect(() => {
        if (errorParam) {
            toast.error('Acceso denegado', { description: errorParam })
        }
    }, [errorParam])

    const getDeviceFingerprint = () => {
        let fp = localStorage.getItem('device_fingerprint')
        if (!fp) {
            fp = crypto.randomUUID()
            localStorage.setItem('device_fingerprint', fp)
        }
        return fp
    }

    const getLocalSessionId = () => {
        let sid = localStorage.getItem('local_session_id')
        if (!sid) {
            sid = crypto.randomUUID()
            localStorage.setItem('local_session_id', sid)
        }
        return sid
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: authData, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                toast.error('Error de autenticación', { description: error.message })
                setLoading(false)
                return
            }

            if (authData.user) {
                // Fetch profile to check session settings
                const { data: perfil } = await supabase
                    .from('perfiles')
                    .select('sesion_unica_activa, dispositivo_id')
                    .eq('id', authData.user.id)
                    .single()

                // Generate new session ID for this login instance
                const newSessionId = crypto.randomUUID()
                localStorage.setItem('local_session_id', newSessionId)

                if (perfil?.sesion_unica_activa) {
                    const currentDeviceIp = getDeviceFingerprint()
                    
                    if (perfil.dispositivo_id && perfil.dispositivo_id !== currentDeviceIp) {
                        // Deny access
                        await supabase.auth.signOut()
                        toast.error('Acceso Restringido', { 
                            description: 'Tu cuenta está vinculada a otro dispositivo. Contacta al soporte.',
                            duration: 5000
                        })
                        setLoading(false)
                        return
                    }

                    // Update device_id and sesion_id
                    await supabase.from('perfiles').update({
                        dispositivo_id: perfil.dispositivo_id ? perfil.dispositivo_id : currentDeviceIp,
                        sesion_id: newSessionId
                    }).eq('id', authData.user.id)
                } else {
                    // Just update session id
                    await supabase.from('perfiles').update({
                        sesion_id: newSessionId
                    }).eq('id', authData.user.id)
                }
            }

            toast.success('Bienvenido', { description: 'Iniciando sesión...' })
            router.refresh()
            router.push('/dashboard')
        } catch (err) {
            toast.error('Error inesperado')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black text-slate-200">
            {/* Animated Background Blobs */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/30 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '6s' }} />

            {/* Glassmorphic Card */}
            <div className="relative z-10 w-full max-w-[400px] p-4">
                <div className="backdrop-blur-xl bg-slate-900/60 border border-white/10 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Header Gradient Line */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />
                    
                    <div className="p-8">
                        <div className="mb-8 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 mb-6 shadow-lg overflow-hidden">
                                {systemLogo ? (
                                    <img src={systemLogo} alt="Logo" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-3xl">🛡️</span>
                                )}
                            </div>
                            <CardTitle className="text-3xl font-bold text-white mb-2 tracking-tight">{systemName}</CardTitle>
                            <CardDescription className="text-slate-400 text-base">
                                Acceso Seguro Corporativo
                            </CardDescription>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 ml-1">Correo Electrónico</label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                    <Input
                                        type="email"
                                        placeholder="admin@empresa.com"
                                        required
                                        className="pl-12 h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 placeholder:text-slate-600 rounded-xl transition-all font-medium"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 ml-1">Contraseña</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-3.5 h-5 w-5 text-slate-500 group-focus-within:text-purple-400 transition-colors" />
                                    <Input
                                        type="password"
                                        placeholder="••••••••••••"
                                        required
                                        className="pl-12 h-12 bg-slate-950/50 border-slate-700 focus:border-purple-500/50 text-slate-200 placeholder:text-slate-600 rounded-xl transition-all font-medium"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>

                            <Button 
                                className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-all hover:scale-[1.02] mt-2 group" 
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    <span className="flex items-center gap-2">
                                        Ingresar al Sistema
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                )}
                            </Button>
                        </form>
                    </div>

                    <CardFooter className="bg-slate-950/30 p-4 border-t border-white/5 flex justify-center">
                        <p className="text-xs text-slate-600 font-medium">
                            Sistema Privado • v2.0 Professional
                        </p>
                    </CardFooter>
                </div>
            </div>
        </div>
    )
}
