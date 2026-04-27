import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// PATCH - Corregir solicitud y reenviar (solo Asesor dueño)
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

        // Verificar solicitud y que el usuario sea el asesor dueño
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes')
            .select('*, asesor:asesor_id(id, nombre_completo), cliente:cliente_id(nombres)')
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        if (solicitud.asesor_id !== user.id) {
            return NextResponse.json({ error: 'Solo el asesor dueño puede corregir esta solicitud' }, { status: 403 })
        }

        if (solicitud.estado_solicitud !== 'en_correccion') {
            return NextResponse.json({ 
                error: 'Solo se pueden corregir solicitudes en estado "En Corrección"' 
            }, { status: 400 })
        }

        const body = await request.json()
        const { 
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            prospecto_nombres,
            prospecto_dni,
            prospecto_telefono,
            prospecto_direccion,
            prospecto_referencia,
            prospecto_ocupacion
        } = body

        // Validar datos del préstamo
        if (!monto_solicitado || !interes || !cuotas || !modalidad || !fecha_inicio_propuesta) {
            return NextResponse.json({ error: 'Faltan campos del préstamo' }, { status: 400 })
        }

        const {
            giro_negocio,
            fuentes_ingresos,
            ingresos_mensuales,
            motivo_prestamo,
            gps_coordenadas,
            documentos_evaluacion
        } = body

        // Preparar datos de actualización
        const updateData: any = {
            // Datos del préstamo
            monto_solicitado,
            interes,
            cuotas,
            modalidad,
            fecha_inicio_propuesta,

            // Datos de evaluación financiera
            giro_negocio,
            fuentes_ingresos,
            ingresos_mensuales,
            motivo_prestamo,
            gps_coordenadas,
            documentos_evaluacion,

            // Estado
            estado_solicitud: 'pendiente_supervision', // Vuelve a supervisión
            observacion_supervisor: null, // Limpiar observación anterior
            updated_at: new Date().toISOString()
        }

        // Si tiene datos de prospecto, actualizarlos también
        if (prospecto_nombres) updateData.prospecto_nombres = prospecto_nombres
        if (prospecto_dni) updateData.prospecto_dni = prospecto_dni
        if (prospecto_telefono) updateData.prospecto_telefono = prospecto_telefono
        if (prospecto_direccion !== undefined) updateData.prospecto_direccion = prospecto_direccion
        if (prospecto_referencia !== undefined) updateData.prospecto_referencia = prospecto_referencia
        if (prospecto_ocupacion !== undefined) updateData.prospecto_ocupacion = prospecto_ocupacion

        // Actualizar solicitud
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

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('supervisor_id')
            .eq('id', user.id)
            .single()

        const advisorName = solicitud.asesor?.nombre_completo || 'Un asesor'
        const clienteNombres = (solicitud.cliente as any)?.nombres || 'Cliente'

        if (perfil?.supervisor_id) {
            await createFullNotification(perfil.supervisor_id, {
                titulo: '📝 Solicitud Corregida',
                mensaje: `${advisorName} ha corregido la solicitud de ${clienteNombres}.`,
                link: `/dashboard/solicitudes/${id}`,
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
                    titulo: '📝 Solicitud Corregida',
                    mensaje: `${advisorName} corrigió la solicitud de ${clienteNombres}. Lista para revisión.`,
                    link: `/dashboard/solicitudes/${id}`,
                    tipo: 'info'
                })
            }
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'corregir_solicitud',
            tabla_afectada: 'solicitudes',
            detalle: { solicitud_id: id, monto: monto_solicitado }
        })

        revalidatePath('/dashboard/solicitudes', 'page')
        revalidatePath(`/dashboard/solicitudes/${id}`, 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json({
            solicitud: updated,
            message: 'Solicitud corregida y reenviada a supervisión'
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
