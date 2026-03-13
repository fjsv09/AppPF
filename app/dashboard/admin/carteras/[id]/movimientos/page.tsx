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
  Briefcase
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
  let query = adminClient
    .from('movimientos_financieros')
    .select(`
      *,
      origen:cuentas_financieras!movimientos_financieros_cuenta_origen_id_fkey(nombre, tipo),
      destino:cuentas_financieras!movimientos_financieros_cuenta_destino_id_fkey(nombre, tipo)
    `)
    .order('created_at', { ascending: false })

  if (cuentaFilter) {
    query = query.or(`cuenta_origen_id.eq.${cuentaFilter},cuenta_destino_id.eq.${cuentaFilter}`)
  } else if (accIds.length > 0) {
    const idsStr = `(${accIds.join(',')})`
    query = query.or(`cuenta_origen_id.in.${idsStr},cuenta_destino_id.in.${idsStr}`)
  } else {
    query = query.eq('cartera_id', id)
  }

  const { data: movements, error: mError } = await query

  const formatMoney = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2 })

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <BackButton />
             <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] font-black uppercase tracking-widest py-0.5">
                Financial Audit
             </Badge>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
               <History className="w-7 h-7 text-blue-500" />
            </div>
            <div>
               <h1 className="text-4xl font-black text-white tracking-tight leading-none uppercase">
                  Historial de Movimientos
               </h1>
               <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 rounded border border-slate-800">
                     <Briefcase className="w-3 h-3 text-slate-500" />
                     <span className="text-[10px] text-slate-400 font-bold uppercase">{cartera?.nombre || 'Cartera'}</span>
                  </div>
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
           <Button variant="outline" className="bg-slate-900 border-slate-800 text-slate-400 hover:text-white h-11 px-6 rounded-xl font-bold">
              <Download className="w-4 h-4 mr-2" />
              EXPORTAR
           </Button>
        </div>
      </div>

      {/* FILTER BAR - QUICK CHIPS */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none -mx-2 px-2">
         <Link href={`/dashboard/admin/carteras/${id}/movimientos`}>
            <Badge className={cn(
               "h-9 px-4 rounded-xl cursor-pointer font-bold transition-all border",
               !cuentaFilter ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/20" : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
            )}>
               TODOS LOS MOVIMIENTOS
            </Badge>
         </Link>
         {accounts?.map(acc => (
            <Link key={acc.id} href={`/dashboard/admin/carteras/${id}/movimientos?cuenta=${acc.id}`}>
               <Badge className={cn(
                  "h-9 px-4 rounded-xl cursor-pointer font-bold transition-all border whitespace-nowrap",
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
            <table className="w-full text-left">
               <thead className="bg-slate-900/50 border-b border-white/5">
                  <tr>
                     <th className="px-8 py-5 text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Registro / Fecha</th>
                     <th className="px-6 py-5 text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Cuenta Origen</th>
                     <th className="px-6 py-5 text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Concepto / Detalle</th>
                     <th className="px-6 py-5 text-[10px] uppercase font-black text-slate-500 tracking-[0.2em]">Categoría</th>
                     <th className="px-8 py-5 text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] text-right">Monto Unitario</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {movements?.map((m: any) => (
                    <tr key={m.id} className="hover:bg-blue-500/5 transition-colors group">
                       <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                             <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center border",
                                m.tipo === 'ingreso' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                             )}>
                                {m.tipo === 'ingreso' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                             </div>
                             <div>
                                <p className="text-xs font-black text-white">{new Date(m.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
                             </div>
                          </div>
                       </td>
                       <td className="px-6 py-6">
                          <p className="text-xs font-bold text-slate-300 uppercase">
                             {m.origen?.nombre || m.destino?.nombre || 'Cuenta Desconocida'}
                          </p>
                          <p className="text-[10px] text-slate-500 uppercase font-medium">
                             {m.origen?.tipo || m.destino?.tipo || 'N/A'}
                          </p>
                       </td>
                       <td className="px-6 py-6">
                          <p className="text-sm text-slate-200 font-medium group-hover:text-white transition-colors">
                             {m.descripcion}
                          </p>
                       </td>
                       <td className="px-6 py-6 font-mono text-[10px]">
                          <Badge variant="outline" className={cn(
                             "border-none px-2 py-0.5",
                             m.tipo === 'ingreso' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          )}>
                             {m.tipo.toUpperCase()}
                          </Badge>
                       </td>
                       <td className={cn(
                          "px-8 py-6 text-right font-black text-lg",
                          m.tipo === 'ingreso' ? "text-emerald-400" : "text-rose-400"
                       )}>
                          <span className="text-[10px] font-medium mr-1.5 opacity-50">S/</span>
                          {parseFloat(m.monto).toFixed(2)}
                       </td>
                    </tr>
                  ))}
                  
                  {(!movements || movements.length === 0) && (
                    <tr>
                       <td colSpan={5} className="py-24 text-center">
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
