import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { cuota_id, lat, lon } = body
    
    if (!cuota_id || lat === undefined || lon === undefined) {
        return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Obtener datos del préstamo y cliente asociados a la cuota
    const { data: cuota, error: quotaError } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('prestamo_id, prestamos:prestamo_id(cliente_id)')
        .eq('id', cuota_id)
        .single()
    
    if (quotaError || !cuota) {
        return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
    }

    const prestamo_id = cuota.prestamo_id
    const cliente_id = (cuota.prestamos as any)?.cliente_id

    if (!cliente_id) {
        return NextResponse.json({ error: 'No se pudo identificar al cliente' }, { status: 400 })
    }

    // --- VALIDACIÓN DE GEOLOCALIZACIÓN CONTRA SOLICITUD ---
    const { data: prestamoInfo } = await supabaseAdmin
        .from('prestamos')
        .select(`
            solicitud_id,
            solicitudes ( gps_coordenadas )
        `)
        .eq('id', prestamo_id)
        .single()

    const gps_coordenadas = (prestamoInfo?.solicitudes as any)?.gps_coordenadas

    if (gps_coordenadas) {
        const parts = gps_coordenadas.split(',')
        const lat_cliente = parseFloat(parts[0])
        const lon_cliente = parseFloat(parts[1])

        if (!isNaN(lat_cliente) && !isNaN(lon_cliente)) {
            // Calcular distancia (Haversine en metros)
            const R = 6371000 
            const dLat = (lat_cliente - lat) * Math.PI / 180
            const dLon = (lon_cliente - lon) * Math.PI / 180
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat * Math.PI / 180) * Math.cos(lat_cliente * Math.PI / 180) * 
                      Math.sin(dLon/2) * Math.sin(dLon/2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
            const distancia = R * c

            // Obtener radio máximo de configuración
            const { data: configRadio } = await supabaseAdmin
                .from('configuracion_sistema')
                .select('valor')
                .eq('clave', 'visita_radio_maximo')
                .single()
            
            const radioMax = parseInt(configRadio?.valor) || 300

            if (distancia > radioMax) {
                 return NextResponse.json({ 
                     error: `📍 Fuera de rango. Estás a ${Math.round(distancia)}m. El radio permitido es de ${radioMax}m.` 
                 }, { status: 403 })
            }
        }
    }

    // Insertar el inicio de la visita
    const { data, error } = await supabaseAdmin
        .from('visitas_terreno')
        .insert({
            asesor_id: user.id,
            cliente_id,
            prestamo_id,
            cuota_id,
            lat_ini: lat,
            lon_ini: lon,
            estado: 'en_proceso',
            fecha_inicio: new Date().toISOString()
        })
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
}
