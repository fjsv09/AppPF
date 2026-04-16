import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// POST - Admin asigna una tarea de visita a un asesor/supervisor (se guarda en tareas_evidencia)
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    if (perfil?.rol !== 'admin') {
        return NextResponse.json({ error: 'Solo administradores pueden asignar tareas' }, { status: 403 })
    }

    const body = await request.json()
    const { prestamo_id, asignado_a, instrucciones } = body

    if (!prestamo_id || !asignado_a) {
        return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Crear la tarea en tareas_evidencia con tipo 'visita_asignada'
    const { data: tarea, error: errorTarea } = await supabaseAdmin
        .from('tareas_evidencia')
        .insert({
            prestamo_id,
            asesor_id: asignado_a,
            tipo: 'gestion_asignada', // Nombre genérico
            estado: 'pendiente',
            notas: instrucciones
        })
        .select()
        .single()

    if (errorTarea) {
        // Mensaje específico si el constraint no tiene el tipo permitido
        if (errorTarea.message.includes('tipo_check') || errorTarea.code === '23514') {
            return NextResponse.json({
                error: 'El tipo "gestion_asignada" no está permitido en la BD. Ejecuta el SQL para actualizar el constraint de tareas_evidencia.'
            }, { status: 400 })
        }
        return NextResponse.json({ error: errorTarea.message }, { status: 400 })
    }

    // Enriquecer con el perfil del asignado (sin join FK)
    const { data: asesorPerfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol')
        .eq('id', asignado_a)
        .single()

    // Obtener nombre del cliente para la notificación
    const { data: prestamoInfo } = await supabaseAdmin
        .from('prestamos')
        .select('id, clientes(nombres)')
        .eq('id', prestamo_id)
        .single()

    const clienteNombres = (prestamoInfo?.clientes as any)?.nombres || 'Cliente'

    // NOTIFICAR AL ASESOR/SUPERVISOR ASIGNADO (DB + PUSH)
    await createFullNotification(asignado_a, {
        titulo: '📋 Gestión Asignada',
        mensaje: `Se te ha asignado una gestión para ${clienteNombres}.`,
        link: `/dashboard/tareas?tab=gestiones`,
        tipo: 'warning'
    })

    // Registro de auditoría
    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'asignar_visita',
        tabla_afectada: 'tareas_evidencia',
        registro_id: tarea.id,
        detalle: { prestamo_id, asignado_a, instrucciones }
    })

    revalidatePath(`/dashboard/prestamos/${prestamo_id}`)
    revalidatePath('/dashboard/tareas')

    return NextResponse.json({ ...tarea, asesor: asesorPerfil || null })
}
