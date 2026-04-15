import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import CapitalClient from './capital-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Capital y Socios | Admin',
  description: 'Gestión de inversionistas, capital de socios y valuación del negocio.'
}

export default async function CapitalPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') redirect('/dashboard')

  // Initial data fetch
  const { data: inversionistas } = await adminClient.from('inversionistas').select('*').order('created_at', { ascending: false })
  const { data: socios } = await adminClient.from('socios').select('*').order('nombre', { ascending: true })
  const { data: accounts } = await adminClient.from('cuentas_financieras').select('id, nombre, saldo, carteras(nombre)')
  const { data: transacciones } = await adminClient
    .from('transacciones_capital')
    .select(`
        *,
        cuentas_financieras(nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <CapitalClient 
        initialInversionistas={inversionistas || []}
        initialSocios={socios || []}
        accounts={accounts || []}
        initialTransacciones={transacciones || []}
    />
  )
}
