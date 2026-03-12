import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

// PATCH - Rechazar solicitud de renovación (Admin)
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

        // Verificar que es admin o supervisor
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, nombre_completo')
            .eq('id', user.id)
            .single()
    
        if (!perfil || !['admin', 'supervisor'].includes(perfil.rol)) {
            return NextResponse.json({ error: 'No tienes permisos para rechazar renovaciones' }, { status: 403 })
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
    
        if (!['pendiente_supervision', 'pre_aprobado'].includes(solicitud.estado_solicitud)) {
            return NextResponse.json({ 
                error: `No se puede rechazar una solicitud en estado "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }
    
        const body = await request.json()
        const { motivo } = body
    
        if (!motivo || motivo.trim() === '') {
            return NextResponse.json({ error: 'Debe proporcionar un motivo de rechazo' }, { status: 400 })
        }
    
        // Actualizar solicitud
        const updateData: any = {
            estado_solicitud: 'rechazado',
            fecha_aprobacion: new Date().toISOString(),
            motivo_rechazo: motivo,
            updated_at: new Date().toISOString()
        }
    
        if (perfil.rol === 'admin') {
            updateData.admin_id = user.id
        } else {
            updateData.supervisor_id = user.id
            updateData.observacion_supervisor = motivo
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
    
        // Notificar al asesor
        await createFullNotification(solicitud.asesor_id, {
            titulo: '❌ Renovación Rechazada',
            mensaje: `La solicitud de renovación por $${solicitud.monto_solicitado} fue rechazada por ${perfil.rol}: ${motivo.substring(0, 50)}...`,
            link: `/dashboard/renovaciones/${id}`,
            tipo: 'error'
        })
    
        // Si el que rechaza es el supervisor, notificar a los admins
        if (perfil.rol === 'supervisor') {
            const { data: admins } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('rol', 'admin')
            
            if (admins) {
                for (const admin of admins) {
                    await createFullNotification(admin.id, {
                        titulo: '⚠️ Renovación Rechazada por Supervisor',
                        mensaje: `${perfil.nombre_completo} rechazó la renovación de ${solicitud.asesor.nombre_completo}: ${motivo.substring(0, 50)}...`,
                        link: `/dashboard/solicitudes`,
                        tipo: 'warning'
                    })
                }
            }
        }
    
        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'rechazar_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: { motivo, monto: solicitud.monto_solicitado, rol: perfil.rol }
        })

        revalidatePath('/dashboard/renovaciones', 'page')

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
