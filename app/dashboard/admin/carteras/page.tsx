import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { CarteraManager } from '@/components/admin/cartera-manager'
import { Briefcase } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminCarterasPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if admin
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch asesores (any role can be responsible for a portfolio: admin, supervisor, asesor)
  const { data: asesores } = await adminClient
    .from('perfiles')
    .select('id, nombre_completo, rol')
    .eq('activo', true)
    .order('nombre_completo')

  // Fetch current carteras with related counts
  const { data: carteras } = await supabase
    .from('carteras')
    .select(`
      *,
      perfiles (nombre_completo),
      cuentas_financieras (count)
    `)
    .order('nombre')

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/5 pb-3">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
                  Gestión de Carteras
                </h1>
                <div className="hidden md:block px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[8px] text-blue-400 font-bold uppercase tracking-widest">
                  Admin Panel
                </div>
              </div>
              <p className="text-slate-500 text-xs mt-0.5 max-w-sm">
                Administra los portafolios, asesores y supervisa cuentas.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
          <span>{carteras?.length || 0} carteras activas en el sistema</span>
        </div>
      </div>

      <CarteraManager asesores={asesores || []} initialCarteras={carteras || []} />
    </div>
  )
}
