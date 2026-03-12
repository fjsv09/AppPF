import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

// PATCH - Observar/Devolver solicitud (Supervisor)
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

        // Verificar que es supervisor o admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || !['supervisor', 'admin'].includes(perfil.rol)) {
            return NextResponse.json({ error: 'Solo supervisores pueden observar solicitudes' }, { status: 403 })
        }

        // Verificar solicitud
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes')
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

        if (!observacion) {
            return NextResponse.json({ error: 'La observación es requerida' }, { status: 400 })
        }

        // Actualizar solicitud
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes')
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
            titulo: '👀 Solicitud Observada',
            mensaje: `La solicitud por $${solicitud.monto_solicitado} tiene observaciones: ${observacion}`,
            link: `/dashboard/solicitudes/${id}`,
            tipo: 'warning'
        })

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'observar_solicitud',
            tabla_afectada: 'solicitudes',
            detalle: { solicitud_id: id, observacion }
        })

        revalidatePath('/dashboard/solicitudes', 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
