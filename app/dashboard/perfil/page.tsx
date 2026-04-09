import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/profile/profile-form'
import { BackButton } from '@/components/ui/back-button'
import { User, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mi Perfil | Sistema PF',
  description: 'Gestiona tu información personal y seguridad de acceso.'
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Usar Admin Client para obtener datos completos del perfil saltando RLS
  const adminClient = createAdminClient()
  const { data: perfil, error } = await adminClient
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !perfil) {
    console.error('Error loading profile:', error)
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-rose-500" />
            </div>
            <h1 className="text-xl font-bold text-white">Error al cargar el perfil</h1>
            <p className="text-slate-400">No se pudo recuperar tu información de usuario.</p>
        </div>
    )
  }

  const isAdmin = perfil.rol === 'admin'

  return (
    <div className="page-container">
      {/* Header Section */}
      <div className="page-header">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title flex items-center gap-2">
                <User className="w-6 h-6 text-blue-400" />
                Mi Perfil de Usuario
              </h1>
              <p className="page-subtitle">
                Actualiza tu información personal, foto y credenciales de acceso.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <ProfileForm perfil={perfil} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
