import { createClient } from '@/utils/supabase/server'
import { SolicitudForm } from '@/components/forms/solicitud-form'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams: Promise<{ cliente_id?: string }>
}

export default async function NewSolicitudPage({ searchParams }: PageProps) {
    const params = await searchParams
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
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

    // Fetch feriados (próximos 6 meses)
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
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white tracking-tight">Nueva Solicitud</h1>
            <SolicitudForm 
                clients={clients || []} 
                defaultClientId={params.cliente_id}
                feriados={feriados}
            />
        </div>
    )
}

