import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

// PATCH - Pre-aprobar solicitud de renovación (Supervisor o Admin)
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

        // Verificar que es supervisor (SOLO supervisor puede pre-aprobar, no admin)
        // Esto evita confusión en el flujo: Asesor → Supervisor pre-aprueba → Admin aprueba final
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, nombre_completo')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'supervisor') {
            return NextResponse.json({ error: 'Solo supervisores pueden pre-aprobar solicitudes' }, { status: 403 })
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
                error: `No se puede pre-aprobar una solicitud en estado "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        const body = await request.json()
        const { observacion, aprobar_excepcion } = body

        // Si requiere excepción, validar que se apruebe explícitamente
        if (solicitud.requiere_excepcion && !aprobar_excepcion) {
            return NextResponse.json({ 
                error: 'Esta solicitud requiere aprobación de excepción. Debe confirmar aprobar_excepcion: true' 
            }, { status: 400 })
        }

        // Actualizar solicitud
        const updateData: any = {
            estado_solicitud: 'pre_aprobado',
            supervisor_id: user.id,
            fecha_preaprobacion: new Date().toISOString(),
            observacion_supervisor: observacion || null
        }

        if (solicitud.requiere_excepcion && aprobar_excepcion) {
            updateData.excepcion_aprobada_por = user.id
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .update(updateData)
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
                titulo: '🔄 Renovación Pre-Aprobada',
                mensaje: `Renovación por $${solicitud.monto_solicitado} para ${solicitud.cliente?.nombres || 'Cliente'} lista para aprobación final`,
                link: `/dashboard/renovaciones/${id}`,
                tipo: 'info'
            })
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'preprobar_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: { 
                observacion,
                excepcion_aprobada: solicitud.requiere_excepcion && aprobar_excepcion
            }
        })

        revalidatePath('/dashboard/renovaciones', 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
