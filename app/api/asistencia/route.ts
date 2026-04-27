import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
        const isSunday = limaDate.getDay() === 0

        // 1. Verificar si hoy es feriado o domingo
        const { data: holiday } = await supabaseAdmin
            .from('feriados')
            .select('id, descripcion')
            .eq('fecha', todayStr)
            .maybeSingle()

        if (isSunday || holiday) {
            return NextResponse.json({
                required: false,
                marked: true,
                reason: `Hoy es ${isSunday ? 'Domingo' : 'Feriado'}${holiday ? ': ' + holiday.descripcion : ''}`
            })
        }

        // Verificar rol del usuario
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        // Buscar registro de hoy
        const { data: asistencia } = await supabaseAdmin
            .from('asistencia_personal')
            .select('*')
            .eq('usuario_id', user.id)
            .eq('fecha', todayStr)
            .maybeSingle()

        // Obtener configuración de asistencia completa
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'asistencia_radio_metros',
                'asistencia_descuento_por_minuto',
                'asistencia_tolerancia_minutos',
                'horario_apertura',
                'horario_fin_turno_1',
                'horario_cierre',
                'oficina_lat',
                'oficina_lon',
                'asistencia_minutos_permanencia'
            ])

        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        // Determinar qué evento se requiere marcar siguiendo un orden acumulativo
        const timeToMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            return (h || 0) * 60 + (m || 0)
        }

        const tNow = limaDate.getHours() * 60 + limaDate.getMinutes()
        const tFinTurno1 = timeToMinutes(config?.horario_fin_turno_1 || '13:30')
        const tCierre = timeToMinutes(config?.horario_cierre || '19:00')

        let eventRequired = 'entrada'
        let isMarked = !!asistencia?.hora_entrada

        // Lógica Acumulativa:
        // 1. Si no ha marcado entrada (o falló permanencia), pedir entrada
        if ((!asistencia?.hora_entrada || asistencia?.permanencia_entrada_estado === 'incumplido') && asistencia?.permanencia_entrada_estado !== 'pendiente') {
            eventRequired = 'entrada'
            isMarked = false
        }
        // 1b. Si la permanencia está pendiente, considerar "marcado" temporalmente para dejarlo pasar
        else if (asistencia?.permanencia_entrada_estado === 'pendiente') {
            eventRequired = 'entrada' // Sigue siendo entrada, pero desbloqueado
            isMarked = true
        }
        // 2. Si ya marcó entrada (o se cumplió la permanencia), verificar Inicio del Turno Tarde
        else if (tNow >= tFinTurno1 && !asistencia?.hora_turno_tarde) {
            eventRequired = 'fin_turno_1'
            isMarked = false
        }
        // 3. Si ya marcó entrada y fin de turno 1, verificar Cierre Final
        else if (tNow >= tCierre && !asistencia?.hora_cierre) {
            eventRequired = 'cierre'
            isMarked = false
        }
        else {
            isMarked = true
        }

        return NextResponse.json({
            required: true,
            marked: isMarked,
            event: eventRequired,
            record: asistencia || null,
            config: {
                radio_metros: parseFloat(config?.asistencia_radio_metros || '150'),
                descuento_por_minuto: parseFloat(config?.asistencia_descuento_por_minuto || '0.15'),
                hora_limite: config?.horario_apertura || '08:00',
                hora_fin_1: config?.horario_fin_turno_1 || '13:30',
                hora_cierre: config?.horario_cierre || '19:00',
                tolerancia: parseInt(config?.asistencia_tolerancia_minutos || '15'),
                oficina_lat: parseFloat(config?.oficina_lat || '0'),
                oficina_lon: parseFloat(config?.oficina_lon || '0'),
                minutos_permanencia: parseInt(config?.asistencia_minutos_permanencia || '15'),
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

        // Buscar registro de hoy
        const { data: existingRecord } = await supabaseAdmin
            .from('asistencia_personal')
            .select('*')
            .eq('usuario_id', user.id)
            .eq('fecha', todayStr)
            .maybeSingle()

        // Obtener configuración completa
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'asistencia_radio_metros',
                'asistencia_descuento_por_minuto',
                'asistencia_tolerancia_minutos',
                'horario_apertura',
                'horario_fin_turno_1',
                'horario_cierre',
                'oficina_lat',
                'oficina_lon',
                'asistencia_minutos_permanencia'
            ])

        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        // Determinar qué evento estamos marcando
        const timeToMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            return (h || 0) * 60 + (m || 0)
        }

        const tNow = limaDate.getHours() * 60 + limaDate.getMinutes()
        const tFinTurno1 = timeToMinutes(config?.horario_fin_turno_1 || '13:30')
        const tCierre = timeToMinutes(config?.horario_cierre || '19:00')

        let eventTarget = 'entrada'
        let updateField = 'hora_entrada'

        // Lógica Acumulativa Sincronizada con GET:
        // 1. Si no ha marcado entrada, SIEMPRE será entrada primero (no importa la hora)
        if (!existingRecord?.hora_entrada) {
            eventTarget = 'entrada'
            updateField = 'hora_entrada'
        }
        // 2. Si ya marcó entrada, verificar si ya es hora de registrar Inicio del Turno Tarde
        else if (tNow >= tFinTurno1 && !existingRecord.hora_turno_tarde) {
            eventTarget = 'fin_turno_1'
            updateField = 'hora_turno_tarde'
        }
        // 3. Si ya marcó entrada y turno tarde, verificar si es hora del Cierre Final
        else if (tNow >= tCierre && !existingRecord.hora_cierre) {
            eventTarget = 'cierre'
            updateField = 'hora_cierre'
        }

        // Si ya marcó este evento específico, error
        if (existingRecord && (existingRecord as any)[updateField]) {
            return NextResponse.json({ error: `Ya registraste tu asistencia de ${eventTarget} hoy` }, { status: 409 })
        }

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

        // Determinar hora límite según el evento
        let horaLimiteStr = config?.horario_apertura || '08:00'
        if (eventTarget === 'fin_turno_1') horaLimiteStr = config?.horario_fin_turno_1 || '13:30'
        if (eventTarget === 'cierre') horaLimiteStr = config?.horario_cierre || '19:00'

        const tLimite = timeToMinutes(horaLimiteStr)
        const tActual = limaDate.getHours() * 60 + limaDate.getMinutes()

        let minutosTardanzaActual = 0
        let descuentoTardanzaActual = 0

        if (tActual > tLimite) {
            const diferenciaTotal = tActual - tLimite
            // Solo hay tardanza si supera la tolerancia
            if (diferenciaTotal > toleranciaMinutos) {
                minutosTardanzaActual = diferenciaTotal - toleranciaMinutos
                descuentoTardanzaActual = minutosTardanzaActual * descuentoPorMinuto
            }
        }

        // Acumular con los valores previos si existen
        const totalMinutosTardanza = (existingRecord?.minutos_tardanza || 0) + minutosTardanzaActual
        const totalDescuentoTardanza = (existingRecord?.descuento_tardanza || 0) + descuentoTardanzaActual

        // Si ya tenía tardanza previa, el estado se queda como 'tardanza'
        const estadoFinal = (totalMinutosTardanza > 0) ? 'tardanza' : 'puntual'

        // Determinar qué columna de tardanza específica actualizar
        let tardanzaField = 'tardanza_entrada'
        let latField = 'lat'
        let lonField = 'lon'

        if (eventTarget === 'fin_turno_1') {
            tardanzaField = 'tardanza_turno_tarde'
            latField = 'lat_tarde'
            lonField = 'lon_tarde'
        } else if (eventTarget === 'cierre') {
            tardanzaField = 'tardanza_cierre'
            latField = 'lat_cierre'
            lonField = 'lon_cierre'
        }

        // Manejo de Registro (Insertar o Actualizar)
        let registro
        let operationError

        if (existingRecord) {
            // Actualizar registro existente incluyendo acumulación de tardanza y ubicación individual
            const { data, error } = await supabaseAdmin
                .from('asistencia_personal')
                .update({
                    // Registrar hora inmediata (ahora siempre, para evitar restricción NOT NULL en entrada)
                    [latField]: lat,
                    [lonField]: lon,
                    lat, 
                    lon, 
                    distancia_oficina: Math.round(distancia),
                    // Si es entrada, iniciamos permanencia y ponemos hora básica (para satisfacer NOT NULL)
                    // Si NO es entrada (turno tarde o cierre), registramos hora y tardanza inmediatamente
                    ...(eventTarget === 'entrada' ? {
                        hora_entrada: horaActual,
                        permanencia_entrada_inicio: new Date().toISOString(),
                        permanencia_entrada_estado: 'pendiente'
                    } : {
                        [updateField]: horaActual,
                        minutos_tardanza: totalMinutosTardanza,
                        descuento_tardanza: totalDescuentoTardanza,
                        estado: estadoFinal,
                        [tardanzaField]: minutosTardanzaActual,
                    })
                })
                .eq('id', existingRecord.id)
                .select()
                .single()

            registro = data
            operationError = error
        } else {
            // Crear nuevo registro
            const insertData: any = {
                usuario_id: user.id,
                fecha: todayStr,
                // Registrar hora inmediata
                [latField]: lat,
                [lonField]: lon,
                lat,
                lon,
                distancia_oficina: Math.round(distancia),
                // Si es entrada, iniciamos permanencia y ponemos hora básica
                // Si NO es entrada, registramos hora y tardanza inmediatamente
                ...(eventTarget === 'entrada' ? {
                    hora_entrada: horaActual,
                    permanencia_entrada_inicio: new Date().toISOString(),
                    permanencia_entrada_estado: 'pendiente'
                } : {
                    [updateField]: horaActual,
                    minutos_tardanza: totalMinutosTardanza,
                    descuento_tardanza: totalDescuentoTardanza,
                    estado: estadoFinal,
                    [tardanzaField]: minutosTardanzaActual,
                })
            }

            const { data, error } = await supabaseAdmin
                .from('asistencia_personal')
                .insert(insertData)
                .select()
                .single()

            registro = data
            operationError = error
        }

        if (operationError) {
            console.error('[ASISTENCIA OPERATION]', operationError)
            return NextResponse.json({ error: operationError.message }, { status: 500 })
        }

        // Si hubo tardanza en este evento específico, actualizar nómina del mes actual
        if (descuentoTardanzaActual > 0) {
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
                // Sumar el descuento actual al existente en la nómina
                const nuevoDescuentoTotal = parseFloat(((nomina.descuentos || 0) + descuentoTardanzaActual).toFixed(2))
                await supabaseAdmin
                    .from('nomina_personal')
                    .update({ descuentos: nuevoDescuentoTotal })
                    .eq('id', nomina.id)
            } else {
                // Crear nuevo registro de nómina
                await supabaseAdmin
                    .from('nomina_personal')
                    .insert({
                        trabajador_id: user.id,
                        mes: currentMonth,
                        anio: currentYear,
                        sueldo_base: perfil?.sueldo_base || 0,
                        bonos: 0,
                        descuentos: descuentoTardanzaActual,
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
                evento: eventTarget,
                hora: horaActual,
                distancia: Math.round(distancia),
                minutos_tardanza_evento: minutosTardanzaActual,
                descuento_evento: descuentoTardanzaActual,
                total_tardanza_dia: totalMinutosTardanza,
                estado: estadoFinal
            }
        })

        let readableEvent = eventTarget === 'entrada' ? 'Entrada' : (eventTarget === 'fin_turno_1' ? 'Turno Tarde' : 'Cierre Final')

        return NextResponse.json({
            success: true,
            record: registro,
            message: eventTarget === 'entrada'
                ? `⏳ Verificación de permanencia iniciada. Permanece en la oficina por 15 minutos para completar tu registro.`
                : (minutosTardanzaActual > 0
                    ? `⚠️ Registro de ${readableEvent} con tardanza de ${minutosTardanzaActual} min. Descuento aplicado: S/ ${descuentoTardanzaActual.toFixed(2)}`
                    : `✅ Registro de ${readableEvent} exitoso y puntual a las ${horaActual}.`)
        })
    } catch (error: any) {
        console.error('[ASISTENCIA POST]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
