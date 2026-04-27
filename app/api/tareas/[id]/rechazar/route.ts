import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()

        if (perfil?.rol !== 'admin' && perfil?.rol !== 'supervisor') {
            return NextResponse.json({ error: 'No tienes permisos para rechazar esta evidencia' }, { status: 403 })
        }

        const body = await request.json()
        const { motivo } = body

        // Obtener la tarea
        const { data: tarea } = await supabaseAdmin
            .from('tareas_evidencia')
            .select('*, prestamo:prestamo_id(id)')
            .eq('id', id)
            .single()

        if (!tarea) {
            return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
        }

        // Actualizar tarea: poner en pendiente y borrar evidencia
        const { data: updatedTarea, error } = await supabaseAdmin
            .from('tareas_evidencia')
            .update({
                estado: 'pendiente',
                evidencia_url: null,
                completada_en: null,
                notas: motivo // Guardar el motivo del rechazo en notas
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        // Guardar auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'rechazar_tarea_evidencia',
            tabla_afectada: 'tareas_evidencia',
            registro_id: id,
            detalle: { type: tarea.tipo, prestamo_id: tarea.prestamo_id, motivo }
        })

        // Notificar al asesor
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('id, clientes(nombres)')
            .eq('id', tarea.prestamo_id)
            .single()

        const clienteNombres = (prestamoInfo?.clientes as any)?.nombres || 'Cliente'

        const targetTab = tarea.tipo.includes('auditoria') ? 'auditoria' : 'evidencia'
        
        const rejectingUserName = perfil?.nombre_completo || 'Administración'
        
        await createFullNotification(tarea.asesor_id, {
            titulo: '❌ Evidencia Rechazada',
            mensaje: `${rejectingUserName} ha rechazado la evidencia de ${clienteNombres}. Motivo: ${motivo || 'No especificado'}`,
            link: `/dashboard/tareas?tab=${targetTab}`,
            tipo: 'error'
        })

        revalidatePath('/dashboard', 'layout')
        revalidatePath(`/dashboard/prestamos/${tarea.prestamo_id}`)

        return NextResponse.json(updatedTarea)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
