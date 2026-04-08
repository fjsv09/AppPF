import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { AttendanceTable } from '@/components/asistencia/attendance-table'

export const metadata = {
    title: 'Control de Asistencia | ProFinanzas',
    description: 'Seguimiento de puntualidad y ubicación del equipo'
}

export default async function AsistenciaPage({
    searchParams
}: {
    searchParams: { startDate?: string; endDate?: string; user_id?: string }
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const supabaseAdmin = createAdminClient()
    
    // Obtener perfil para verificar rol
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    if (!perfil) {
        return <div className="p-8 text-center text-slate-400">No se pudo cargar tu perfil.</div>
    }

    // Filtros de Rango
    const now = new Date()
    const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
    const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`
    
    const startDate = searchParams.startDate || todayStr
    const endDate = searchParams.endDate || todayStr
    const filterUser = searchParams.user_id

    // Fetch asistencia
    let query = supabaseAdmin
        .from('asistencia_personal')
        .select(`
            *,
            perfil:usuario_id (
                nombre_completo,
                rol,
                supervisor_id
            )
        `)
        .gte('fecha', startDate)
        .lte('fecha', endDate)
        .order('fecha', { ascending: false })
        .order('hora_entrada', { ascending: true })

    if (filterUser && filterUser !== 'todos') {
        query = query.eq('usuario_id', filterUser)
    }

    // --- Lógica de permisos de vista ---
    
    // Si es ASESOR: solo puede ver su propia asistencia
    if (perfil.rol === 'asesor') {
        query = query.eq('usuario_id', user.id)
    }
    // Si es SUPERVISOR: puede ver su asistencia y la de su equipo
    else if (perfil.rol === 'supervisor') {
        // Obtenemos IDs de asesores a cargo
        const { data: equipo } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user.id)
        
        const equipoIds = equipo?.map(e => e.id) || []
        query = query.in('usuario_id', [...equipoIds, user.id])
    }
    // Si es ADMIN: no hay filtros adicionales (ve todo)

    const { data: asistencias } = await query

    // Fetch usuarios para el filtro (ajustado según permisos)
    let userQuery = supabaseAdmin.from('perfiles').select('id, nombre_completo, rol')
    
    if (perfil.rol === 'asesor') {
        userQuery = userQuery.eq('id', user.id)
    } else if (perfil.rol === 'supervisor') {
        userQuery = userQuery.or(`supervisor_id.eq.${user.id},id.eq.${user.id}`)
    }
    
    const { data: usuarios } = await userQuery.order('nombre_completo')

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Control de Asistencia</h1>
                    <p className="text-sm text-slate-400">Seguimiento de puntualidad y ubicación del equipo</p>
                </div>
            </div>

            <AttendanceTable 
                initialData={asistencias || []} 
                usuarios={usuarios || []}
                currentFilters={{ startDate, endDate, user_id: filterUser }}
                userRole={perfil.rol}
            />
        </div>
    )
}
