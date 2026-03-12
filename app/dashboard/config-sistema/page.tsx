import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ConfiguracionForm } from '@/components/admin/configuracion-form'
import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
    const supabase = await createClient()
    
    console.log('[CONFIG PAGE] Starting...')
    
    // Verificar autenticación y rol
    const { data: { user } } = await supabase.auth.getUser()
    
    console.log('[CONFIG PAGE] User:', user?.id)
    
    if (!user) {
        console.log('[CONFIG PAGE] No user - redirecting to login')
        redirect('/login')
    }

    const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()
    
    console.log('[CONFIG PAGE] Perfil:', perfil, 'Error:', perfilError)

    if (perfil?.rol !== 'admin') {
        console.log('[CONFIG PAGE] Not admin - redirecting to dashboard')
        redirect('/dashboard')
    }
    
    console.log('[CONFIG PAGE] User is admin, fetching config...')

    // Obtener configuración actual
    const { data: config, error } = await supabase
        .from('configuracion_sistema')
        .select('*')
        .in('clave', [
            'renovacion_min_pagado', 
            'umbral_cpp_cuotas', 
            'umbral_moroso_cuotas', 
            'refinanciacion_min_mora',
            'horario_apertura',
            'horario_cierre',
            'desbloqueo_hasta'
        ])
        .order('clave')
    
    if (error) {
        console.error('Error loading config:', error)
        // No redirigir, mostrar el error en la UI
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-white/5">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">
                            Configuración del Sistema
                        </h1>
                    </div>
                    <p className="text-slate-400 mt-2 md:mt-1 md:pl-0">Administra los parámetros globales y operativos de la plataforma.</p>
                </div>
            </div>

            <ConfiguracionForm initialConfig={config || []} />
        </div>
    )
}
