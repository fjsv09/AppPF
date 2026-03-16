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

  // Fetch asesores (only 'asesor' role can be responsible for a portfolio)
  const { data: asesores } = await adminClient
    .from('perfiles')
    .select('id, nombre_completo')
    .eq('rol', 'asesor')
    .eq('activo', true)

  // Fetch current carteras
  const { data: carteras } = await supabase
    .from('carteras')
    .select(`
      *,
      perfiles (nombre_completo)
    `)
    .order('nombre')

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Gestión de Carteras
            </h1>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Administra los portafolios de inversión y las cuentas de cada asesor.
          </p>
        </div>
      </div>

      <CarteraManager asesores={asesores || []} initialCarteras={carteras || []} />
    </div>
  )
}
