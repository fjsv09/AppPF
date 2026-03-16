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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
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

      {/* Team Info / Tips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="p-6 rounded-2xl bg-blue-600/10 border border-blue-500/20">
            <div className="flex items-center gap-3 mb-4">
               <Target className="w-6 h-6 text-blue-400" />
               <h3 className="font-bold text-white">Consejo del Mes</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
               Mantén tu cartera por debajo del <span className="text-blue-200">7% de morosidad</span> para asegurar el bono de tramo bueno. Recuerda que la puntualidad en el cuadre también suma puntos para el bono de equipo.
            </p>
         </div>

         <div className="p-6 rounded-2xl bg-purple-600/10 border border-purple-500/20">
            <div className="flex items-center gap-3 mb-4">
               <Briefcase className="w-6 h-6 text-purple-400" />
               <h3 className="font-bold text-white">Bono de Equipo</h3>
            </div>
            <div className="space-y-2">
               <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Progreso del Equipo</span>
                  <span className="text-purple-400 font-bold">82%</span>
               </div>
               <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 w-[82%]" />
               </div>
               <p className="text-[10px] text-slate-500 mt-2">
                  Si todos cumplen sus metas individuales, se activa el bono colectivo de S/ 200 adicional.
               </p>
            </div>
         </div>
      </div>
    </div>
  )
}
