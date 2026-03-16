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
    Terminal,
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

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function CarteraDetailPage({ params, searchParams }: PageProps) {
  const p = await params
  const id = p.id
  const sp = await searchParams
  const mode = sp.mode
  
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <div className="p-10 text-red-500 font-bold text-center">Sesión expirada.</div>

  // Diagnostic View
  if (mode === 'tech') {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BackButton />
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Diagnóstico
            </h1>
          </div>
          <Button asChild variant="outline" size="sm" className="border-blue-500/20 text-blue-400 hover:bg-blue-500/10 h-8">
            <Link href={`/dashboard/admin/carteras/${id}`}>VOLVER</Link>
          </Button>
        </div>
        <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-2 font-mono text-xs">
           <p className="text-blue-400">--- SYSTEM ROUTING ---</p>
           <p className="text-slate-300">CARTERA: {id}</p>
        </div>
      </div>
    )
  }

  // Premium View Logic
  const { data: perfil } = await adminClient.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return <div className="p-10 text-red-500 font-bold text-center">No autorizado.</div>

  const { data: cartera, error: cError } = await adminClient.from('carteras').select('*').eq('id', id).single()
  if (cError || !cartera) return <div className="p-10 text-center text-red-500">Cartera no encontrada.</div>

  // Fetch advisors in case we need to assign one
  const { data: asesores } = await adminClient.from('perfiles').select('id, nombre_completo').eq('rol', 'asesor').eq('activo', true)

  const [resAsesor, resCuentas, resLoans] = await Promise.all([
    cartera.asesor_id ? adminClient.from('perfiles').select('nombre_completo, foto_perfil').eq('id', cartera.asesor_id).single() : Promise.resolve({ data: null }),
    adminClient.from('cuentas_financieras').select('*').eq('cartera_id', id),
    cartera.asesor_id ? adminClient.from('prestamos').select('monto, estado, id, clientes!inner(asesor_id)').eq('clientes.asesor_id', cartera.asesor_id).neq('estado', 'anulado') : Promise.resolve({ data: [] })
  ])

  const responsable = resAsesor.data
  const accounts = resCuentas.data || []
  const loans = resLoans.data || []
  
  // Calculate stats
  const formatMoney = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const totalBalance = accounts.reduce((sum, acc) => sum + (parseFloat(acc.saldo) || 0), 0)
  const activeLoans = loans.filter((l: any) => l.estado === 'activo')
  const totalLent = activeLoans.reduce((sum: number, l: any) => sum + (parseFloat(l.monto) || 0), 0)

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16 max-w-7xl mx-auto px-4">
      {/* COMPACT HEADER AREA */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
             <BackButton />
             <div className="flex items-center gap-2">
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[8px] font-black uppercase tracking-wider py-0">
                   ADMIN
                </Badge>
                <Link href={`/dashboard/admin/carteras/${id}?mode=tech`} className="text-[9px] text-slate-600 hover:text-white transition-colors flex items-center gap-1">
                   <Terminal className="w-2.5 h-2.5" /> Logs
                </Link>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center">
               <Briefcase className="w-5 h-5 text-blue-400" />
            </div>
            <div>
               <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-none">
                  {cartera.nombre}
               </h1>
               <p className="text-slate-500 text-xs mt-0.5">
                  ID: <span className="font-mono bg-slate-900 px-1 py-0.5 rounded border border-slate-800 text-slate-400">{id.slice(0, 12)}...</span>
               </p>
            </div>
          </div>
        </div>

        {/* Responsible Person Widget (Dynamic) */}
        <div className="flex items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/60 backdrop-blur-xl min-w-[300px]">
           <div className="h-10 w-10 rounded-full border border-blue-500/20 p-0.5 shrink-0">
              {id === '00000000-0000-0000-0000-000000000000' ? (
                  <div className="h-full w-full rounded-full bg-blue-500/10 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
              ) : responsable?.foto_perfil ? (
                  <img src={responsable.foto_perfil} className="w-full h-full rounded-full object-cover" />
              ) : (
                  <div className="h-full w-full rounded-full bg-slate-800 flex items-center justify-center">
                    <Users className="w-5 h-5 text-slate-500" />
                  </div>
              )}
           </div>
           <div className="flex-1">
              <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.1em] leading-none mb-1">Responsable Cartera</p>
              {id === '00000000-0000-0000-0000-000000000000' ? ( <h3 className="text-sm font-bold text-blue-400 leading-tight uppercase">Control Administrativo</h3> ) : cartera.asesor_id ? (
                 <h3 className="text-sm font-bold text-white leading-tight capitalize">{responsable?.nombre_completo}</h3>
              ) : (
                 <div className="space-y-1">
                    <span className="text-xs font-bold text-rose-500 flex items-center gap-1">
                       <AlertCircle className="w-3 h-3" /> Sin Asesor Asignado
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
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Balance Card */}
            <Card className="bg-slate-950 border-slate-800 relative overflow-hidden group">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                           <Wallet className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Efectivo Disponible</span>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-medium text-slate-600">S/</span>
                            <h2 className="text-4xl font-black text-white tracking-tighter">
                               {formatMoney(totalBalance)}
                            </h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-1 font-medium">{accounts.length} Cuentas vinculadas</p>
                    </div>
                </CardContent>
            </Card>

            {/* In The Street Card */}
            <Card className="bg-slate-950 border-slate-800 relative overflow-hidden group">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                           <Activity className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Capital en Calle</span>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-medium text-slate-600">S/</span>
                            <h2 className="text-4xl font-black text-emerald-400 tracking-tighter">
                               {formatMoney(totalLent)}
                            </h2>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-1 font-medium">
                           {id === '00000000-0000-0000-0000-000000000000' ? 'Administración Central' : 
                            cartera.asesor_id ? `${activeLoans.length} Préstamos activos` : 'Requiere asignar asesor'}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* History Action Row */}
            <Card className="md:col-span-2 bg-gradient-to-r from-blue-900/5 to-indigo-900/5 border-blue-500/10 p-1.5 rounded-xl overflow-hidden">
                <div className="bg-slate-900/60 backdrop-blur-md rounded-lg p-4 flex items-center justify-between gap-4 border border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                           <History className="w-4 h-4" />
                        </div>
                        <div>
                           <h3 className="text-sm font-bold text-white leading-none">Gestión Financiera</h3>
                           <p className="text-[10px] text-slate-500 mt-1">Auditoría completa de movimientos de caja.</p>
                        </div>
                    </div>
                    <Button asChild size="sm" className="h-9 px-6 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-lg shadow-lg shadow-blue-900/20 group">
                        <Link href={`/dashboard/admin/carteras/${id}/movimientos`}>
                           HISTORIAL
                           <ArrowRightCircle className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </Button>
                </div>
            </Card>
        </div>

        {/* Status Center */}
        <div className="lg:col-span-4 flex flex-col gap-4">
            <Card className="bg-slate-950 border-slate-800 flex-1 overflow-hidden">
                <CardContent className="p-5 space-y-5">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Integración</h3>
                        <Badge className="bg-blue-600/10 text-blue-400 border-none px-1.5 py-0 text-[8px] font-bold">READY</Badge>
                    </div>

                    <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-slate-900/30 border border-slate-800/50">
                            <div className="flex justify-between text-[9px] font-black text-slate-600 uppercase mb-2">
                                <span>Salud Financiera</span>
                                <span className="text-blue-500">100%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                <div className="bg-blue-500 h-full w-full rounded-full" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                             <div className="p-3 rounded-lg bg-slate-900/20 border border-slate-800/40 text-center">
                                 <p className="text-[8px] text-slate-600 font-black uppercase mb-0.5">Cuentas</p>
                                 <p className="text-lg font-black text-white leading-none">{accounts.length}</p>
                             </div>
                             <div className="p-3 rounded-lg bg-slate-900/20 border border-slate-800/40 text-center">
                                 <p className="text-[8px] text-slate-600 font-black uppercase mb-0.5">Cartera Activa</p>
                                 <p className="text-lg font-black text-emerald-400 leading-none">{activeLoans.length}</p>
                             </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>

      {/* ACCOUNTS AREA */}
      <div className="space-y-4 pt-4">
        <div className="flex items-end justify-between px-1">
            <div className="flex items-center gap-2">
               <PiggyBank className="w-5 h-5 text-blue-400" />
               <h2 className="text-lg font-black text-white tracking-tight leading-none uppercase">Cuentas de Cartera</h2>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-600">
               <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> BANCO</span>
               <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> EFECTIVO</span>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {accounts.map(acc => (
                <Link key={acc.id} href={`/dashboard/admin/carteras/${id}/movimientos?cuenta=${acc.id}`} className="group outline-none">
                    <Card className="bg-slate-950 border-slate-800/60 hover:border-blue-500/40 hover:bg-slate-900/40 transition-all duration-300 h-full">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <Badge className={cn(
                                    "px-1.5 py-0 border-none font-black text-[7px] tracking-wider uppercase",
                                    acc.tipo.toLowerCase() === 'banco' ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                                )}>
                                    {acc.tipo}
                                </Badge>
                                <div className="p-1.5 bg-slate-900 rounded-lg border border-slate-800 group-hover:bg-blue-500/10 transition-colors">
                                    <DollarSign className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />
                                </div>
                            </div>
                            
                            <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors uppercase truncate mb-1">
                               {acc.nombre}
                            </h3>
                            
                            <div className="flex items-baseline gap-1 mt-3">
                               <span className="text-xs font-medium text-slate-600">S/</span>
                               <span className="text-2xl font-black text-white font-mono tracking-tighter">
                                 {formatMoney(parseFloat(acc.saldo))}
                               </span>
                            </div>

                            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                <span className="text-[8px] font-black text-slate-600 group-hover:text-blue-500 uppercase tracking-widest transition-colors">Auditar</span>
                                <ChevronRight className="w-3 h-3 text-slate-700 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
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
