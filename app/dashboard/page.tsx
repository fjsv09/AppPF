import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { Users, Banknote, ArrowRight, TrendingUp, Receipt, Clock, Wallet, Award } from 'lucide-react'
import Link from 'next/link'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { SupervisorEfficiency } from '@/components/dashboard/supervisor-efficiency'
import { OperationsHub } from '@/components/dashboard/operations-hub'
import { AdvisorHub } from '@/components/dashboard/advisor-hub'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'
import { checkSystemAccess } from '@/utils/systemRestrictions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Inicio'
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('nombre_completo, rol')
        .eq('id', user?.id)
        .single()

    const isAdmin = perfil?.rol === 'admin'
    const isAsesor = perfil?.rol === 'asesor'
    const isSupervisor = perfil?.rol === 'supervisor'
    
    // 4.5. Bloqueos de Asesor
    let blockInfo = null;
    let accessInfo = null;
    if (isAsesor && user) {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id);
        accessInfo = await checkSystemAccess(supabaseAdmin, user.id, perfil?.rol, 'solicitud');
    }

    // 5. Configuración de consultas por rol
    let clientQuery = supabaseAdmin.from('clientes').select('*', { count: 'exact', head: true })
    let loanQuery = supabaseAdmin.from('prestamos').select('monto').eq('estado', 'activo')

    if (isAsesor) {
        clientQuery = clientQuery.eq('asesor_id', user?.id)
        
        // Un asesor ve el volumen de sus clientes
        const { data: clAsesor } = await supabaseAdmin.from('clientes').select('id').eq('asesor_id', user?.id)
        const clIds = clAsesor?.map(c => c.id) || []
        loanQuery = loanQuery.in('cliente_id', clIds)
    } else if (isSupervisor) {
        // Un supervisor ve el volumen de su equipo
        const { data: team } = await supabaseAdmin.from('perfiles').select('id').eq('supervisor_id', user?.id)
        const teamIds = [user?.id, ...(team?.map(t => t.id) || [])]
        
        clientQuery = clientQuery.in('asesor_id', teamIds)
        
        const { data: clTeam } = await supabaseAdmin.from('clientes').select('id').in('asesor_id', teamIds)
        const clIds = clTeam?.map(c => c.id) || []
        loanQuery = loanQuery.in('cliente_id', clIds)
    }

    const { count: clientCount } = await clientQuery
    const { data: activeLoans } = await loanQuery
    const activeVolume = activeLoans?.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0) || 0

    // Format money consistently
    const formatMoney = (value: number): string => {
        return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    return (
        <div className="page-container">
            <DashboardAlerts userId={user?.id || ''} blockInfo={blockInfo} accessInfo={accessInfo} />
            
            {/* Welcome Hero - Ultra Compact */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950/30 border border-white/5 shadow-xl p-4 md:p-6 mb-4">
                <div className="relative z-10">
                    <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight mb-0.5">
                        Hola, <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">{perfil?.nombre_completo?.split(' ')[0] || 'Usuario'}</span>
                    </h1>
                    <p className="text-slate-400 text-xs md:text-base">
                        {isAdmin ? 'Panel administrativo real-time.' : 'Gestión de cartera hoy.'}
                    </p>
                </div>
            </div>


            {/* ADMIN & SUPERVISOR: Command Center */}
            {(isAdmin || isSupervisor) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4 duration-700">
                    <div className="lg:col-span-2 space-y-8">
                        <OperationsHub role={perfil?.rol} />
                        {/* We could add more admin/supervisor-specific main content here */}
                    </div>
                    
                    <div className="lg:col-span-1">
                        <QuickActions rol={perfil?.rol} />
                    </div>
                </div>
            )}

            {/* ASESOR: Command Center Reimagined */}
            {perfil?.rol === 'asesor' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4 duration-700">
                    <div className="lg:col-span-2 space-y-8">
                        {!(blockInfo?.isBlocked && blockInfo?.code === 'SALDO_PENDIENTE') && <AdvisorHub />}
                    </div>
                    
                    <div className="lg:col-span-1">
                        <QuickActions rol={perfil?.rol} />
                    </div>
                </div>
            )}


        </div>
    )
}
