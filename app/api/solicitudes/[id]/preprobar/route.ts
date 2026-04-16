import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// PATCH - Pre-aprobar solicitud (solo Supervisor)
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
            .select('id, rol, nombre_completo')
            .eq('id', user.id)
            .single()

        if (!perfil || !['supervisor', 'admin'].includes(perfil.rol)) {
            return NextResponse.json({ error: 'Solo supervisores pueden pre-aprobar' }, { status: 403 })
        }

        // Verificar que la solicitud existe y está en estado correcto
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
                error: `No se puede pre-aprobar una solicitud en estado "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        const body = await request.json()
        const { observacion } = body

        // Actualizar solicitud
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes')
            .update({
                estado_solicitud: 'pre_aprobado',
                supervisor_id: user.id,
                fecha_preaprobacion: new Date().toISOString(),
                observacion_supervisor: observacion || null
            })
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating solicitud:', updateError)
            return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        // Notificar a todos los admins
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')

        for (const admin of admins || []) {
            await createFullNotification(admin.id, {
                titulo: 'Solicitud Pre-Aprobada',
                mensaje: `Solicitud por $${solicitud.monto_solicitado} lista para aprobación final`,
                link: `/dashboard/solicitudes/${id}`,
                tipo: 'info'
            })
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'preprobar_solicitud',
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
