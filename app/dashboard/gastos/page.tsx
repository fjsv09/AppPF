import { createClient } from '@/utils/supabase/server'
import { ExpenseForm } from '@/components/finanzas/expense-form'
import { ExpenseList } from '@/components/finanzas/expense-list'
import { Receipt, Wallet } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function GastosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch Carteras for the user (or all if admin)
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  let carterasQuery = supabase.from('carteras').select('*')
  if (perfil?.rol !== 'admin') {
    carterasQuery = carterasQuery.eq('asesor_id', user.id)
  }
  const { data: carteras } = await carterasQuery

  // Fetch Cuentas for these carteras
  const carteraIds = carteras?.map(c => c.id) || []
  const { data: cuentas } = await supabase
    .from('cuentas_financieras')
    .select('*')
    .in('cartera_id', carteraIds)

  // Fetch Categories
  const { data: categorias } = await supabase
    .from('categorias_gastos')
    .select('*')
    .order('nombre')

  // Fetch Recent Expenses
  const { data: recentExpenses } = await supabase
    .from('movimientos_financieros')
    .select(`
      *,
      categorias_gastos (nombre),
      cuentas_financieras (nombre)
    `)
    .eq('tipo', 'egreso')
    .in('cartera_id', carteraIds)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BackButton />
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Receipt className="w-8 h-8 text-blue-500" />
              Gestión de Gastos
            </h1>
          </div>
          <p className="text-slate-400 text-lg ml-11">
            Registra y controla los gastos operativos de tus carteras.
          </p>
        </div>

        {/* Total Balance Card (Quick Glance) */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-xl">
           <div className="p-3 bg-emerald-500/10 rounded-xl">
              <Wallet className="w-6 h-6 text-emerald-400" />
           </div>
           <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Saldo Total Efectivo</p>
              <p className="text-2xl font-bold text-white">
                S/ {cuentas?.reduce((acc, c) => acc + (c.tipo === 'caja' ? parseFloat(c.saldo) : 0), 0).toFixed(2) || '0.00'}
              </p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Registration Form (Left) */}
        <div className="lg:col-span-4 sticky top-8">
          <ExpenseForm 
            carteras={carteras || []} 
            cuentas={cuentas || []} 
            categorias={categorias || []} 
            userId={user.id}
          />
          
          {/* Advice card */}
          <div className="mt-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2 mb-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-400" />
              Recuerda
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Todos los gastos registrados se descontarán automáticamente del saldo de la cuenta seleccionada y aparecerán en los reportes de rendimiento de la cartera.
            </p>
          </div>
        </div>

        {/* Recent Activity (Right) */}
        <div className="lg:col-span-8">
          <ExpenseList expenses={recentExpenses || []} />
        </div>
      </div>
    </div>
  )
}
