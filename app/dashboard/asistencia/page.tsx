import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { AttendanceTable } from '@/components/asistencia/attendance-table'

export default async function AsistenciaPage({
    searchParams
}: {
    searchParams: { date?: string; user_id?: string }
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

    if (perfil?.rol !== 'admin') {
        return <div className="p-8 text-center text-slate-400">No tienes permisos para ver esta página. Solo administradores pueden ver asistencias.</div>
    }

    // Filtros
    const now = new Date()
    const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
    const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`
    
    const filterDate = searchParams.date || todayStr
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
        .eq('fecha', filterDate)
        .order('hora_entrada', { ascending: true })

    if (filterUser) {
        query = query.eq('usuario_id', filterUser)
    }

    // Si es supervisor, solo ver su equipo
    if (perfil.rol === 'supervisor') {
        // Obtenemos IDs de asesores a cargo
        const { data: equipo } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user.id)
        
        const equipoIds = equipo?.map(e => e.id) || []
        query = query.in('usuario_id', [...equipoIds, user.id])
    }

    const { data: asistencias } = await query

    // Fetch todos los usuarios para el filtro (solo relevantes)
    let userQuery = supabaseAdmin.from('perfiles').select('id, nombre_completo, rol')
    if (perfil.rol === 'supervisor') {
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
                currentFilters={{ date: filterDate, user_id: filterUser }}
            />
        </div>
    )
}
