import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

// GET - Devuelve el asesor del cliente y su supervisor para asignar una gestión
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const prestamo_id = searchParams.get('prestamo_id')
    const cliente_id = searchParams.get('cliente_id')

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Identificar cliente_id final si no fue enviado
    let finalClienteId = cliente_id

    if (!finalClienteId && prestamo_id && prestamo_id !== 'null' && prestamo_id !== 'undefined') {
        const { data: p } = await supabaseAdmin
            .from('prestamos')
            .select('cliente_id')
            .eq('id', prestamo_id)
            .single()
        if (p?.cliente_id) finalClienteId = p.cliente_id
    }

    if (!finalClienteId) {
        return NextResponse.json([])
    }

    // 1. Obtener el asesor asignado al cliente (LA FUENTE DE VERDAD)
    const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('asesor_id')
        .eq('id', finalClienteId)
        .single()

    let asesorId: string | null = cliente?.asesor_id || null

    if (!asesorId) {
        return NextResponse.json([])
    }

    // 2. Obtener el supervisor del asesor
    const { data: asesorPerfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol, supervisor_id')
        .eq('id', asesorId)
        .single()

    let supervisorId: string | null = asesorPerfil?.supervisor_id || null

    // 3. Construir la lista: asesor + supervisor (sin duplicados)
    const ids = [...new Set([asesorId, supervisorId].filter(Boolean) as string[])]

    const { data: asignables } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol')
        .in('id', ids)
        .order('rol')

    return NextResponse.json(asignables || [])
}
