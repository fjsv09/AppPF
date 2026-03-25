import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { SolicitudForm } from '@/components/forms/solicitud-form'
import { createAdminClient } from '@/utils/supabase/admin'

import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Nueva Solicitud'
}

export default async function NewSolicitudPage({ searchParams }: { searchParams: { cliente_id?: string } }) {
    const params = searchParams
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // Validar Rol (Solo asesor puede crear solicitudes)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user?.id)
        .single()
    
    if (perfil?.rol !== 'asesor') {
        return (
            <div className="page-container flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                <div className="p-4 rounded-full bg-red-500/10 text-red-500 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                </div>
                <h1 className="text-2xl font-bold text-white">Acceso Restringido</h1>
                <p className="text-slate-400 max-w-md">Solo los asesores pueden crear nuevas solicitudes y registrar prospectos.</p>
            </div>
        )
    }

    // Fetch clientes
    const { data: clients } = await supabaseAdmin
        .from('clientes')
        .select('id, nombres, dni')
        .eq('estado', 'activo')
        .order('nombres')

    // Fetch feriados (Año actual completo para cubrir simulaciones pass/future)
    const currentYear = new Date().getFullYear()
    const startOfYear = `${currentYear}-01-01`
    const nextYearEnd = `${currentYear + 1}-12-31`
    
    const { data: feriadosData } = await supabaseAdmin
        .from('feriados')
        .select('fecha')
        .gte('fecha', startOfYear)
        .lte('fecha', nextYearEnd)

    const feriados = feriadosData?.map(f => f.fecha) || []

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                             <h1 className="page-title">Nueva Solicitud</h1>
                             <p className="page-subtitle">Complete los pasos para registrar la solicitud de crédito</p>
                        </div>
                    </div>
                </div>
            </div>
            <SolicitudForm 
                clients={clients || []} 
                defaultClientId={params.cliente_id}
                feriados={feriados}
            />
        </div>
    )
}

