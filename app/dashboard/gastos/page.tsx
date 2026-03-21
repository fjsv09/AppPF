import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import { ExpenseForm } from '@/components/finanzas/expense-form'
import { ExpenseList } from '@/components/finanzas/expense-list'
import { ExpenseManagerClient } from '@/components/finanzas/expense-manager-client'
import { Receipt, Wallet, Plus, History } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ExpenseFilters } from '@/components/finanzas/expense-filters'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function GastosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const advisorFilter = params.advisor as string
  const categoryFilter = params.category as string
  const dateFilter = params.date as string
  const qFilter = params.q as string

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch Perfil with more metadata for debugging and role handling
  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (perfilError) {
    console.error('Error fetching profile:', perfilError)
  }

  // Fetch Advisors and Carteras based on role
  let advisors: any[] = []
  let carteras: any[] = []
  const userRole = (perfil?.rol || '').toLowerCase()

  if (userRole === 'admin') {
    // 1. Fetch all advisors
    const { data: advData } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('rol', 'asesor')
      .eq('activo', true)
      .order('nombre_completo')
    advisors = advData || []

    // 2. Fetch carteras based on filter or all
    const baseQuery = supabase.from('carteras').select('*, perfiles(nombre_completo)')
    const { data: cartData } = advisorFilter 
        ? await baseQuery.eq('asesor_id', advisorFilter)
        : await baseQuery
    carteras = cartData || []

  } else if (userRole === 'supervisor') {
    // 1. Harold Castro (Himself) + Team (Separated to avoid .or issues)
    const { data: teamData } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('supervisor_id', user.id)
      .eq('activo', true)
    
    // Combine himself with his team
    advisors = [
        { id: perfil.id, nombre_completo: perfil.nombre_completo },
        ...(teamData || [])
    ]

    const allowedAdvisorIds = advisors.length > 0 ? advisors.map(a => a.id) : [user.id]

    // 2. Fetch carteras for team members directly (no inner join required)
    const { data: cartData } = await supabase
      .from('carteras')
      .select('*, perfiles(id, nombre_completo)')
      .in('asesor_id', allowedAdvisorIds)

    carteras = cartData || []
    
    // If advisor filter is active, refine the list
    if (advisorFilter && allowedAdvisorIds.includes(advisorFilter as string)) {
      carteras = carteras.filter(c => c.asesor_id === advisorFilter)
    }

  } else {
    // Asesor: only himself
    const { data: advData } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('id', user.id)
    advisors = advData || []

    const { data: cartData } = await supabase
      .from('carteras')
      .select('*, perfiles(nombre_completo)')
      .eq('asesor_id', user.id)
    carteras = cartData || []
  }

  const carteraIds = carteras.map(c => c.id)

  // Fetch Cuentas
  const { data: cuentas } = await supabase
    .from('cuentas_financieras')
    .select('*')
    .in('cartera_id', carteraIds)

  // Fetch Categories
  const { data: categorias } = await supabase
    .from('categorias_gastos')
    .select('*')
    .order('nombre')

  // Fetch Recent Expenses (More items for better history)
  let expensesQuery = supabase
    .from('movimientos_financieros')
    .select(`
      *,
      categorias_gastos (nombre),
      cuentas_financieras:cuenta_origen_id (nombre)
    `)
    .eq('tipo', 'egreso')
    .in('cartera_id', carteraIds)
    .order('created_at', { ascending: false })

  if (categoryFilter) {
    expensesQuery = expensesQuery.eq('categoria_id', categoryFilter)
  }

  if (qFilter) {
    expensesQuery = expensesQuery.ilike('descripcion', `%${qFilter}%`)
  }

  if (dateFilter) {
    // Filter by the whole day
    expensesQuery = expensesQuery
      .gte('created_at', `${dateFilter}T00:00:00`)
      .lte('created_at', `${dateFilter}T23:59:59`)
  }

  const { data: recentExpenses, error: expensesError } = await expensesQuery.limit(50)

  if (expensesError) {
    console.error('Error fetching expenses:', expensesError)
  }

  // Debug log to console (server side)
  console.log('Expenses Page Debug:', {
    userRole,
    userId: user.id,
    carteraIds,
    count: recentExpenses?.length || 0,
    advisorFilter,
    categoryFilter,
    dateFilter,
    qFilter
  })

  return (
    <ExpenseManagerClient 
        expenses={recentExpenses || []}
        carteras={carteras || []}
        cuentas={cuentas || []}
        categorias={categorias || []}
        advisors={advisors || []}
        userId={user.id}
        userRole={userRole || 'asesor'}
        filters={
          <div className="mt-2 text-slate-400">
            <Suspense fallback={<div className="h-14 bg-slate-900/20 animate-pulse rounded-2xl" />}>
              <ExpenseFilters 
                advisors={advisors} 
                categories={categorias || []} 
                userRole={userRole || 'asesor'}
              />
            </Suspense>
          </div>
        }
    />
  )
}
