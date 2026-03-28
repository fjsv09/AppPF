import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/asistencia — Verificar si el usuario ya marcó asistencia hoy
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const supabaseAdmin = createAdminClient()

        // Obtener fecha actual en Lima
        const now = new Date()
        const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`

        // Verificar rol del usuario
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        // Admin no necesita marcar asistencia
        if (perfil?.rol === 'admin') {
            return NextResponse.json({ 
                required: false, 
                marked: true, 
                reason: 'Admin exento de asistencia' 
            })
        }

        // Buscar registro de hoy
        const { data: asistencia } = await supabaseAdmin
            .from('asistencia_personal')
            .select('*')
            .eq('usuario_id', user.id)
            .eq('fecha', todayStr)
            .maybeSingle()

        // Obtener configuración de asistencia
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'asistencia_radio_metros',
                'asistencia_descuento_por_minuto',
                'asistencia_tolerancia_minutos',
                'horario_apertura',
                'oficina_lat',
                'oficina_lon'
            ])

        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        return NextResponse.json({
            required: true,
            marked: !!asistencia,
            record: asistencia || null,
            config: {
                radio_metros: parseFloat(config?.asistencia_radio_metros || '150'),
                descuento_por_minuto: parseFloat(config?.asistencia_descuento_por_minuto || '0.15'),
                hora_limite: config?.horario_apertura || '08:00',
                tolerancia: parseInt(config?.asistencia_tolerancia_minutos || '15'),
                oficina_lat: parseFloat(config?.oficina_lat || '0'),
                oficina_lon: parseFloat(config?.oficina_lon || '0'),
            }
        })
    } catch (error: any) {
        console.error('[ASISTENCIA GET]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * POST /api/asistencia — Marcar asistencia con GPS
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const supabaseAdmin = createAdminClient()
        const body = await request.json()
        const { lat, lon } = body

        if (lat === undefined || lon === undefined) {
            return NextResponse.json({ error: 'Coordenadas GPS requeridas' }, { status: 400 })
        }

        // Obtener fecha y hora actual en Lima
        const now = new Date()
        const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`
        const horaActual = `${String(limaDate.getHours()).padStart(2, '0')}:${String(limaDate.getMinutes()).padStart(2, '0')}`

        // Verificar si ya marcó hoy
        const { data: existingRecord } = await supabaseAdmin
            .from('asistencia_personal')
            .select('id')
            .eq('usuario_id', user.id)
            .eq('fecha', todayStr)
            .maybeSingle()

        if (existingRecord) {
            return NextResponse.json({ error: 'Ya marcaste asistencia hoy' }, { status: 409 })
        }

        // Obtener configuración
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'asistencia_radio_metros',
                'asistencia_descuento_por_minuto',
                'asistencia_tolerancia_minutos',
                'horario_apertura',
                'oficina_lat',
                'oficina_lon'
            ])

        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        const radioMaximo = parseFloat(config?.asistencia_radio_metros || '150')
        const descuentoPorMinuto = parseFloat(config?.asistencia_descuento_por_minuto || '0.15')
        const horaLimite = config?.horario_apertura || '08:00'
        const toleranciaMinutos = parseInt(config?.asistencia_tolerancia_minutos || '15')
        const oficinaLat = parseFloat(config?.oficina_lat || '0')
        const oficinaLon = parseFloat(config?.oficina_lon || '0')

        // Validar que la oficina tenga coordenadas configuradas
        if (oficinaLat === 0 && oficinaLon === 0) {
            return NextResponse.json({ 
                error: 'Las coordenadas de la oficina no están configuradas. Contacte al administrador.' 
            }, { status: 400 })
        }

        // Calcular distancia a la oficina (Haversine en metros)
        const R = 6371000
        const dLat = (oficinaLat - lat) * Math.PI / 180
        const dLon = (oficinaLon - lon) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat * Math.PI / 180) * Math.cos(oficinaLat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distancia = R * c

        // Validar distancia
        if (distancia > radioMaximo) {
            // Registrar intento fallido en auditoría
            await supabaseAdmin.from('auditoria').insert({
                tabla: 'asistencia_personal',
                accion: 'intento_fallido',
                registro_id: user.id,
                usuario_id: user.id,
                detalles: {
                    motivo: 'fuera_de_rango',
                    distancia: Math.round(distancia),
                    radio_maximo: radioMaximo,
                    lat, lon
                }
            })

            return NextResponse.json({
                error: `📍 Fuera de rango. Estás a ${Math.round(distancia)}m de la oficina. El rango permitido es ${radioMaximo}m.`
            }, { status: 403 })
        }

        // Calcular tardanza
        const [horaLimH, horaLimM] = horaLimite.split(':').map(Number)
        const limiteMinutos = horaLimH * 60 + horaLimM
        const actualMinutos = limaDate.getHours() * 60 + limaDate.getMinutes()
        
        // Si entra dentro de la tolerancia, es puntual (minutos = 0).
        // Si excede la tolerancia, los minutos de tardanza se cuentan desde la hora límite base.
        let minutosTardanza = 0
        if (actualMinutos > (limiteMinutos + toleranciaMinutos)) {
            minutosTardanza = actualMinutos - limiteMinutos
        }
        
        const descuentoTardanza = parseFloat((minutosTardanza * descuentoPorMinuto).toFixed(2))

        // Determinar estado
        let estado: 'puntual' | 'tardanza' = 'puntual'
        if (minutosTardanza > 0) estado = 'tardanza'

        // Registrar asistencia
        const { data: registro, error: insertError } = await supabaseAdmin
            .from('asistencia_personal')
            .insert({
                usuario_id: user.id,
                fecha: todayStr,
                hora_entrada: horaActual,
                lat,
                lon,
                distancia_oficina: Math.round(distancia),
                minutos_tardanza: minutosTardanza,
                descuento_tardanza: descuentoTardanza,
                estado,
            })
            .select()
            .single()

        if (insertError) {
            console.error('[ASISTENCIA INSERT]', insertError)
            return NextResponse.json({ error: insertError.message }, { status: 500 })
        }

        // Si hay tardanza, actualizar nómina del mes actual
        if (descuentoTardanza > 0) {
            const currentMonth = limaDate.getMonth() + 1
            const currentYear = limaDate.getFullYear()

            // Obtener perfil para sueldo base
            const { data: perfil } = await supabaseAdmin
                .from('perfiles')
                .select('sueldo_base')
                .eq('id', user.id)
                .single()

            // Buscar o crear registro de nómina del mes
            const { data: nomina } = await supabaseAdmin
                .from('nomina_personal')
                .select('id, descuentos')
                .eq('trabajador_id', user.id)
                .eq('mes', currentMonth)
                .eq('anio', currentYear)
                .maybeSingle()

            if (nomina) {
                // Sumar descuento al existente
                const nuevoDescuento = parseFloat(((nomina.descuentos || 0) + descuentoTardanza).toFixed(2))
                await supabaseAdmin
                    .from('nomina_personal')
                    .update({ descuentos: nuevoDescuento })
                    .eq('id', nomina.id)
            } else {
                // Crear registro de nómina del mes
                await supabaseAdmin
                    .from('nomina_personal')
                    .insert({
                        trabajador_id: user.id,
                        mes: currentMonth,
                        anio: currentYear,
                        sueldo_base: perfil?.sueldo_base || 0,
                        bonos: 0,
                        descuentos: descuentoTardanza,
                        adelantos: 0,
                        estado: 'pendiente'
                    })
            }
        }

        // Registrar en auditoría
        await supabaseAdmin.from('auditoria').insert({
            tabla: 'asistencia_personal',
            accion: 'insert',
            registro_id: registro.id,
            usuario_id: user.id,
            detalles: {
                hora_entrada: horaActual,
                distancia: Math.round(distancia),
                minutos_tardanza: minutosTardanza,
                descuento: descuentoTardanza,
                estado
            }
        })

        return NextResponse.json({
            success: true,
            record: registro,
            message: estado === 'puntual'
                ? '✅ Asistencia registrada. ¡Llegaste puntual!'
                : `⚠️ Asistencia con tardanza de ${minutosTardanza} min. Descuento: S/ ${descuentoTardanza.toFixed(2)}`
        })
    } catch (error: any) {
        console.error('[ASISTENCIA POST]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
