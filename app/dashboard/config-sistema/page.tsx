import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ConfiguracionForm } from '@/components/admin/configuracion-form'
import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Configuración Sistema'
}

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
            'horario_fin_turno_1',
            'desbloqueo_hasta',
            'nombre_sistema',
            'logo_sistema_url',
            'visita_tiempo_minimo'
        ])
        .order('clave')
    
    if (error) {
        console.error('Error loading config:', error)
        // No redirigir, mostrar el error en la UI
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                     <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                             <h1 className="page-title">Configuración del Sistema</h1>
                             <p className="page-subtitle">Administra los parámetros globales y operativos de la plataforma.</p>
                        </div>
                     </div>
                </div>
            </div>

            <ConfiguracionForm initialConfig={config || []} />
        </div>
    )
}
