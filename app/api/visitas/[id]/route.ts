import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, context: { params: { id: string } }) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Extraer params (esperar si es necesario, aunque en route handlers es directo)
    const { id } = context.params;

    const body = await request.json()
    const { lat, lon, notas } = body
    
    if (body.estado === 'cancelada') {
        const { error: cancelError } = await supabaseAdmin
            .from('visitas_terreno')
            .update({ estado: 'cancelada', fecha_fin: new Date().toISOString() })
            .eq('id', id)
        
        if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 400 })
        return NextResponse.json({ success: true, estado: 'cancelada' })
    }

    if (lat === undefined || lon === undefined) {
        return NextResponse.json({ error: 'Faltan coordenadas' }, { status: 400 })
    }

    // Usar la función RPC para finalizar y verificar tiempo mínimo
    const { data, error } = await supabaseAdmin.rpc('finalizar_visita_v2', {
        p_visita_id: id,
        p_lat_fin: lat,
        p_lon_fin: lon,
        p_notas: notas || null
    })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
}
