import { Metadata } from 'next'
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

export const metadata: Metadata = {
    title: 'Gestión de Gastos'
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function GastosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const categoryFilter = params.category as string
  const dateFilter = params.date as string
  const qFilter = params.q as string
  const registradoPorFilter = params.registrado_por as string
  const dateStartFilter = params.date_start as string
  const dateEndFilter = params.date_end as string
  const viewType = params.view as string || 'expenses' // 'expenses' o 'disbursements'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch Perfil
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userRole = (perfil?.rol || '').toLowerCase()
  const userId = user.id

  // Fetch Carteras and Advisors for filters
  let carteras: any[] = []
  let allUsers: any[] = []

  if (userRole === 'admin') {
    // Admin sees all carteras
    const { data: cartData } = await supabase.from('carteras').select('*, perfiles(nombre_completo)')
    carteras = cartData || []

    // Admin can filter by anyone who registers expenses
    const { data: userData } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .in('rol', ['admin', 'supervisor', 'asesor', 'secretaria'])
      .eq('activo', true)
      .order('nombre_completo')
    allUsers = userData || []

  } else if (userRole === 'supervisor') {
    // Supervisor sees his team's carteras
    const { data: teamData } = await supabase
      .from('perfiles')
      .select('id')
      .eq('supervisor_id', userId)
      .eq('activo', true)
    
    const teamIds = teamData?.map(t => t.id) || []
    const allowedAdvisorIds = [userId, ...teamIds]

    const { data: cartData } = await supabase
      .from('carteras')
      .select('*, perfiles(id, nombre_completo)')
      .in('asesor_id', allowedAdvisorIds)
    carteras = cartData || []
    allUsers = [{ id: perfil.id, nombre_completo: perfil.nombre_completo }]
  } else {
    // Asesor sees only his carteras
    const { data: cartData } = await supabase
      .from('carteras')
      .select('*, perfiles(nombre_completo)')
      .eq('asesor_id', userId)
    carteras = cartData || []
    allUsers = [{ id: perfil.id, nombre_completo: perfil.nombre_completo }]
  }

  const carteraIds = carteras.map(c => c.id)

  // Build the Base Query for Expenses
  let expensesQuery = supabase
    .from('movimientos_financieros')
    .select(`
      *,
      categorias_gastos (nombre),
      cuentas_financieras:cuenta_origen_id (nombre)
    `, { count: 'exact' })
    .eq('tipo', 'egreso')

  // ROLE-BASED VISIBILITY & SYSTEM EXCLUSION
  if (userRole === 'admin') {
    if (viewType === 'disbursements') {
      // Ver desembolsos de préstamos (movimientos de sistema sin categoría)
      expensesQuery = expensesQuery.is('categoria_id', null)
        .not('descripcion', 'ilike', '%cuadre%')
        .not('descripcion', 'ilike', '%liquidación%')
        .not('descripcion', 'ilike', '%nomina%')
        .not('descripcion', 'ilike', '%nómina%')
        .not('descripcion', 'ilike', '%sueldo%')
        .not('descripcion', 'ilike', '%reverso%')
    } else {
      // Ver gastos operativos normales (con categoría)
      expensesQuery = expensesQuery.not('categoria_id', 'is', null)
    }
    
    if (registradoPorFilter && registradoPorFilter !== 'all') {
      expensesQuery = expensesQuery.eq('registrado_por', registradoPorFilter)
    }
  } else {
    // Non-admins only see what they registered
    expensesQuery = expensesQuery.eq('registrado_por', userId)
  }

  // Common Filters
  if (categoryFilter && categoryFilter !== 'all') {
    expensesQuery = expensesQuery.eq('categoria_id', categoryFilter)
  }

  if (qFilter) {
    expensesQuery = expensesQuery.ilike('descripcion', `%${qFilter}%`)
  }

  if (dateStartFilter && dateEndFilter) {
    expensesQuery = expensesQuery
      .gte('created_at', `${dateStartFilter}T00:00:00`)
      .lte('created_at', `${dateEndFilter}T23:59:59`)
  } else if (dateFilter) {
    expensesQuery = expensesQuery
      .gte('created_at', `${dateFilter}T00:00:00`)
      .lte('created_at', `${dateFilter}T23:59:59`)
  }

  // Fetch Data (Limit 100 for better searching/stats)
  const { data: expenses, error: expensesError, count: totalRecords } = await expensesQuery
    .order('created_at', { ascending: false })
    .limit(100)

  // CALCULATE STATS
  const hoyPeruStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const gastadoHoy = expenses?.filter(e => e.created_at.startsWith(hoyPeruStr))
    .reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0) || 0
  
  const totalEnBusqueda = expenses?.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0) || 0

  // Fetch Cuentas & Categories for the form
  const { data: cuentas } = await supabase
    .from('cuentas_financieras')
    .select('*')
    .in('cartera_id', carteraIds)

  const { data: categorias } = await supabase
    .from('categorias_gastos')
    .select('*')
    .order('nombre')

  return (
    <ExpenseManagerClient 
        expenses={expenses || []}
        carteras={carteras || []}
        cuentas={cuentas || []}
        categorias={categorias || []}
        advisors={allUsers}
        userId={userId}
        userRole={userRole || 'asesor'}
        stats={{
            gastadoHoy,
            totalEnBusqueda,
            hasFilters: !!(categoryFilter || dateFilter || qFilter || registradoPorFilter)
        }}
    />
  )
}
