import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// PATCH - Actualizar estado de una tarea (para visitas_asignadas completadas sin evidencia_url)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    const body = await request.json()
    const { estado } = body

    if (!estado) return NextResponse.json({ error: 'Estado requerido' }, { status: 400 })

    // Verificar que la tarea existe y pertenece al usuario (o es admin)
    const { data: tarea } = await supabaseAdmin
        .from('tareas_evidencia')
        .select('id, asesor_id, prestamo_id, tipo')
        .eq('id', id)
        .single()

    if (!tarea) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

    // Solo el asignado o un admin puede actualizarla
    if (tarea.asesor_id !== user.id && perfil?.rol !== 'admin') {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
        .from('tareas_evidencia')
        .update({
            estado,
            completada_en: estado === 'completada' ? new Date().toISOString() : null
        })
        .eq('id', id)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (estado === 'completada') {
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('id, clientes(nombres)')
            .eq('id', tarea.prestamo_id)
            .single()

        const { data: usuarioPerfil } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo')
            .eq('id', user.id)
            .single()

        const clienteNombres = (prestamoInfo?.clientes as any)?.nombres || 'Cliente'
        const asesorNombre = usuarioPerfil?.nombre_completo || 'Asesor'

        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')

        if (admins) {
            for (const admin of admins) {
                if (admin.id === user.id) continue
                await createFullNotification(admin.id, {
                    titulo: '✅ Gestión Completada',
                    mensaje: `${asesorNombre} completó la gestión para ${clienteNombres}.`,
                    link: `/dashboard/prestamos/${tarea.prestamo_id}?tab=gestiones`,
                    tipo: 'success'
                })
            }
        }

        // 2. NOTIFICAR AL SUPERVISOR DEL ASESOR
        const { data: asesorInfo } = await supabaseAdmin
            .from('perfiles')
            .select('supervisor_id')
            .eq('id', tarea.asesor_id)
            .single()

        if (asesorInfo?.supervisor_id && asesorInfo.supervisor_id !== user.id) {
            await createFullNotification(asesorInfo.supervisor_id, {
                titulo: '✅ Gestión Completada',
                mensaje: `${asesorNombre} completó la gestión para ${clienteNombres}.`,
                link: `/dashboard/prestamos/${tarea.prestamo_id}?tab=gestiones`,
                tipo: 'success'
            })
        }
    }

    revalidatePath('/dashboard/tareas')
    revalidatePath(`/dashboard/prestamos/${tarea.prestamo_id}`)

    return NextResponse.json(data)
}
