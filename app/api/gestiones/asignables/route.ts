import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

// GET - Devuelve el asesor del cliente y su supervisor para asignar una visita
// Cadena: prestamos.cliente_id → clientes.asesor_id → perfiles.supervisor_id
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const prestamo_id = searchParams.get('prestamo_id')

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
        return NextResponse.json({ error: 'Solo administradores pueden ver esta lista' }, { status: 403 })
    }

    // Fallback sin prestamo_id → devuelve todos
    if (!prestamo_id) {
        const { data } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .in('rol', ['asesor', 'supervisor'])
            .order('rol').order('nombre_completo')
        return NextResponse.json(data || [])
    }

    // 1. Obtener el cliente del préstamo
    const { data: prestamo } = await supabaseAdmin
        .from('prestamos')
        .select('cliente_id')
        .eq('id', prestamo_id)
        .single()

    if (!prestamo?.cliente_id) {
        return NextResponse.json({ error: 'Préstamo o cliente no encontrado' }, { status: 404 })
    }

    // 2. Obtener el asesor asignado al cliente (fuente más confiable)
    const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('asesor_id, nombres')
        .eq('id', prestamo.cliente_id)
        .single()

    let asesorId: string | null = cliente?.asesor_id || null

    // 3. Si el cliente no tiene asesor_id (caso raro), fallback a tareas_evidencia
    if (!asesorId) {
        const { data: tareas } = await supabaseAdmin
            .from('tareas_evidencia')
            .select('asesor_id')
            .eq('prestamo_id', prestamo_id)
            .not('tipo', 'in', '("auditoria_dirigida","visita_asignada")')
            .limit(1)
        asesorId = tareas?.[0]?.asesor_id || null
    }

    if (!asesorId) {
        // Último fallback: devuelve todos
        const { data } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .in('rol', ['asesor', 'supervisor'])
            .order('rol').order('nombre_completo')
        return NextResponse.json(data || [])
    }

    // 4. Obtener el supervisor del asesor
    const { data: asesorPerfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol, supervisor_id')
        .eq('id', asesorId)
        .single()

    let supervisorId: string | null = asesorPerfil?.supervisor_id || null

    // 5. Construir la lista: asesor + supervisor (sin duplicados)
    const ids = [...new Set([asesorId, supervisorId].filter(Boolean) as string[])]

    const { data: asignables, error } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol')
        .in('id', ids)
        .order('rol')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json(asignables || [])
}
