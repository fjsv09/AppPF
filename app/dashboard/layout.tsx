import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/dashboard-nav'
import { SidebarProvider } from '@/components/providers/sidebar-provider'
import { DashboardMain } from '@/components/dashboard-main'
import { AdminTaskSync } from '@/components/dashboard/admin-task-sync'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Use Admin Client to bypass RLS and guarantee we get the user data
  const supabaseAdmin = createAdminClient()
  
  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('rol, activo, nombre_completo')
    .eq('id', user.id)
    .single()

  // Business Rule: If user is suspended, block access
  if (perfil && perfil.activo === false) {
    // We sign out the user and redirect to login
    await supabase.auth.signOut()
    redirect('/login?error=Cuenta suspendida. Contacte al administrador.')
  }

  const userRole = perfil?.rol || 'asesor'
  const userName = perfil?.nombre_completo || 'Usuario'

  // Fetch System Config
  const { data: systemConfig } = await supabaseAdmin
    .from('configuracion_sistema')
    .select('clave, valor')
    .in('clave', ['nombre_sistema', 'logo_sistema_url'])

  const configMap = systemConfig?.reduce((acc: any, item) => {
    acc[item.clave] = item.valor
    return acc
  }, {})

  return (
    <SidebarProvider>
      <div className="min-h-screen text-slate-200">
        <DashboardNav 
          role={userRole} 
          userName={userName} 
          systemName={configMap?.nombre_sistema || 'Sistema PF'} 
          systemLogo={configMap?.logo_sistema_url}
        />
        <DashboardMain>
          {userRole === 'admin' && <AdminTaskSync />}
          {children}
        </DashboardMain>
      </div>
    </SidebarProvider>
  )
}
