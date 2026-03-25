import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { CuadreApproval } from '@/components/admin/cuadre-approval'
import { CuadreHistoryTable } from '@/components/admin/cuadre-history-table'
import { Clock, History, ShieldCheck, Landmark, ListChecks } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { redirect } from 'next/navigation'
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CuadreTabs } from "@/components/admin/cuadre-tabs"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gestión de Cuadres'
}

export default async function AdminCuadresPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check role
  const { data: perfil } = await adminClient
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const isAdmin = perfil?.rol === 'admin'
  
  if (!isAdmin) {
    redirect('/dashboard')
  }

  // Fetch Pending Cuadres (Only needed if admin or if supervisors can see them)
  const { data: pendingCuadres } = await adminClient
    .from('cuadres_diarios')
    .select(`
      *,
      perfiles!cuadres_diarios_asesor_id_fkey (nombre_completo)
    `)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })

  // Fetch History (Both roles can see history)
  const { data: history } = await adminClient
    .from('cuadres_diarios')
    .select(`
      *,
      perfiles!cuadres_diarios_asesor_id_fkey (nombre_completo)
    `)
    .neq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch Global Accounts (Caja and Digital) to move funds to
  // We only show accounts belonging to the Global Cartera (id: 0s)
  const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'
  const { data: accounts } = await supabase
    .from('cuentas_financieras')
    .select('*')
    .eq('cartera_id', GLOBAL_CARTERA_ID)
    .in('tipo', ['caja', 'digital'])

  const pendingCount = pendingCuadres?.length || 0

  return (
    <div className="page-container">
      {/* Header Section */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">Gestión de Cuadres</h1>
              <p className="page-subtitle">
                Administra las solicitudes de cierre y consulta el historial histórico.
              </p>
            </div>
          </div>
        </div>
      </div>

      <CuadreTabs defaultTab="pendientes" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 p-1 mb-6">
          <TabsTrigger 
            value="pendientes" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-400 gap-2 px-6"
          >
            <Clock className="w-4 h-4" />
            Pendientes
            {pendingCount > 0 && (
              <span className="ml-1 bg-white text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="historial" 
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 gap-2 px-6"
          >
            <ListChecks className="w-4 h-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-4 outline-none">
          <CuadreApproval 
            pendingCuadres={pendingCuadres || []} 
            adminId={user.id} 
            globalAccounts={accounts || []} 
          />
        </TabsContent>

        <TabsContent value="historial" className="space-y-4 outline-none">
          <CuadreHistoryTable history={history || []} />
        </TabsContent>
      </CuadreTabs>
    </div>
  )
}
