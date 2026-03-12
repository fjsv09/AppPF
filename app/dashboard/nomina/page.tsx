import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wallet, History, Calculator, BadgePercent, AlertCircle, TrendingUp } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { NominaPageClient } from '@/components/nomina/nomina-page-client'

export const dynamic = 'force-dynamic'

export default async function NominaPage() {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener rol del usuario
  const { data: perfilUser } = await supabaseAdmin
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const userRole = perfilUser?.rol || 'asesor'

  // Si es admin, obtener lista de todos los trabajadores
  let trabajadores: { id: string; nombre_completo: string; rol: string }[] = []
  if (userRole === 'admin') {
    const { data } = await supabaseAdmin
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .order('nombre_completo')
    trabajadores = data || []
  }

  // Para roles no-admin, mostrar su propia nómina directamente
  if (userRole !== 'admin') {
    return <NominaDirecta userId={user.id} />
  }

  // Para admin, mostrar con selector
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BackButton />
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Wallet className="w-8 h-8 text-blue-500" />
              Nómina y Sueldos
            </h1>
          </div>
          <p className="text-slate-400 text-lg ml-11 uppercase font-bold tracking-widest text-[10px]">
             {format(new Date(), 'MMMM yyyy', { locale: es })}
          </p>
        </div>
      </div>

      <NominaPageClient trabajadores={trabajadores} defaultUserId={user.id} />
    </div>
  )
}

async function NominaDirecta({ userId }: { userId: string }) {
  const supabase = await createClient()
  
  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()

  const { data: currentPayroll } = await supabase
    .from('nomina_personal')
    .select('*')
    .eq('trabajador_id', userId)
    .eq('mes', currentMonth)
    .eq('anio', currentYear)
    .single()

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('sueldo_base, nombre_completo')
    .eq('id', userId)
    .single()

  const { data: payrollHistory } = await supabase
    .from('nomina_personal')
    .select('*')
    .eq('trabajador_id', userId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })
    .limit(6)

  const totalCalculated = (currentPayroll?.sueldo_base || perfil?.sueldo_base || 0) + 
                          (currentPayroll?.bonos || 0) - 
                          (currentPayroll?.descuentos || 0) - 
                          (currentPayroll?.adelantos || 0)

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BackButton />
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Wallet className="w-8 h-8 text-blue-500" />
              Mi Nómina y Sueldo
            </h1>
          </div>
          <p className="text-slate-400 text-lg ml-11 uppercase font-bold tracking-widest text-[10px]">
             {format(today, 'MMMM yyyy', { locale: es })}
          </p>
        </div>
      </div>

      <NominaContent 
        currentPayroll={currentPayroll} 
        perfil={perfil} 
        payrollHistory={payrollHistory} 
        totalCalculated={totalCalculated} 
        today={today} 
      />
    </div>
  )
}

function NominaContent({ currentPayroll, perfil, payrollHistory, totalCalculated, today, nombreTrabajador }: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-12 xl:col-span-8 space-y-6">
         <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden border-t-4 border-t-blue-500">
            <CardHeader className="bg-slate-800/20 border-b border-slate-800">
               <div className="flex justify-between items-center">
                  <div>
                     <CardTitle className="text-xl font-bold text-white">
                       Resumen de Pago {nombreTrabajador && <span className="text-blue-400">— {nombreTrabajador}</span>}
                     </CardTitle>
                     <CardDescription>Corte al {format(today, 'dd/MM/yyyy')}</CardDescription>
                  </div>
                  <div className="text-right">
                     <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                       currentPayroll?.estado === 'pagado' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-500'
                     }`}>
                       {currentPayroll?.estado === 'pagado' ? 'PAGO REALIZADO' : 'CÁLCULO EN CURSO'}
                     </span>
                  </div>
               </div>
            </CardHeader>
            <CardContent className="p-6">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <PayItem label="Sueldo Base" amount={currentPayroll?.sueldo_base || perfil?.sueldo_base || 0} icon={<Calculator className="w-4 h-4 text-slate-400" />} />
                  <PayItem label="Bonos Ganados" amount={currentPayroll?.bonos || 0} icon={<BadgePercent className="w-4 h-4 text-emerald-400" />} plus />
                  <PayItem label="Descuentos" amount={currentPayroll?.descuentos || 0} icon={<AlertCircle className="w-4 h-4 text-rose-500" />} minus />
                  <PayItem label="Adelantos" amount={currentPayroll?.adelantos || 0} icon={<TrendingUp className="w-4 h-4 text-blue-400" />} minus />
               </div>

               <div className="mt-8 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="text-center md:text-left">
                     <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Neto a Recibir</p>
                     <h2 className="text-4xl font-black text-white">S/ {totalCalculated.toFixed(2)}</h2>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 inline-flex items-center gap-3">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     <p className="text-xs text-slate-400">Los bonos se actualizan según tu progreso de metas.</p>
                  </div>
               </div>
            </CardContent>
         </Card>

         <div className="p-6 rounded-2xl bg-blue-600/5 border border-blue-500/10">
            <h4 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
               <AlertCircle className="w-4 h-4" />
               Nota Importante
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
               Las tardanzas y faltas se descuentan semanalmente. Asegúrate de registrar tu asistencia correctamente. Si tienes dudas sobre un bono, consulta tu <Link href="/dashboard/metas" className="text-blue-400 underline">panel de metas</Link>.
            </p>
         </div>
      </div>

      <div className="lg:col-span-12 xl:col-span-4">
         <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
           <CardHeader className="bg-slate-800/30 border-b border-slate-800/50">
             <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
               <History className="w-5 h-5 text-slate-400" />
               Historial de Boletas
             </CardTitle>
           </CardHeader>
           <CardContent className="p-0">
              <div className="divide-y divide-slate-800">
                 {payrollHistory?.map((p: any) => (
                    <div key={p.id} className="p-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between">
                       <div>
                          <p className="text-sm font-bold text-white uppercase">{format(new Date(p.anio, p.mes - 1), 'MMMM yyyy', { locale: es })}</p>
                          <p className="text-[10px] text-slate-500">Monto Final: S/ {(p.sueldo_base + p.bonos - p.descuentos - p.adelantos).toFixed(2)}</p>
                       </div>
                       <Badge variant="outline" className={p.estado === 'pagado' ? 'text-emerald-400 border-emerald-900/50' : 'text-amber-500 border-amber-900/50'}>
                          {p.estado}
                       </Badge>
                    </div>
                 ))}
                 {(!payrollHistory || payrollHistory.length === 0) && (
                    <div className="p-10 text-center">
                       <p className="text-slate-600 text-sm">Sin historial disponible.</p>
                    </div>
                 )}
              </div>
           </CardContent>
         </Card>
      </div>
    </div>
  )
}

function PayItem({ label, amount, icon, plus, minus }: any) {
   return (
      <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50 space-y-3">
         <div className="flex items-center gap-2">
            <span className="p-1 bg-slate-900 rounded">{icon}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
         </div>
         <p className={`text-xl font-bold ${plus ? 'text-emerald-400' : minus ? 'text-rose-400' : 'text-slate-200'}`}>
            {plus && '+ '} {minus && '- '} S/ {amount.toFixed(2)}
         </p>
      </div>
   )
}
