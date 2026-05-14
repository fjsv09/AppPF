import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// PATCH - Reabrir solicitud rechazada (solo Admin)
// Excepción administrativa: el admin puede rescatar un rechazo y devolvérselo al asesor para corrección.
// El asesor recibe notificación y puede editar y reenviar al flujo normal de aprobación.
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

        // Solo el admin puede reabrir rechazos
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, nombre_completo')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo el administrador puede reabrir solicitudes rechazadas' }, { status: 403 })
        }

        // Verificar solicitud
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes')
            .select('*, asesor:asesor_id(id, nombre_completo), cliente:cliente_id(nombres)')
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        // Solo se pueden reabrir solicitudes rechazadas
        if (solicitud.estado_solicitud !== 'rechazado') {
            return NextResponse.json({
                error: `Solo se pueden reabrir solicitudes en estado "Rechazado". Estado actual: "${solicitud.estado_solicitud}"`
            }, { status: 400 })
        }

        const body = await request.json()
        const { observacion } = body

        if (!observacion || observacion.trim().length < 5) {
            return NextResponse.json({ error: 'Debe escribir una observación para el asesor (mínimo 5 caracteres)' }, { status: 400 })
        }

        const adminNombre = perfil.nombre_completo || 'Administrador'
        const mensajeObservacion = `[Revisión Admin - ${adminNombre}]: ${observacion.trim()}`

        // Reabrir: pasar a en_correccion con observación del admin
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes')
            .update({
                estado_solicitud: 'en_correccion',
                observacion_supervisor: mensajeObservacion,
                motivo_rechazo: null,          // Limpiar el motivo de rechazo anterior
                admin_id: user.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Error reabriendo solicitud:', updateError)
            return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        // Notificar al asesor
        const clienteNombres = (solicitud.cliente as any)?.nombres || 'Cliente'
        await createFullNotification(solicitud.asesor_id, {
            titulo: '🔄 Solicitud Reabierta por Admin',
            mensaje: `El administrador reabrió la solicitud de ${clienteNombres} para que puedas corregirla: ${observacion.trim()}`,
            link: `/dashboard/solicitudes/${id}`,
            tipo: 'warning'
        })

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'reabrir_solicitud',
            tabla_afectada: 'solicitudes',
            detalle: {
                solicitud_id: id,
                observacion: observacion.trim(),
                motivo_rechazo_anterior: solicitud.motivo_rechazo
            }
        })

        revalidatePath('/dashboard/solicitudes', 'page')
        revalidatePath(`/dashboard/solicitudes/${id}`, 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json({
            solicitud: updated,
            message: 'Solicitud reabierta. El asesor ha sido notificado para que realice las correcciones.'
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
