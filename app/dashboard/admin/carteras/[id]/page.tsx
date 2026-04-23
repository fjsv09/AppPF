import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { 
    Briefcase, 
    TrendingUp, 
    DollarSign, 
    PieChart, 
    Users, 
    ChevronRight,
    Wallet,
    Activity,
    ShieldCheck,
    ArrowRightCircle,
    PiggyBank,
    History,
    AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { CarteraAdvisorAssign } from '@/components/admin/cartera-advisor-assign'
import { CarteraNavButtons } from '@/components/admin/cartera-nav-buttons'
import { CarteraAccountsManageModal } from '@/components/admin/cartera-accounts-manage-modal'

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
        title: `Cartera: ${cartera?.nombre || 'Detalle'}`
    }
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function CarteraDetailPage({ params, searchParams }: PageProps) {
  const p = await params
  const sp = await searchParams
  const id = p.id
  const mode = sp.mode
  
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <div className="p-10 text-red-500 font-bold text-center">Sesión expirada.</div>

  // OPTIMIZATION: Start independent queries in parallel
  const [perfilRes, carterasRes, asesoresRes] = await Promise.all([
    adminClient.from('perfiles').select('rol').eq('id', user.id).single(),
    supabase.from('carteras').select('*, perfiles(id, nombre_completo)').eq('id', id).maybeSingle(),
    adminClient.from('perfiles').select('id, nombre_completo').eq('activo', true).order('nombre_completo')
  ])

  const perfil = perfilRes.data
  const asesores = asesoresRes.data
  let cartera = carterasRes.data
  
  if (perfil?.rol !== 'admin') return <div className="p-10 text-red-500 font-bold text-center">No autorizado.</div>

  if (!cartera) {
    if (id === '00000000-0000-0000-0000-000000000000') {
      cartera = {
        id: '00000000-0000-0000-0000-000000000000',
        nombre: 'CARTERA GLOBAL (ADMIN)',
        estado: 'operación',
        asesor_id: null,
        perfiles: null
      } as any
    } else {
      return <div className="p-10 text-center text-red-500 font-mono text-xs">Cartera no encontrada.</div>
    }
  }

  // Dynamic loan fetching based on role and charge
  const fetchLoans = async () => {
    // Global Portfolio case: always fetch everything
    if (id === '00000000-0000-0000-0000-000000000000') {
       return adminClient.from('prestamos')
        .select(`id, monto, interes, estado, clientes!inner(asesor_id), cronograma_cuotas(monto_cuota, monto_pagado)`)
        .neq('estado', 'anulado')
    }
    if (!cartera?.asesor_id) return { data: [] }
    
    const resp = (cartera as any).perfiles
    let query = adminClient.from('prestamos')
      .select(`id, monto, interes, estado, clientes!inner(asesor_id), cronograma_cuotas(monto_cuota, monto_pagado)`)
      .neq('estado', 'anulado')
      
    // 1. ADMIN: Can see everything global if they are the responsible of this "Admin Portfolio"
    if (resp?.rol === 'admin') return query 

    // 2. SUPERVISOR: See theirs + advisors at their charge
    if (resp?.rol === 'supervisor') {
        const { data: sups } = await adminClient.from('perfiles').select('id').eq('supervisor_id', (cartera as any).asesor_id)
        const ids = [cartera.asesor_id, ...(sups || []).map(s => s.id)]
        return query.in('clientes.asesor_id', ids)
    }

    // 3. ASESOR: Normal restricted view
    return query.eq('clientes.asesor_id', (cartera as any).asesor_id)
  }

  const [resCuentas, resLoans] = await Promise.all([
    adminClient.from('cuentas_financieras').select('*').eq('cartera_id', id).order('nombre'),
    fetchLoans()
  ])
 
  const responsable = (cartera as any).perfiles
  const accounts = resCuentas.data || []
  const loans = resLoans.data || []
  
  // Calculate stats
  const formatMoney = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const totalBalance = accounts.reduce((sum, acc) => sum + (parseFloat(acc.saldo) || 0), 0)
  const activeLoans = loans.filter((l: any) => l.estado === 'activo')
  const totalLent = activeLoans.reduce((sum: number, l: any) => sum + (parseFloat(l.monto) || 0), 0)
  const totalPending = activeLoans.reduce((sum, loan: any) => {
    const loanPending = (loan.cronograma_cuotas || []).reduce((acc: number, c: any) => 
        acc + (parseFloat(c.monto_cuota) || 0) - (parseFloat(c.monto_pagado) || 0), 0)
    return sum + loanPending
  }, 0)

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="page-title">
              Detalle de Cartera
            </h1>
            <p className="page-subtitle">
              {cartera.nombre}
            </p>
          </div>
        </div>

        {/* Responsible Person Widget (Dynamic) - Adjusted Padding for Header Unity */}
        <div className="flex items-center gap-2.5 bg-slate-900/40 p-1.5 md:p-2 rounded-xl border border-slate-800/60 backdrop-blur-xl min-w-[180px] md:min-w-[220px]">
            <div className="h-7 w-7 md:h-8 md:w-8 rounded-full border border-blue-500/20 p-0.5 shrink-0">
               {id === '00000000-0000-0000-0000-000000000000' ? (
                   <div className="h-full w-full rounded-full bg-blue-500/10 flex items-center justify-center">
                     <ShieldCheck className="w-4 h-4 text-blue-400" />
                   </div>
               ) : responsable?.foto_perfil ? (
                   <>
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={responsable.foto_perfil} alt={responsable.nombre_completo} className="w-full h-full rounded-full object-cover" />
                   </>
               ) : (
                   <div className="h-full w-full rounded-full bg-slate-800 flex items-center justify-center">
                     <Users className="w-4 h-4 text-slate-500" />
                   </div>
               )}
            </div>
            <div className="flex-1">
               <p className="text-[6px] text-slate-500 font-black uppercase tracking-[0.1em] leading-none mb-0.5">Responsable</p>
               {id === '00000000-0000-0000-0000-000000000000' ? (
                   <h3 className="text-[9px] md:text-[10px] font-bold text-blue-400 leading-tight uppercase">Control Administrativo</h3> 
               ) : cartera.asesor_id ? (
                   <h3 className="text-[9px] md:text-[10px] font-bold text-white leading-tight capitalize">
                     {responsable?.nombre_completo || 'Usuario Desconocido'}
                   </h3>
               ) : (
                   <div className="space-y-1">
                     <span className="text-[8px] font-bold text-rose-500 flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5" /> Sin Asesor
                     </span>
                     <CarteraAdvisorAssign carteraId={id} asesores={asesores || []} />
                   </div>
               )}
            </div>
        </div>
      </div>

      {/* KPI COMMAND CENTER (Compact) */}      <div className="space-y-4">
        {/* TOP METRICS ROW: 3 Equal Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. BALANCE CARD */}
            <Card className="bg-slate-950 border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-[40px] -mr-12 -mt-12" />
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                               <Wallet className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Balance</span>
                        </div>
                        <Badge className="bg-blue-600/5 text-blue-400/60 border-none px-1 text-[7px] font-bold">TOTAL</Badge>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-bold text-slate-600">S/</span>
                            <h2 className="text-2xl font-black text-white tracking-tighter">
                               {formatMoney(totalBalance)}
                            </h2>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-tight">
                           {accounts.length} Cuentas <span className="text-slate-700 mx-1">|</span> {activeLoans.length} Préstamos
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* 2. CAPITAL COLOCADO CARD */}
            <Card className="bg-slate-950 border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-[40px] -mr-12 -mt-12" />
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                               <DollarSign className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Capital en Calle</span>
                        </div>
                        <Badge className="bg-emerald-600/5 text-emerald-400/60 border-none px-1 text-[7px] font-bold">ACTIVO</Badge>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-bold text-slate-600">S/</span>
                            <h2 className="text-2xl font-black text-emerald-400 tracking-tighter">
                               {formatMoney(totalLent)}
                            </h2>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-tight">
                            Dinero Principal Lent
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* 3. TOTAL COBRANZA CARD */}
            <Card className="bg-slate-950 border-blue-500/10 relative overflow-hidden group shadow-2xl shadow-blue-500/5 border-l-2 border-l-blue-500/20">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 blur-[40px] -mr-12 -mt-12" />
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400">
                               <TrendingUp className="w-4 h-4" />
                            </div>
                            <span className="text-[9px] text-blue-400 font-black tracking-widest uppercase">Cobranza Total</span>
                        </div>
                        <Badge className="bg-blue-600/20 text-blue-400 border-none px-1 text-[7px] font-bold">PROYECTADO</Badge>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-sm font-bold text-slate-600">S/</span>
                            <h2 className="text-2xl font-black text-white tracking-tighter">
                               {formatMoney(totalPending)}
                            </h2>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-tight">
                           Capital + Intereses por Cobrar
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* FULL WIDTH ACTION BAR */}
        <Card className="bg-slate-950 border-slate-800 p-0.5 rounded-xl">
            <div className="bg-slate-900/40 rounded-lg p-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-800 rounded-lg text-slate-400">
                       <History className="w-4 h-4" />
                    </div>
                    <div>
                       <h3 className="text-xs font-bold text-white leading-none uppercase tracking-tight">Gestión Operativa</h3>
                       <p className="text-[10px] text-slate-500 mt-0.5">Control de cuentas y movimientos financieros.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <CarteraNavButtons carteraId={id} accounts={accounts} />
                </div>
            </div>
        </Card>
      </div>

      {/* ACCOUNTS AREA */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between px-1 gap-3">
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-blue-400" />
                  <h2 className="text-sm font-black text-white tracking-tight leading-none uppercase">Cuentas</h2>
               </div>
               <CarteraAccountsManageModal carteraId={id} accounts={accounts} />
            </div>
            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-600">
               <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> BANCO</span>
               <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> EFECTIVO</span>
            </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {accounts.map(acc => (
                <Link key={acc.id} href={`/dashboard/admin/carteras/${id}/movimientos?cuenta=${acc.id}`} className="group outline-none">
                    <Card className="bg-slate-950 border-slate-800/60 hover:border-blue-500/40 hover:bg-slate-900/40 transition-all duration-300 h-full">
                        <CardContent className="p-2 md:p-3.5">
                            <div className="flex items-center justify-between mb-2 md:mb-3">
                                <Badge className={cn(
                                    "px-1.5 py-0 border-none font-black text-[6px] md:text-[6.5px] tracking-wider uppercase",
                                    (acc.tipo === 'digital' || acc.tipo === 'cobranzas' || acc.tipo.toLowerCase() === 'banco') ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                                )}>
                                    {acc.tipo}
                                </Badge>
                                <div className="p-0.5 md:p-1 bg-slate-900 rounded-lg border border-slate-800 group-hover:bg-blue-500/10 transition-colors">
                                    <DollarSign className="w-2.5 md:w-3 h-2.5 md:h-3 text-slate-500 group-hover:text-blue-400" />
                                </div>
                            </div>
                            
                            <h3 className="text-[9px] md:text-[10px] font-bold text-white group-hover:text-blue-300 transition-colors uppercase truncate mb-0.5">
                               {acc.nombre}
                            </h3>
                            
                            <div className="flex items-baseline gap-0.5 md:gap-1 mt-1.5 md:mt-2">
                               <span className="text-[8px] md:text-[9px] font-medium text-slate-600">S/</span>
                               <span className="text-base md:text-lg font-black text-white font-mono tracking-tighter">
                                 {formatMoney(parseFloat(acc.saldo))}
                               </span>
                            </div>

                            <div className="mt-2 md:mt-3 pt-1.5 md:pt-2 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[6px] md:text-[7px] font-black text-slate-600 group-hover:text-blue-500 uppercase tracking-widest transition-colors">Auditar</span>
                                <ChevronRight className="w-2 md:w-2.5 h-2 md:h-2.5 text-slate-700 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            ))}

            {accounts.length === 0 && (
               <div className="col-span-full py-12 text-center bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
                  <p className="text-xs font-bold text-slate-500 uppercase">Sin Cuentas Configuradas</p>
               </div>
            )}
        </div>
      </div>
    </div>
  )
}
