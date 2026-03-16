import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { EmployeeManager } from '@/components/admin/employee-manager'
import { Users, ShieldAlert, Cake, CalendarDays } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format, isSameDay, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

export default async function AdminEmployeesPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await adminClient.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') redirect('/dashboard')

  // Fetch all employees - USING ADMIN CLIENT
  const { data: employees } = await adminClient
    .from('perfiles')
    .select('*, supervisor:supervisor_id(nombre_completo)')
    .order('nombre_completo')

  const supervisors = employees?.filter(e => e.rol === 'supervisor' || e.rol === 'admin') || []

  // Birthdays today/upcoming
  const today = new Date()
  const birthdaysToday = employees?.filter(e => {
    if (!e.fecha_nacimiento) return false
    const bday = new Date(e.fecha_nacimiento)
    return isSameDay(bday.getDate(), today.getDate()) && isSameMonth(bday.getMonth(), today.getMonth())
  })

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Directorio de Empleados
            </h1>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Administra el equipo, sus accesos y su información base.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-12 xl:col-span-8">
          <EmployeeManager employees={employees || []} supervisors={supervisors} />
        </div>

        <div className="lg:col-span-12 xl:col-span-4 space-y-6">
           {/* Birthdays Card */}
           <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-600/10 to-transparent border border-purple-500/20 shadow-xl overflow-hidden relative group">
              <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                 <Cake className="w-24 h-24 text-purple-400" />
              </div>
              <h4 className="text-purple-400 font-bold mb-4 flex items-center gap-2">
                 <CalendarDays className="w-5 h-5" />
                 Cumpleaños de hoy
              </h4>
              <div className="space-y-4 relative z-10">
                 {birthdaysToday?.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No hay cumpleaños registrados para hoy.</p>
                 ) : (
                    birthdaysToday?.map(e => (
                       <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 animate-bounce-slow">
                          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center font-bold text-purple-400">
                             {e.nombre_completo.charAt(0)}
                          </div>
                          <p className="text-sm font-bold text-white uppercase">{e.nombre_completo}</p>
                       </div>
                    ))
                 )}
              </div>
           </div>

           {/* Security Warning */}
           <div className="p-6 rounded-2xl bg-rose-600/5 border border-rose-500/20">
              <div className="flex items-center gap-3 mb-3">
                 <ShieldAlert className="w-5 h-5 text-rose-500" />
                 <h4 className="text-rose-400 font-bold text-sm">Control de Seguridad</h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                 Al <span className="text-rose-400 font-bold">suspender</span> a un colaborador, este perderá acceso inmediato a todas las funciones del sistema, incluyendo cobranzas y cierres de caja.
              </p>
           </div>
        </div>
      </div>
    </div>
  )
}
