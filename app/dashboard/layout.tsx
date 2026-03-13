import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/dashboard-nav'
import { SidebarProvider } from '@/components/providers/sidebar-provider'
import { DashboardMain } from '@/components/dashboard-main'

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

  return (
    <SidebarProvider>
      <div className="min-h-screen text-slate-200">
        <DashboardNav role={userRole} userName={userName} />
        <DashboardMain>
          {children}
        </DashboardMain>
      </div>
    </SidebarProvider>
  )
}
