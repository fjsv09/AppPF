import { createClient } from '@/utils/supabase/server'
import { LoginFormContent } from '@/components/login-form'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
    const supabase = await createClient()
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
