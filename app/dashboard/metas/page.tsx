import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { MetasProgress } from '@/components/metas/metas-progress'
import { Award, Target, Briefcase } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { redirect } from 'next/navigation'
import { MetasPageClient } from '@/components/metas/metas-page-client'

export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener rol del usuario
  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const userRole = perfil?.rol || 'asesor'

  // Si es admin, obtener lista de todo el personal
  let asesores: { id: string; nombre_completo: string; rol?: string }[] = []
  if (userRole === 'admin') {
    const { data } = await supabaseAdmin
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .order('nombre_completo')
    asesores = data || []
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              {userRole === 'admin' ? 'Metas y Bonos del Personal' : 'Mis Metas y Bonos'}
            </h1>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            {userRole === 'admin' 
              ? 'Supervisa el rendimiento de cada miembro del equipo en tiempo real.'
              : userRole === 'supervisor'
              ? 'Tu rendimiento se calcula en base al desempeño de tus asesores.'
              : 'Visualiza tu rendimiento actual y proyecta tus ganancias extras.'}
          </p>
        </div>
      </div>

      {/* Si es admin: selector + progreso. Si es supervisor/asesor: directo con su rol */}
      {userRole === 'admin' ? (
        <MetasPageClient asesores={asesores} defaultUserId={user.id} userRole={userRole} />
      ) : (
        <MetasProgress userId={user.id} userRole={userRole} />
      )}

    </div>
  )
}
