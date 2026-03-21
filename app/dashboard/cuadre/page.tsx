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
import { AlertTriangle, Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

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
    .select('*')
    .eq('asesor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Check Block Status
  let isBlocked = false
  let blockReason = ''
  
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol === 'asesor') {
    const blockStatus = await checkAdvisorBlocked(supabase, user.id)
    isBlocked = blockStatus.isBlocked
    blockReason = blockStatus.reason
  }

  return (
    <div className="page-container">
      {isBlocked && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-4 shadow-lg shadow-rose-500/5 mx-0.5">
          <div className="bg-rose-500/20 p-2.5 rounded-full shrink-0">
            <Lock className="h-6 w-6 text-rose-500" />
          </div>
          <div>
            <h4 className="text-rose-400 font-bold text-base tracking-tight leading-tight">Operaciones Bloqueadas por Diferencia</h4>
            <p className="text-rose-200/80 text-xs mt-1 leading-snug">
              {blockReason} 
              <br className="sm:hidden" />
              <strong className="text-rose-300"> Todos tus cobros y renovaciones están desactivados hasta que aprueben el saneamiento de este saldo.</strong>
            </p>
          </div>
        </div>
      )}

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
          <CuadreForm carteras={carteras} userId={user.id} />
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
                                {format(new Date(c.created_at), 'dd/MM/yyyy')}
                             </span>
                             <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase">
                                {c.tipo_cuadre}
                             </span>
                          </div>
                          <p className="text-xs text-slate-500">Monto total entegado: S/ {c.saldo_entregado}</p>
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

           {/* Help Card */}
           <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-600/10 to-transparent border border-blue-500/20 shadow-xl">
              <h4 className="text-blue-400 font-bold mb-2">Instrucciones de Cierre</h4>
              <ul className="text-xs text-slate-400 space-y-3 list-disc pl-4">
                 <li>Reporta el cierre parcial entre las <span className="text-blue-200">2:00 PM y 4:00 PM</span>.</li>
                 <li>El cierre final debe realizarse al finalizar la ruta de cobranza.</li>
                 <li>Asegúrate de que el dinero coincida con el reporte de tu celular.</li>
                 <li>Cualquier diferencia será notificada al supervisor.</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  )
}
