import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getSystemConfig } from '@/lib/config-cache'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/dashboard-nav'
import { SidebarProvider } from '@/components/providers/sidebar-provider'
import { DashboardMain } from '@/components/dashboard-main'
import { AdminTaskSync } from '@/components/dashboard/admin-task-sync'
import { DashboardProtection } from '@/components/providers/dashboard-protection'
import { SessionWatcher } from '@/components/providers/session-watcher'
import { StayVerification } from '@/components/asistencia/stay-verification'

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

  // Fecha en Lima (calculada en cliente, no requiere BD)
  const now = new Date()
  const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`
  const isSunday = limaDate.getDay() === 0

  // Paralelizar las 4 lecturas: perfil, feriado, asistencia del día, config (cacheada)
  const [perfilRes, holidayRes, todayAttendanceRes, configMap] = await Promise.all([
    supabaseAdmin
      .from('perfiles')
      .select('rol, activo, nombre_completo, avatar_url')
      .eq('id', user.id)
      .single(),
    supabaseAdmin
      .from('feriados')
      .select('id')
      .eq('fecha', todayStr)
      .maybeSingle(),
    supabaseAdmin
      .from('asistencia_personal')
      .select('hora_entrada, hora_turno_tarde, hora_cierre')
      .eq('usuario_id', user.id)
      .eq('fecha', todayStr)
      .maybeSingle(),
    getSystemConfig(),
  ])

  const perfil = perfilRes.data
  const holiday = holidayRes.data
  const todayAttendance = todayAttendanceRes.data

  // Business Rule: If user is suspended, block access
  if (perfil && perfil.activo === false) {
    // We sign out the user and redirect to login
    await supabase.auth.signOut()
    redirect('/login?error=Cuenta suspendida. Contacte al administrador.')
  }

  const userRole = perfil?.rol || 'asesor'
  const userName = perfil?.nombre_completo || 'Usuario'

  // Business Logic: Determine if attendance is MANDATORY right NOW
  const timeToMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }

  const tNow = limaDate.getHours() * 60 + limaDate.getMinutes()
  const tApertura = timeToMin(configMap?.horario_apertura || '08:00')
  const tFin1 = timeToMin(configMap?.horario_fin_turno_1 || '13:30')
  const tCierre = timeToMin(configMap?.horario_cierre || '19:00')

  let attendanceRequired = true
  let currentEvent = 'entrada'
  let isMarked = false

  // Rules for Skip
  if (isSunday || holiday) {
    attendanceRequired = false
  } else if (tNow < tApertura) {
    // Too early, no gate yet
    attendanceRequired = false
  } else {
    // Check specific windows
    if (!todayAttendance?.hora_entrada) {
        currentEvent = 'entrada'
        isMarked = false
    } else if (tNow >= tCierre && !todayAttendance?.hora_cierre) {
        currentEvent = 'cierre'
        isMarked = false
    } else if (tNow >= tFin1 && !todayAttendance?.hora_turno_tarde) {
        currentEvent = 'fin_turno_1'
        isMarked = false
    } else {
        // Everything marked or between windows
        attendanceRequired = false
        isMarked = true
    }
  }

  const attendanceInitialData = {
    required: attendanceRequired,
    marked: isMarked,
    event: currentEvent,
    config: {
        radio_metros: parseFloat(configMap?.asistencia_radio_metros || '150'),
        descuento_por_minuto: parseFloat(configMap?.asistencia_descuento_por_minuto || '0.15'),
        hora_limite: configMap?.horario_apertura || '08:00',
        hora_fin_1: configMap?.horario_fin_turno_1 || '13:30',
        hora_cierre: configMap?.horario_cierre || '19:00',
        tolerancia: parseInt(configMap?.asistencia_tolerancia_minutos || '15'),
        oficina_lat: parseFloat(configMap?.oficina_lat || '0'),
        oficina_lon: parseFloat(configMap?.oficina_lon || '0'),
        minutos_permanencia: parseInt(configMap?.asistencia_minutos_permanencia || '15'),
    }
  }

  return (
    <SidebarProvider>
      <SessionWatcher userId={user.id} />
      <DashboardProtection 
        userRole={userRole} 
        userName={userName} 
        attendanceInitialData={attendanceInitialData}
      >
        <div className="min-h-screen text-slate-200">
          <DashboardNav 
            role={userRole} 
            userName={userName} 
            userAvatar={perfil?.avatar_url}
            systemName={configMap?.nombre_sistema || 'Sistema PF'} 
            systemLogo={configMap?.logo_sistema_url}
          />
          <DashboardMain>
            {userRole === 'admin' && <AdminTaskSync />}
            {children}
          </DashboardMain>
          <StayVerification />
        </div>
      </DashboardProtection>
    </SidebarProvider>
  )
}
