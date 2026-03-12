import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

// PATCH - Corregir solicitud de renovación (Asesor)
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

        // Verificar solicitud y que pertenece al usuario
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .select('*')
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        if (solicitud.asesor_id !== user.id) {
            return NextResponse.json({ error: 'Solo el asesor puede corregir su solicitud' }, { status: 403 })
        }

        if (solicitud.estado_solicitud !== 'en_correccion') {
            return NextResponse.json({ 
                error: `No se puede corregir una solicitud en estado "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        const body = await request.json()
        const { monto_solicitado, interes, cuotas, modalidad, fecha_inicio_propuesta } = body

        // Validar que los nuevos datos estén dentro de límites
        if (monto_solicitado) {
            if (monto_solicitado > solicitud.monto_maximo_permitido) {
                return NextResponse.json({ 
                    error: `El monto solicitado excede el máximo permitido ($${solicitud.monto_maximo_permitido})` 
                }, { status: 400 })
            }
            if (monto_solicitado < solicitud.monto_minimo_permitido) {
                return NextResponse.json({ 
                    error: `El monto solicitado es menor al mínimo permitido ($${solicitud.monto_minimo_permitido})` 
                }, { status: 400 })
            }
        }

        // Actualizar solicitud
        const updateData: any = {
            estado_solicitud: 'pendiente_supervision',
            observacion_supervisor: null // Limpiar observación anterior
        }

        if (monto_solicitado) updateData.monto_solicitado = monto_solicitado
        if (interes !== undefined) updateData.interes = interes
        if (cuotas) updateData.cuotas = cuotas
        if (modalidad) updateData.modalidad = modalidad
        if (fecha_inicio_propuesta) updateData.fecha_inicio_propuesta = fecha_inicio_propuesta

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

        // Notificar al supervisor
        if (solicitud.supervisor_id) {
            await createFullNotification(solicitud.supervisor_id, {
                titulo: '🔄 Renovación Corregida',
                mensaje: `El asesor ha corregido la solicitud de renovación por $${updated.monto_solicitado}`,
                link: `/dashboard/renovaciones/${id}`,
                tipo: 'info'
            })
        } else {
            // Notificar a todos los supervisores
            const { data: supervisores } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('rol', 'supervisor')
            
            for (const sup of supervisores || []) {
                await createFullNotification(sup.id, {
                    titulo: '🔄 Renovación Corregida',
                    mensaje: `Solicitud de renovación corregida por $${updated.monto_solicitado}`,
                    link: `/dashboard/renovaciones/${id}`,
                    tipo: 'info'
                })
            }
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'corregir_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: { cambios: body }
        })

        revalidatePath('/dashboard/renovaciones', 'page')

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
