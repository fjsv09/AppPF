import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// GET - Obtener gestiones de un préstamo
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const prestamo_id = searchParams.get('prestamo_id')

    if (!prestamo_id) {
        return NextResponse.json({ error: 'prestamo_id requerido' }, { status: 400 })
    }

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    // Query base: todas las gestiones del préstamo (sin join FK)
    let query = supabaseAdmin
        .from('gestiones')
        .select('*')
        .eq('prestamo_id', prestamo_id)
        .order('created_at', { ascending: false })

    // Si es asesor, solo ver las gestiones NO privadas
    if (perfil?.rol === 'asesor') {
        query = query.eq('privado_supervisor', false)
    }

    const { data: gestiones, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (!gestiones || gestiones.length === 0) return NextResponse.json([])

    // Enriquecer con datos del usuario (query separada porque no hay FK declarada)
    const usuarioIds = [...new Set(gestiones.map((g: any) => g.usuario_id).filter(Boolean))]
    const { data: perfiles } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol')
        .in('id', usuarioIds)

    const perfilesMap = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p]))

    const enriched = gestiones.map((g: any) => ({
        ...g,
        usuario: perfilesMap[g.usuario_id] || null
    }))

    return NextResponse.json(enriched)
}

// POST - Crear nueva gestión
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

    const body = await request.json()
    const { prestamo_id, tipo_gestion, resultado, notas, coordenadas, silencioso } = body

    if (!prestamo_id || !tipo_gestion || !resultado) {
        return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Los asesores no pueden crear gestiones privadas
    // Solo supervisores y admins pueden crear gestiones de Auditoria
    if (tipo_gestion === 'Auditoria' && perfil?.rol === 'asesor') {
        return NextResponse.json({ error: 'Sin permisos para crear auditorías' }, { status: 403 })
    }

    // Las gestiones del asesor son públicas; las de supervisor/admin de tipo auditoria son privadas
    const privado = tipo_gestion === 'Auditoria' ? true : false
    // Solo Visita requiere coordenadas
    const coordenadasGuardar = tipo_gestion === 'Visita' && coordenadas ? coordenadas : null

    const { data, error } = await supabaseAdmin
        .from('gestiones')
        .insert({
            prestamo_id,
            usuario_id: user.id,
            tipo_gestion,
            resultado,
            notas: notas || null,
            privado_supervisor: privado,
            coordenadas: coordenadasGuardar
        })
        .select('*')
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Enriquecer con datos del usuario
    const { data: usuarioPerfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol')
        .eq('id', user.id)
        .single()

    // NOTIFICAR A ADMINS (Solo si no es silencioso)
    if (!silencioso) {
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('id, clientes(nombres)')
            .eq('id', prestamo_id)
            .single()

        const clienteNombres = (prestamoInfo?.clientes as any)?.nombres || 'Cliente'
        const creadorNombre = usuarioPerfil?.nombre_completo || 'Asesor/Admin'

        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')

        if (admins) {
            for (const admin of admins) {
                // Evitar notificarse a uno mismo
                if (admin.id === user.id) continue

                await createFullNotification(admin.id, {
                    titulo: '📝 Nueva Gestión',
                    mensaje: `${creadorNombre} registró una ${tipo_gestion} para ${clienteNombres}.`,
                    link: `/dashboard/prestamos/${prestamo_id}?tab=gestiones`,
                    tipo: 'info'
                })
            }
        }
    }

    // Audit log
    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'crear_gestion',
        tabla_afectada: 'gestiones',
        registro_id: data.id,
        detalle: { prestamo_id, tipo_gestion, resultado }
    })

    revalidatePath('/dashboard', 'layout')
    revalidatePath(`/dashboard/prestamos/${prestamo_id}`)

    return NextResponse.json({ ...data, usuario: usuarioPerfil || null })
}
