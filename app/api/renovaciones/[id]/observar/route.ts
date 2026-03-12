import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

// PATCH - Observar/devolver solicitud de renovación (Supervisor)
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

        // Verificar rol (SOLO supervisor puede observar/devolver)
        // El admin no necesita devolver, simplemente rechaza si no está de acuerdo
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'supervisor') {
            return NextResponse.json({ error: 'Solo supervisores pueden enviar observaciones' }, { status: 403 })
        }

        // Verificar solicitud
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .select('*, asesor:asesor_id(id, nombre_completo)')
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        if (solicitud.estado_solicitud !== 'pendiente_supervision') {
            return NextResponse.json({ 
                error: `No se puede observar una solicitud en estado "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        const body = await request.json()
        const { observacion } = body

        if (!observacion || observacion.trim() === '') {
            return NextResponse.json({ error: 'Debe proporcionar una observación' }, { status: 400 })
        }

        // Actualizar solicitud
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .update({
                estado_solicitud: 'en_correccion',
                supervisor_id: user.id,
                observacion_supervisor: observacion
            })
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating solicitud:', updateError)
            return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        // Notificar al asesor
        await createFullNotification(solicitud.asesor_id, {
            titulo: '⚠️ Renovación con Observaciones',
            mensaje: `Tu solicitud de renovación requiere correcciones: ${observacion.substring(0, 50)}...`,
            link: `/dashboard/renovaciones/${id}`,
            tipo: 'warning'
        })

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'observar_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: { observacion }
        })

        revalidatePath('/dashboard/renovaciones', 'page')

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
