import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { Landmark, Smartphone, TrendingUp, PieChart, Briefcase, Wallet, ArrowUpRight, ArrowDownRight, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'

export default async function AdminFinanzasPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') redirect('/dashboard')

  // 1. Fetch all carteras and accounts - USING ADMIN CLIENT
  const { data: carteras } = await adminClient.from('carteras').select('*, perfiles(nombre_completo)')
  const { data: accounts } = await adminClient.from('cuentas_financieras').select('*')

  // 2. Fetch all expenses by category
  const { data: expensesRaw } = await supabase
    .from('movimientos_financieros')
    .select('monto, categorias_gastos(nombre)')
    .eq('tipo', 'egreso')

  // 3. Totals
  const totalCaja = accounts?.filter(a => a.tipo === 'caja').reduce((acc, a) => acc + parseFloat(a.saldo), 0) || 0
  const totalDigital = accounts?.filter(a => a.tipo === 'digital').reduce((acc, a) => acc + parseFloat(a.saldo), 0) || 0
  const totalCobranzas = accounts?.filter(a => a.tipo === 'cobranzas').reduce((acc, a) => acc + parseFloat(a.saldo), 0) || 0
  
  // 3.1 Fetch Total Payroll Commitment (Projected)
  const { data: totalSueldos } = await adminClient.from('perfiles').select('sueldo_base').eq('activo', true)
  const projectedPayroll = totalSueldos?.reduce((acc, s) => acc + parseFloat(s.sueldo_base || '0'), 0) || 0

  // 4. Expenses by category
  const expensesByCategory: Record<string, number> = {}
  expensesRaw?.forEach((e: any) => {
    const cat = Array.isArray(e.categorias_gastos) 
      ? e.categorias_gastos[0]?.nombre 
      : e.categorias_gastos?.nombre || 'Otros'
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + parseFloat(e.monto)
  })

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="page-title">
                Consolidado Financiero
              </h1>
              <p className="page-subtitle">Vista global de todas las carteras y flujos de efectivo.</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
            <Link href="/dashboard/admin/carteras">
                <Button variant="outline" className="bg-slate-900 border-slate-800 text-slate-300">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Bancos y Carteras
                </Button>
            </Link>
        </div>
      </div>

      {/* Main Totals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <TotalCard title="Total en Caja" amount={totalCaja} icon={<Landmark className="text-emerald-400" />} color="emerald" />
        <TotalCard title="Total Digital" amount={totalDigital} icon={<Smartphone className="text-blue-400" />} color="blue" />
        <TotalCard title="Pendiente Cobranzas" amount={totalCobranzas} icon={<Wallet className="text-amber-400" />} color="amber" />
        <TotalCard 
          title="Planilla Proyectada" 
          amount={projectedPayroll} 
          icon={<Users className="text-rose-400" />} 
          color="rose" 
          subtitle="Compromiso Mensual"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Portfolio Breakdown */}
        <Card className="lg:col-span-8 bg-slate-900/40 border-slate-800 backdrop-blur-sm overflow-hidden">
          <CardHeader className="bg-slate-800/20 border-b border-slate-800">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-400" />
                Rendimiento por Cartera
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <div className="divide-y divide-slate-800">
                {carteras?.map((c) => {
                    const cAccounts = accounts?.filter(a => a.cartera_id === c.id) || []
                    const cBalance = cAccounts.reduce((acc, a) => acc + parseFloat(a.saldo), 0)
                    return (
                        <div key={c.id} className="p-6 hover:bg-slate-800/20 transition-colors flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 uppercase">
                                    {c.nombre.charAt(0)}
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-white uppercase">{c.nombre}</p>
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Users className="w-3 h-3" />
                                        {c.perfiles?.nombre_completo}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-lg font-black ${cBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    S/ {cBalance.toFixed(2)}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Saldo Disponible</p>
                            </div>
                        </div>
                    )
                })}
             </div>
          </CardContent>
        </Card>

        {/* Expenses Breakdown */}
        <Card className="lg:col-span-4 bg-slate-900/40 border-slate-800 backdrop-blur-sm h-fit">
           <CardHeader>
             <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <PieChart className="w-5 h-5 text-rose-400" />
                Gastos por Categoría
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
              {Object.entries(expensesByCategory).sort((a,b) => b[1] - a[1]).map(([cat, amount]) => (
                  <div key={cat} className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400">{cat}</span>
                          <span className="font-bold text-white">S/ {amount.toFixed(2)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-rose-500/50" 
                            style={{ width: `${Math.min(100, (amount / Math.max(...Object.values(expensesByCategory))) * 100)}%` }}
                          />
                      </div>
                  </div>
              ))}
              {Object.keys(expensesByCategory).length === 0 && (
                  <div className="text-center py-10">
                      <p className="text-slate-600 text-sm">No hay gastos registrados aún.</p>
                  </div>
              )}
           </CardContent>
        </Card>
      </div>

    </div>
  )
}

function TotalCard({ title, amount, icon, color, subtitle }: { title: string, amount: number, icon: React.ReactNode, color: string, subtitle?: string }) {
    return (
        <Card className="bg-slate-900/60 border-slate-800 overflow-hidden relative group hover:border-blue-500/30 transition-all">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 bg-${color}-500/10 rounded-xl`}>
                        {icon}
                    </div>
                </div>
                <div className="space-y-0.5">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{title}</p>
                    {subtitle && <p className="text-[9px] text-slate-600 font-bold uppercase">{subtitle}</p>}
                </div>
                <h3 className="text-2xl font-black text-white mt-1">S/ {amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</h3>
                <div className="mt-4 flex items-center text-[10px] font-bold text-emerald-400 gap-1 opacity-60">
                    <ArrowUpRight className="w-3 h-3" />
                    ACTUALIZADO AHORA
                </div>
            </CardContent>
        </Card>
    )
}

function Button({ children, className, variant, ...props }: any) {
    const variants: Record<string, string> = {
        outline: "border border-slate-800 bg-transparent hover:bg-slate-800 text-slate-300"
    }
    return (
        <button 
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all inline-flex items-center ${variants[variant || ''] || ''} ${className || ''}`}
            {...props}
        >
            {children}
        </button>
    )
}
