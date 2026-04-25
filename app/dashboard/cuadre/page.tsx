import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { CuadreForm } from '@/components/finanzas/cuadre-form'
import { Clock, History } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Cuadre de Caja'
}

export default async function CuadrePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch Carteras for the advisor
  const { data: carteras } = await supabase
    .from('carteras')
    .select('*')
    .eq('asesor_id', user.id)

  if (!carteras || carteras.length === 0) {
     return (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/50 border border-slate-800 rounded-3xl">
           <Clock className="w-16 h-16 text-slate-700 mb-4" />
           <p className="text-slate-400 text-lg">No tienes carteras asignadas para realizar el cuadre.</p>
           <Link href="/dashboard" className="text-blue-400 hover:underline mt-4">Volver al Dashboard</Link>
        </div>
     )
  }

  // Fetch Recent Cuadres
  const { data: recentCuadres } = await supabase
    .from('cuadres_diarios')
    .select(`
      *
    `)
    .eq('asesor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Check Block Status
  let isDebtBlocked = false
  let isMorningBlocked = false
  let isNightBlocked = false
  let blockStatusData = null
  let access = null

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol === 'asesor') {
    blockStatusData = await checkAdvisorBlocked(supabase, user.id)
    if (blockStatusData.isBlocked && blockStatusData.code === 'SALDO_PENDIENTE') {
        isDebtBlocked = true
    }

    // Verificar si debe un cuadre de mañana o si es cierre nocturno
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    access = await checkSystemAccess(supabase, user.id, perfil.rol, 'solicitud')
    if (!access.allowed) {
        if (access.code === 'MISSING_MORNING_CUADRE') {
            isMorningBlocked = true
        }
        if (access.code === 'NIGHT_RESTRICTION') {
            isNightBlocked = true
        }
    }
  }

  // Preparamos los objetos para DashboardAlerts
  const accessInfo = access
  const blockInfoData = blockStatusData || { isBlocked: false }

  return (
    <div className="page-container">
      <DashboardAlerts 
        userId={user.id} 
        blockInfo={blockInfoData} 
        accessInfo={accessInfo} 
      />

      {/* Header Section */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">Cuadre de Caja</h1>
              <p className="page-subtitle">
                Realiza el cierre de tu jornada y entrega el dinero recaudado.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form (Left) */}
        <div className="lg:col-span-12 xl:col-span-7">
          <CuadreForm 
            carteras={carteras} 
            userId={user.id} 
            isDebtBlocked={isDebtBlocked} 
            isMorningBlocked={isMorningBlocked} 
            isNightBlocked={isNightBlocked}
            debtAmount={blockStatusData?.leftover}
            systemConfig={access?.config}
          />
        </div>

        {/* History (Right) */}
        <div className="lg:col-span-12 xl:col-span-5 space-y-6">
           <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
             <CardHeader className="bg-slate-800/30 border-b border-slate-800/50">
               <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                 <History className="w-5 h-5 text-purple-400" />
                 Últimos Movimientos
               </CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                <div className="divide-y divide-slate-800">
                  {recentCuadres?.map((c) => (
                    <div key={c.id} className="p-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between">
                       <div className="space-y-1">
                          <div className="flex items-center gap-2">
                             <span className="text-sm font-bold text-white">
                                {format(new Date(c.created_at), 'dd/MM/yyyy hh:mm a')}
                             </span>
                             <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase">
                                {c.tipo_cuadre}
                             </span>
                          </div>
                          <p className="text-xs text-slate-500">Monto entregado: S/ {c.saldo_entregado}</p>
                          {c.estado === 'aprobado' && (c.cuenta_caja || c.cuenta_digital) && (
                              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                 {c.cuenta_caja && (
                                    <span className="text-[9px] text-emerald-500/70 font-medium flex items-center gap-1">
                                       🏦 {c.cuenta_caja.nombre}
                                    </span>
                                 )}
                                 {c.cuenta_digital && (
                                    <span className="text-[9px] text-blue-400/70 font-medium flex items-center gap-1">
                                       📱 {c.cuenta_digital.nombre}
                                    </span>
                                 )}
                              </div>
                           )}
                       </div>
                       <div>
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg ${
                            c.estado === 'aprobado' ? 'bg-emerald-500/20 text-emerald-400' :
                            c.estado === 'pendiente' ? 'bg-yellow-500/20 text-yellow-500' :
                            'bg-rose-500/20 text-rose-400'
                          }`}>
                            {c.estado === 'aprobado' ? 'Validado' : 
                             c.estado === 'pendiente' ? 'Esperando' : 'Error'}
                          </span>
                       </div>
                    </div>
                  ))}
                  {(!recentCuadres || recentCuadres.length === 0) && (
                    <div className="p-10 text-center">
                       <p className="text-slate-500 text-sm">Sin historial de cierres.</p>
                    </div>
                  )}
                </div>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}
