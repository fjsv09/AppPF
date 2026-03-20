import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { 
  History, 
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Download,
  Calendar,
  Banknote,
  MoreVertical,
  ChevronRight,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Briefcase,
  User
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { BackButton } from '@/components/ui/back-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cuenta?: string }>
}

export default async function CarteraMovimientosPage({ params, searchParams }: PageProps) {
  const p = await params
  const id = p.id
  const sp = await searchParams
  const cuentaFilter = sp.cuenta

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <div className="p-10 text-red-500 text-center font-bold">Sesión expirada.</div>

  const { data: perfil } = await adminClient.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return <div className="p-10 text-red-500 text-center font-bold">Acceso administrativo denegado.</div>

  // 1. Fetch Cartera and Source Accounts
  const { data: cartera } = await adminClient.from('carteras').select('nombre').eq('id', id).single()
  const { data: accounts } = await adminClient.from('cuentas_financieras').select('*').eq('cartera_id', id)
  
  const accIds = accounts?.map(a => a.id) || []
  const selectedAccountName = accounts?.find(a => a.id === cuentaFilter)?.nombre

  // 2. Fetch Movements
  // Temporarily simplified to debug "fecha" error
  const { data: movements, error: mError } = await adminClient
    .from('movimientos_financieros')
    .select(`
       *,
       origen:cuentas_financieras!movimientos_financieros_cuenta_origen_id_fkey(id, nombre, tipo),
       destino:cuentas_financieras!movimientos_financieros_cuenta_destino_id_fkey(id, nombre, tipo)
    `)
    .eq('cartera_id', id)
    .order('created_at', { ascending: false })

  const formatMoney = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <BackButton />
             <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] font-black uppercase tracking-widest py-0.5">
                Financial Audit
             </Badge>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
               <History className="w-5 h-5 text-blue-500" />
            </div>
            <div>
               <h1 className="text-xl md:text-2xl font-black text-white tracking-tight leading-none uppercase">
                  Movimientos
               </h1>
               <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 rounded border border-slate-800">
                     <Briefcase className="w-3 h-3 text-slate-500" />
                     <span className="text-[10px] text-slate-400 font-bold uppercase">{cartera?.nombre || 'Cartera'}</span>
                  </div>
                  {(cartera as any)?.perfiles?.nombre_completo && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 rounded border border-blue-500/20">
                       <User className="w-3 h-3 text-blue-400" />
                       <span className="text-[10px] text-blue-400 font-bold uppercase">{(cartera as any).perfiles.nombre_completo}</span>
                    </div>
                  )}
                  {selectedAccountName && (
                     <Badge variant="outline" className="text-[10px] bg-emerald-500/5 text-emerald-400 border-emerald-500/10">
                        FILTRADO: {selectedAccountName}
                     </Badge>
                  )}
               </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <Button variant="outline" className="bg-slate-900 border-slate-800 text-slate-400 hover:text-white h-9 px-4 rounded-xl font-bold text-xs">
              <Download className="w-3 h-3 mr-2" />
              EXPORTAR
           </Button>
        </div>
      </div>

      {/* FILTER BAR - QUICK CHIPS */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none -mx-2 px-2">
         <Link href={`/dashboard/admin/carteras/${id}/movimientos`}>
            <Badge className={cn(
               "h-7 px-3 rounded-lg cursor-pointer font-bold transition-all border text-[9px]",
               !cuentaFilter ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/20" : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
            )}>
               TODOS
            </Badge>
         </Link>
         {accounts?.map(acc => (
            <Link key={acc.id} href={`/dashboard/admin/carteras/${id}/movimientos?cuenta=${acc.id}`}>
               <Badge className={cn(
                  "h-7 px-3 rounded-lg cursor-pointer font-bold transition-all border whitespace-nowrap text-[9px]",
                  cuentaFilter === acc.id ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/20" : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
               )}>
                  {acc.nombre.toUpperCase()}
               </Badge>
            </Link>
         ))}
      </div>

      {/* AUDIT TABLE CARD */}
      <Card className="bg-slate-950 border-slate-800 shadow-2xl overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">                <thead className="bg-slate-900/50 border-b border-white/5">
                  <tr>
                     <th className="px-4 py-3 text-[9px] uppercase font-black text-slate-500 tracking-wider">Fecha</th>
                     <th className="px-3 py-3 text-[9px] uppercase font-black text-slate-500 tracking-wider">Origen</th>
                     <th className="px-3 py-3 text-[9px] uppercase font-black text-slate-500 tracking-wider">Destino</th>
                     <th className="px-3 py-3 text-[9px] uppercase font-black text-slate-500 tracking-wider">Detalle</th>
                     <th className="px-3 py-3 text-[9px] uppercase font-black text-slate-500 tracking-wider text-right">Monto</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {movements?.map((m: any) => (
                    <tr key={m.id} className="hover:bg-blue-500/5 transition-colors group">
                       <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                             <div className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center border",
                                m.tipo === 'ingreso' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                             )}>
                                {m.tipo === 'ingreso' ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                             </div>
                             <div>
                                <p className="text-[10px] font-black text-white">{new Date(m.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</p>
                                <p className="text-[9px] text-slate-500 font-mono">{new Date(m.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
                             </div>
                          </div>
                       </td>
                        <td className="px-3 py-2.5">
                           {m.origen ? (
                             <>
                               <p className="text-[10px] font-bold text-slate-300 uppercase leading-tight">
                                  {m.origen.nombre}
                               </p>
                               <p className="text-[8px] text-slate-500 uppercase font-medium">
                                  {m.origen.tipo}
                               </p>
                             </>
                           ) : (
                             m.tipo === 'ingreso' ? (
                                <>
                                  <p className="text-[10px] font-bold text-amber-400 uppercase leading-tight">
                                     CLIENTE
                                  </p>
                                  <p className="text-[8px] text-amber-600/50 uppercase font-medium">
                                     PAGADOR
                                  </p>
                                </>
                             ) : (
                              <p className="text-[8px] text-slate-600 font-bold uppercase italic">N/A</p>
                             )
                           )}
                        </td>
                        <td className="px-3 py-2.5">
                           {m.destino ? (
                             <>
                               <p className="text-[10px] font-bold text-blue-400 uppercase leading-tight">
                                  {m.destino.nombre}
                               </p>
                               <p className="text-[8px] text-slate-500 uppercase font-medium">
                                  {m.destino.tipo}
                               </p>
                             </>
                           ) : (
                             m.tipo === 'egreso' ? (
                                <>
                                  <p className="text-[10px] font-bold text-amber-400 uppercase leading-tight">
                                     CLIENTE
                                  </p>
                                  <p className="text-[8px] text-amber-600/50 uppercase font-medium">
                                     RECEPTOR
                                  </p>
                                </>
                             ) : (
                              <p className="text-[8px] text-slate-600 font-bold uppercase italic">N/A</p>
                             )
                           )}
                        </td>
                       <td className="px-3 py-2.5 min-w-[180px]">
                          <p className="text-xs text-slate-200 font-medium group-hover:text-white transition-colors">
                             {m.descripcion}
                          </p>
                          <Badge variant="outline" className={cn(
                             "border-none px-1 py-0 font-bold text-[7px] uppercase mt-0.5",
                             m.categoria === 'transferencia' ? "bg-blue-500/10 text-blue-400" :
                             m.tipo === 'ingreso' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          )}>
                             {m.categoria || m.tipo}
                          </Badge>
                       </td>
                       <td className={cn(
                          "px-4 py-2.5 text-right font-black text-sm",
                          m.tipo === 'ingreso' ? "text-emerald-400" : "text-rose-400"
                       )}>
                          <span className="text-[8px] font-medium mr-1 opacity-50">S/</span>
                          {parseFloat(m.monto).toFixed(2)}
                       </td>
                    </tr>
                  ))}
                  
                  {(!movements || movements.length === 0) && (
                    <tr>
                       <td colSpan={6} className="py-24 text-center">
                          <div className="h-20 w-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800">
                             <Search className="w-8 h-8 text-slate-600" />
                          </div>
                          <p className="text-xl font-bold text-slate-400">Sin Movimientos</p>
                          <p className="text-sm text-slate-600 mt-2">No se encontraron registros financieros para el criterio seleccionado.</p>
                       </td>
                    </tr>
                  )}
               </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {mError && (
        <div className="p-6 bg-rose-500/5 text-rose-400 text-xs rounded-2xl border border-rose-500/10 font-mono">
           [AUDIT_ERROR]: {JSON.stringify(mError)}
        </div>
      )}
    </div>
  )
}
