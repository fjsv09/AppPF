import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { CuadreApproval } from '@/components/admin/cuadre-approval'
import { Clock, History, ShieldCheck } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminCuadresPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if admin
  const { data: perfil } = await adminClient
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch Pending Cuadres with advisor profile
  const { data: pendingCuadres } = await adminClient
    .from('cuadres_diarios')
    .select(`
      *,
      perfiles!cuadres_diarios_asesor_id_fkey (nombre_completo)
    `)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })

  // Fetch Global Accounts (Caja and Digital) to move funds to
  // We only show accounts belonging to the Global Cartera (id: 0s)
  const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'
  const { data: accounts } = await supabase
    .from('cuentas_financieras')
    .select('*')
    .eq('cartera_id', GLOBAL_CARTERA_ID)
    .in('tipo', ['caja', 'digital'])

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BackButton />
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-emerald-500" />
              Aprobación de Cuadres
            </h1>
          </div>
          <p className="text-slate-400 text-lg ml-11">
            Valida y autoriza los cierres diarios de tus asesores.
          </p>
        </div>
      </div>

      <CuadreApproval 
        pendingCuadres={pendingCuadres || []} 
        adminId={user.id} 
        globalAccounts={accounts || []} 
      />
    </div>
  )
}
