import { createAdminClient } from '@/utils/supabase/admin'
import { LoginFormContent } from '@/components/login-form'
import { Metadata } from 'next'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
    const supabase = createAdminClient()
    const { data: config } = await supabase
        .from('configuracion_sistema')
        .select('clave, valor')
        .eq('clave', 'nombre_sistema')
        .single()
    return {
        title: `Acceso: ${config?.valor || 'Login'}`
    }
}

export default async function LoginPage() {
    const supabase = createAdminClient()
    const { data: config } = await supabase
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['nombre_sistema', 'logo_sistema_url'])

    const configMap = config?.reduce((acc: any, item) => {
        acc[item.clave] = item.valor
        return acc
    }, {})

    return (
        <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Cargando...</div>}>
            <LoginFormContent 
                systemName={configMap?.nombre_sistema} 
                systemLogo={configMap?.logo_sistema_url} 
            />
        </Suspense>
    )
}
