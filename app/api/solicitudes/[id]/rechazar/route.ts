import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// PATCH - Rechazar solicitud (Supervisor o Admin)
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

        // Verificar rol
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || !['supervisor', 'admin'].includes(perfil.rol)) {
            return NextResponse.json({ error: 'No autorizado para rechazar solicitudes' }, { status: 403 })
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

        // Solo se pueden rechazar solicitudes pendientes o pre-aprobadas
        if (!['pendiente_supervision', 'pre_aprobado'].includes(solicitud.estado_solicitud)) {
            return NextResponse.json({ 
                error: `No se puede rechazar una solicitud en estado "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        const body = await request.json()
        const { motivo } = body

        if (!motivo) {
            return NextResponse.json({ error: 'El motivo de rechazo es requerido' }, { status: 400 })
        }

        // Actualizar solicitud
        const updateData: any = {
            estado_solicitud: 'rechazado',
            motivo_rechazo: motivo
        }

        // Registrar quién rechazó según el rol
        if (perfil.rol === 'supervisor') {
            updateData.supervisor_id = user.id
        } else {
            updateData.admin_id = user.id
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating solicitud:', updateError)
            return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        // Notificar al asesor
        await createFullNotification(solicitud.asesor_id, {
            titulo: '❌ Solicitud Rechazada',
            mensaje: `La solicitud por $${solicitud.monto_solicitado} ha sido rechazada: ${motivo}`,
            link: `/dashboard/solicitudes/${id}`,
            tipo: 'error'
        })

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'rechazar_solicitud',
            tabla_afectada: 'solicitudes',
            detalle: { solicitud_id: id, motivo }
        })

        revalidatePath('/dashboard/solicitudes', 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
