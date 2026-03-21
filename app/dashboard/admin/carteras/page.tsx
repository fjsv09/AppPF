import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { CarteraManager } from '@/components/admin/cartera-manager'
import { CarteraHeader } from '@/components/admin/cartera-header'
import { BackButton } from '@/components/ui/back-button'
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
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">
                Gestión de Carteras
              </h1>
              <p className="page-subtitle max-w-sm">
                Administra los portafolios, asesores y supervisa cuentas.
              </p>
            </div>
          </div>
        </div>
        
        <CarteraHeader asesores={asesores || []} />
      </div>

      <CarteraManager asesores={asesores || []} initialCarteras={carteras || []} />
    </div>
  )
}
