import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

// PATCH - Completar tarea con evidencia
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

        const body = await request.json()
        const { evidencia_url, resultado_auditoria, puntuacion_auditoria } = body

        if (!evidencia_url) {
            return NextResponse.json({ error: 'La URL de la evidencia es requerida' }, { status: 400 })
        }

        // Obtener la tarea para verificar si pertenece al usuario o es admin/super admin
        const { data: tarea } = await supabaseAdmin
            .from('tareas_evidencia')
            .select('*, prestamo:prestamo_id(id)')
            .eq('id', id)
            .single()

        if (!tarea) {
            return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
        }

        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()

        if (tarea.asesor_id !== user.id) {
             if (perfil?.rol !== 'admin' && perfil?.rol !== 'supervisor') {
                 return NextResponse.json({ error: 'No tienes permisos para completar esta tarea' }, { status: 403 })
             }
        }

        // Actualizar tarea
        const { data: updatedTarea, error } = await supabaseAdmin
            .from('tareas_evidencia')
            .update({
                estado: 'completada',
                evidencia_url: evidencia_url,
                completada_en: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Error updating tarea:', error)
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        // Si es una auditoría dirigida o se pasa el resultado_auditoria, creamos un registro en la nueva tabla 'gestiones'
        if ((tarea.tipo === 'auditoria_dirigida' || tarea.tipo === 'auditoria') && resultado_auditoria !== undefined) {
            const gestionResult = puntuacion_auditoria === 100 ? 'Confirmado OK' : 'Alerta Reportada'
            
            await supabaseAdmin.from('gestiones').insert({
                prestamo_id: tarea.prestamo_id,
                usuario_id: user.id,
                tipo_gestion: 'Auditoria',
                resultado: gestionResult,
                notas: resultado_auditoria,
                privado_supervisor: true // Privado por defecto para auditorías
            })
        }

        // Guardar evidencia en la tabla de auditoría global del sistema
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'completar_tarea_evidencia',
            tabla_afectada: 'tareas_evidencia',
            registro_id: id,
            detalle: { type: tarea.tipo, prestamo_id: tarea.prestamo_id }
        })

        // NOTIFICAR A TODOS LOS ADMINS SOBRE LA COMPLETITUD
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('id, clientes(nombres)')
            .eq('id', tarea.prestamo_id)
            .single()

        const { data: usuarioPerfil } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo')
            .eq('id', user.id)
            .single()

        const clienteNombres = (prestamoInfo?.clientes as any)?.nombres || 'Cliente'
        const asesorNombre = usuarioPerfil?.nombre_completo || 'Asesor'

        // DEFINIR CONTENIDO DE NOTIFICACIÓN SEGÚN TIPO
        const isAudit = tarea.tipo === 'auditoria_dirigida' || tarea.tipo === 'auditoria';
        const notificationTitle = isAudit ? '🛡️ Auditoría Completada' : '📸 Evidencia Subida';
        const notificationMessage = isAudit 
            ? `${asesorNombre} ha completado la auditoría para ${clienteNombres}.`
            : `${asesorNombre} ha subido la evidencia para ${clienteNombres}.`;
        const notificationLink = isAudit 
            ? `/dashboard/prestamos/${tarea.prestamo_id}?tab=gestiones`
            : `/dashboard/prestamos/${tarea.prestamo_id}?tab=evidencia`;

        // 1. NOTIFICAR A ADMINS
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')

        if (admins) {
            for (const admin of admins) {
                if (admin.id === user.id) continue

                await createFullNotification(admin.id, {
                    titulo: notificationTitle,
                    mensaje: notificationMessage,
                    link: notificationLink,
                    tipo: 'success'
                })
            }
        }

        // 2. NOTIFICAR AL SUPERVISOR DEL ASESOR (si existe y no es el mismo que completa)
        const { data: asesorInfo } = await supabaseAdmin
            .from('perfiles')
            .select('supervisor_id')
            .eq('id', tarea.asesor_id)
            .single()

        if (asesorInfo?.supervisor_id && asesorInfo.supervisor_id !== user.id) {
            await createFullNotification(asesorInfo.supervisor_id, {
                titulo: notificationTitle,
                mensaje: notificationMessage,
                link: notificationLink,
                tipo: 'success'
            })
        }

        revalidatePath('/dashboard', 'layout')
        revalidatePath(`/dashboard/prestamos/${tarea.prestamo_id}`)

        return NextResponse.json(updatedTarea)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
