import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// PATCH - Editar datos de solicitud de renovación (Solo Admin)
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

        // Verificar que es admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden editar solicitudes de renovación' }, { status: 403 })
        }

        // Verificar solicitud
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .select('*')
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        // Solo se puede editar si está en estado pre_aprobado o pendiente_supervision
        if (!['pre_aprobado', 'pendiente_supervision'].includes(solicitud.estado_solicitud)) {
            return NextResponse.json({ 
                error: `No se puede editar una solicitud en estado "${solicitud.estado_solicitud}". Solo se puede editar en estado pre_aprobado o pendiente_supervision` 
            }, { status: 400 })
        }

        const body = await request.json()
        const { 
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            motivo_modificacion
        } = body

        // Validar campos requeridos
        if (!monto_solicitado || !interes || !cuotas || !modalidad || !fecha_inicio_propuesta) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
        }

        // Validar que el monto esté dentro de límites razonables (opcional pero recomendado)
        if (monto_solicitado <= 0) {
            return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
        }

        if (interes < 0 || interes > 100) {
            return NextResponse.json({ error: 'El interés debe estar entre 0 y 100' }, { status: 400 })
        }

        if (cuotas <= 0) {
            return NextResponse.json({ error: 'Las cuotas deben ser mayor a 0' }, { status: 400 })
        }

        // Actualizar solicitud
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .update({
                monto_solicitado,
                interes,
                cuotas,
                modalidad,
                fecha_inicio_propuesta,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating solicitud:', updateError)
            return NextResponse.json({ error: updateError.message }, { status: 400 })
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'editar_solicitud_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: { 
                cambios: {
                    monto_anterior: solicitud.monto_solicitado,
                    monto_nuevo: monto_solicitado,
                    interes_anterior: solicitud.interes,
                    interes_nuevo: interes,
                    cuotas_anterior: solicitud.cuotas,
                    cuotas_nuevo: cuotas,
                    modalidad_anterior: solicitud.modalidad,
                    modalidad_nuevo: modalidad
                },
                motivo: motivo_modificacion || 'Sin motivo especificado'
            }
        })

        // Notificar al asesor sobre la modificación
        await createFullNotification(solicitud.asesor_id, {
            titulo: '✏️ Solicitud Modificada por Admin',
            mensaje: `Tu solicitud de renovación ha sido modificada. Nuevo monto: $${monto_solicitado}`,
            link: `/dashboard/renovaciones/${id}`,
            tipo: 'info'
        })

        revalidatePath('/dashboard/renovaciones', 'page')
        revalidatePath(`/dashboard/renovaciones/${id}`, 'page')

        return NextResponse.json({
            message: 'Solicitud actualizada correctamente',
            solicitud: updated
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
