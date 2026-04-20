import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Obtener el perfil del usuario para validar el rol
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, supervisor_id')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const filterAsesorId = searchParams.get('asesorId')

        // Configuración de la consulta base
        let query = supabaseAdmin
            .from('tareas_evidencia')
            .select(`
                *,
                asesor:asesor_id(nombre_completo),
                prestamo:prestamo_id(
                    id, 
                    monto, 
                    cliente:cliente_id(nombres, foto_perfil),
                    solicitud:solicitud_id(id, motivo_prestamo)
                )
            `)
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: false })

        // RESTRICCIÓN DE ROLES Y FILTROS
        if (perfil.rol === 'asesor') {
            // Un asesor SOLO ve sus tareas, ignore el filtro externo
            query = query.eq('asesor_id', user.id)
        } else if (perfil.rol === 'supervisor') {
            // Un supervisor ve tareas de su equipo
            const { data: team } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('supervisor_id', user.id)
            
            const teamIds = (team || []).map(t => t.id)
            teamIds.push(user.id) // Incluirse a sí mismo

            if (filterAsesorId) {
                // Si filtra por un asesor, validar que pertenezca a su equipo
                if (teamIds.includes(filterAsesorId)) {
                    query = query.eq('asesor_id', filterAsesorId)
                } else {
                    // Si intenta ver a alguien fuera de su equipo, devolver vacío
                    return NextResponse.json([])
                }
            } else {
                // Si no hay filtro, mostrar todo su equipo
                query = query.in('asesor_id', teamIds)
            }
        } else if (perfil.rol === 'admin') {
            // Admin ve todo, opcionalmente filtrar por asesorId
            if (filterAsesorId && filterAsesorId !== 'todos') {
                query = query.eq('asesor_id', filterAsesorId)
            }
        }

        const { data: tareas, error } = await query

        if (error) {
            console.error('Error fetching tareas:', error)
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        return NextResponse.json(tareas)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
