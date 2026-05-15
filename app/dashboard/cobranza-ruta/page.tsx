import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { CobranzaRutaClient } from '@/components/cobranza-ruta/cobranza-ruta-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cobranza en Ruta'
}

export default async function CobranzaRutaPage() {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const userRole = perfil?.rol

  if (userRole !== 'supervisor' && userRole !== 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Acceso Denegado</h1>
          <p className="text-slate-400">Solo supervisores pueden acceder a este panel.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="page-title">Cobranza en Ruta</h1>
            <p className="page-subtitle">Control operativo en tiempo real del avance de cobranza diaria</p>
          </div>
        </div>
      </div>
      <CobranzaRutaClient userRole={userRole as 'supervisor' | 'admin'} />
    </div>
  )
}
