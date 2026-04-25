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

import { MovementsFilterBar } from '@/components/admin/movements-filter-bar'
import { SyncAccountBalance } from '@/components/admin/sync-account-balance'
import { MovementsPagination } from '@/components/admin/movements-pagination'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const p = await params
    const supabaseAdmin = createAdminClient()
    const { data: cartera } = await supabaseAdmin
        .from('carteras')
        .select('nombre')
        .eq('id', p.id)
        .single()
    return {
        title: `Movimientos: ${cartera?.nombre || 'Cartera'}`
    }
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cuenta?: string, q?: string, tipo?: string, page?: string }>
}

export default async function CarteraMovimientosPage({ params, searchParams }: PageProps) {
  const p = await params
  const id = p.id
  const sp = await searchParams
  const cuentaFilter = sp.cuenta
  const qFilter = sp.q
  const tipoFilter = sp.tipo
  const page = Number(sp.page) || 1
  const pageSize = 10
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <div className="p-10 text-red-500 text-center font-bold">Sesión expirada.</div>

  if (!user) return <div className="p-10 text-red-500 text-center font-bold">Sesión expirada.</div>

  // OPTIMIZATION: Start all queries in parallel
  const [perfilRes, carteraRes, accountsRes] = await Promise.all([
    adminClient.from('perfiles').select('rol').eq('id', user.id).single(),
    adminClient.from('carteras').select('nombre').eq('id', id).single(),
    adminClient.from('cuentas_financieras').select('*').eq('cartera_id', id).order('nombre')
  ])

  const perfil = perfilRes.data
  const cartera = carteraRes.data
  const accounts = accountsRes.data || []

  if (perfil?.rol !== 'admin') return <div className="p-10 text-red-500 text-center font-bold">Acceso administrativo denegado.</div>

  // Separate query for movements (could also be part of Promise.all but depends on filters)
  let query = adminClient
    .from('movimientos_financieros')
    .select(`
       *,
       origen:cuentas_financieras!movimientos_financieros_cuenta_origen_id_fkey(id, nombre, tipo, carteras(nombre)),
       destino:cuentas_financieras!movimientos_financieros_cuenta_destino_id_fkey(id, nombre, tipo, carteras(nombre))
    `, { count: 'exact' })
    .eq('cartera_id', id)

  if (cuentaFilter) {
    query = query.or(`cuenta_origen_id.eq.${cuentaFilter},cuenta_destino_id.eq.${cuentaFilter}`)
  }

  if (tipoFilter && tipoFilter !== 'todos') {
    query = query.eq('tipo', tipoFilter)
  }

  if (qFilter) {
    query = query.ilike('descripcion', `%${qFilter}%`)
  }

  const { data: movements, error: mError, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  const totalRecords = count || 0
  const totalPages = Math.ceil(totalRecords / pageSize)

  const formatMoney = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2 })

  return (
    <div className="page-container pb-20">
      {/* HEADER SECTION */}
      <div className="page-header">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">Movimientos</h1>
              <p className="page-subtitle">
                {cartera?.nombre || 'Cartera'}
              </p>
            </div>
          </div>
          
          {cuentaFilter && (
            <SyncAccountBalance 
              cuentaId={cuentaFilter} 
              nombreCuenta={accounts.find(a => a.id === cuentaFilter)?.nombre || 'Cuenta'} 
            />
          )}
        </div>
      </div>

      {/* NEW FILTER BAR STYLE */}
      <MovementsFilterBar 
        accounts={accounts || []} 
        portfolioId={id}
        initialSearch={qFilter}
        initialType={tipoFilter}
        initialAccount={cuentaFilter}
      />


      {/* AUDIT TABLE CARD */}
      <Card className="bg-slate-950 border-slate-800 shadow-2xl overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-slate-900/50 border-b border-white/5">
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
                                  {m.origen.carteras?.nombre || m.origen.tipo}
                               </p>
                             </>
                           ) : (
                             m.tipo === 'ingreso' ? (
                                <>
                                  <p className="text-[10px] font-bold text-amber-400 uppercase leading-tight">
                                     {m.descripcion?.toLowerCase().includes('cuadre') ? 'CUENTA COBRANZAS' : 'CLIENTE'}
                                  </p>
                                  <p className="text-[8px] text-amber-600/50 uppercase font-medium">
                                     {m.descripcion?.toLowerCase().includes('cuadre') ? 'ASESOR' : 'PAGADOR'}
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
                                  {m.destino.carteras?.nombre || m.destino.tipo}
                               </p>
                             </>
                           ) : (
                             m.tipo === 'egreso' ? (
                                <>
                                  <p className="text-[10px] font-bold text-amber-400 uppercase leading-tight">
                                     {m.descripcion?.toLowerCase().includes('cuadre') ? 'CAJA PRINCIPAL' : 'CLIENTE'}
                                  </p>
                                  <p className="text-[8px] text-amber-600/50 uppercase font-medium">
                                     {m.descripcion?.toLowerCase().includes('cuadre') ? 'CARTERA GLOBAL' : 'RECEPTOR'}
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
          
          {totalPages > 1 && (
            <MovementsPagination 
              currentPage={page}
              totalPages={totalPages}
              totalRecords={totalRecords}
            />
          )}
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
