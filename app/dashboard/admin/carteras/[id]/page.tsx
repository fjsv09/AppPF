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
import { CarteraTransferModal } from '@/components/admin/cartera-transfer-modal'

export const dynamic = 'force-dynamic'

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


  // Premium View Logic
  const { data: perfil } = await adminClient.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return <div className="p-10 text-red-500 font-bold text-center">No autorizado.</div>

  // Fetch Cartera alone first to ensure it loads
  let { data: cartera, error: cError } = await supabase
    .from('carteras')
    .select('*, perfiles(id, nombre_completo)')
    .eq('id', id)
    .maybeSingle()
    
  if (!cartera) {
    // Check if it's the virtual global portfolio
    if (id === '00000000-0000-0000-0000-000000000000') {
      cartera = {
        id: '00000000-0000-0000-0000-000000000000',
        nombre: 'CARTERA GLOBAL (ADMIN)',
        estado: 'operación',
        asesor_id: null,
        perfiles: null
      } as any
    } else {
      return <div className="p-10 text-center text-red-500 font-mono text-xs">
          Cartera no encontrada. 
      </div>
    }
  }

  // Fetch advisors
  const { data: asesores } = await adminClient.from('perfiles').select('id, nombre_completo').eq('activo', true)

  const [resCuentas, resLoans] = await Promise.all([
    adminClient.from('cuentas_financieras').select('*').eq('cartera_id', id),
    cartera?.asesor_id ? adminClient.from('prestamos').select('monto, estado, id, clientes!inner(asesor_id)').eq('clientes.asesor_id', (cartera as any).asesor_id).neq('estado', 'anulado') : Promise.resolve({ data: [] })
  ])

  const responsable = (cartera as any).perfiles
  const accounts = resCuentas.data || []
  const loans = resLoans.data || []
  
  // Calculate stats
  const formatMoney = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const totalBalance = accounts.reduce((sum, acc) => sum + (parseFloat(acc.saldo) || 0), 0)
  const activeLoans = loans.filter((l: any) => l.estado === 'activo')
  const totalLent = activeLoans.reduce((sum: number, l: any) => sum + (parseFloat(l.monto) || 0), 0)

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
                   <img src={responsable.foto_perfil} className="w-full h-full rounded-full object-cover" />
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

      {/* KPI COMMAND CENTER (Compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Balanced Metrics */}
        <div className="lg:col-span-8 grid grid-cols-2 gap-3">
            {/* Balance Card */}
            <Card className="bg-slate-950 border-slate-800 relative overflow-hidden group">
                <CardContent className="p-2 md:p-4 space-y-1.5 md:space-y-3">
                    <div className="flex items-center gap-1 md:gap-2">
                        <div className="p-1 md:p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                           <Wallet className="w-2.5 md:w-3 h-2.5 md:h-3" />
                        </div>
                        <span className="text-[7px] md:text-[9px] text-slate-500 font-black tracking-widest uppercase truncate">Balance</span>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-0.5 md:gap-1">
                            <span className="text-[10px] md:text-sm font-medium text-slate-600">S/</span>
                            <h2 className="text-base md:text-xl font-black text-white tracking-tighter">
                               {formatMoney(totalBalance)}
                            </h2>
                        </div>
                        <p className="text-[7px] md:text-[9px] text-slate-600 mt-0.5 font-medium">{accounts.length} Cuentas</p>
                    </div>
                </CardContent>
            </Card>

            {/* In The Street Card */}
            <Card className="bg-slate-950 border-slate-800 relative overflow-hidden group">
                <CardContent className="p-2 md:p-4 space-y-1.5 md:space-y-3">
                    <div className="flex items-center gap-1 md:gap-2">
                        <div className="p-1 md:p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                           <Activity className="w-2.5 md:w-3 h-2.5 md:h-3" />
                        </div>
                        <span className="text-[7px] md:text-[9px] text-slate-500 font-black tracking-widest uppercase truncate">En Calle</span>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-0.5 md:gap-1">
                            <span className="text-[10px] md:text-sm font-medium text-slate-600">S/</span>
                            <h2 className="text-base md:text-xl font-black text-emerald-400 tracking-tighter">
                               {formatMoney(totalLent)}
                            </h2>
                        </div>
                        <p className="text-[7px] md:text-[9px] text-slate-600 mt-0.5 font-medium">
                           {activeLoans.length} Préstamos
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* History Action Row */}
            <Card className="col-span-2 bg-gradient-to-r from-blue-900/5 to-indigo-900/5 border-blue-500/10 p-0.5 rounded-xl overflow-hidden">
                <div className="bg-slate-900/60 backdrop-blur-md rounded-lg p-2 md:p-3 flex items-center justify-between gap-4 border border-white/5">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="p-1 md:p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                           <History className="w-3 md:w-3.5 h-3 md:h-3.5" />
                        </div>
                        <div>
                           <h3 className="text-[10px] md:text-xs font-bold text-white leading-none">Gestión Caja</h3>
                           <p className="text-[7px] md:text-[8px] text-slate-500 mt-0.5">Auditoría completa.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <CarteraTransferModal carteraId={id} accounts={accounts} />
                        <Button asChild size="sm" className="h-7 md:h-8 px-3 md:px-5 bg-blue-600 hover:bg-blue-500 text-white text-[9px] md:text-[10px] font-black rounded-lg shadow-lg shadow-blue-900/20 group">
                            <Link href={`/dashboard/admin/carteras/${id}/movimientos`}>
                               HISTORIAL
                               <ArrowRightCircle className="ml-1.5 w-3 md:w-3.5 h-3 md:h-3.5 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </Card>
        </div>

        {/* Status Center */}
        <div className="lg:col-span-4 flex flex-col gap-3">
            <Card className="bg-slate-950 border-slate-800 flex-1 overflow-hidden">
                <CardContent className="p-3 md:p-4 space-y-4">
                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Estado</h3>
                        <Badge className="bg-blue-600/10 text-blue-400 border-none px-1.5 py-0 text-[7px] font-bold">READY</Badge>
                    </div>

                    <div className="space-y-2">
                        <div className="p-2 rounded-lg bg-slate-900/30 border border-slate-800/50">
                            <div className="flex justify-between text-[8px] font-black text-slate-600 uppercase mb-1">
                                <span>Salud</span>
                                <span className="text-blue-500">100%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                <div className="bg-blue-500 h-full w-full rounded-full" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                             <div className="p-2 rounded-lg bg-slate-900/20 border border-slate-800/40 text-center">
                                 <p className="text-[7px] text-slate-600 font-black uppercase mb-0.5">Cuentas</p>
                                 <p className="text-sm font-black text-white leading-none">{accounts.length}</p>
                             </div>
                             <div className="p-2 rounded-lg bg-slate-900/20 border border-slate-800/40 text-center">
                                 <p className="text-[7px] text-slate-600 font-black uppercase mb-0.5">Activos</p>
                                 <p className="text-sm font-black text-emerald-400 leading-none">{activeLoans.length}</p>
                             </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>

      {/* ACCOUNTS AREA */}
      <div className="space-y-3 pt-2">
        <div className="flex items-end justify-between px-1">
            <div className="flex items-center gap-2">
               <PiggyBank className="w-4 h-4 text-blue-400" />
               <h2 className="text-sm font-black text-white tracking-tight leading-none uppercase">Cuentas</h2>
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
                                    acc.tipo.toLowerCase() === 'banco' ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
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
