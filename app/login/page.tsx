import { getSystemConfig } from '@/lib/config-cache'
import { LoginFormContent } from '@/components/login-form'
import { Metadata } from 'next'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
    const configMap = await getSystemConfig()
    return {
        title: `Acceso: ${configMap?.nombre_sistema || 'Login'}`
    }
}

export default async function LoginPage() {
    const configMap = await getSystemConfig()

    return (
        <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Cargando...</div>}>
            <LoginFormContent 
                systemName={configMap?.nombre_sistema} 
                systemLogo={configMap?.logo_sistema_url} 
            />
        </Suspense>
    )
}
