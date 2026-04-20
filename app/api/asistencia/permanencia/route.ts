import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

        // Obtener fecha actual en Lima
        const now = new Date()
        const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`

        // Buscar registro de hoy
        const { data: record, error: recordError } = await supabaseAdmin
            .from('asistencia_personal')
            .select('*')
            .eq('usuario_id', user.id)
            .eq('fecha', todayStr)
            .maybeSingle()

        if (!record || !record.permanencia_entrada_inicio || record.permanencia_entrada_estado !== 'pendiente') {
            return NextResponse.json({ message: 'No se requiere verificación de permanencia actualmente', estado: record?.permanencia_entrada_estado || 'n/a' })
        }

        // Obtener configuración de oficina y minutos de permanencia
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'oficina_lat', 
                'oficina_lon', 
                'asistencia_radio_metros', 
                'asistencia_minutos_permanencia',
                'asistencia_descuento_por_minuto',
                'asistencia_tolerancia_minutos',
                'horario_apertura'
            ])

        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        const oficinaLat = parseFloat(config?.oficina_lat || '0')
        const oficinaLon = parseFloat(config?.oficina_lon || '0')
        const radioMaximo = parseFloat(config?.asistencia_radio_metros || '150')
        const minsRequeridos = parseInt(config?.asistencia_minutos_permanencia || '15')

        // 1. Calcular distancia (Haversine)
        const R = 6371000
        const dLat = (oficinaLat - lat) * Math.PI / 180
        const dLon = (oficinaLon - lon) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat * Math.PI / 180) * Math.cos(oficinaLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distancia = R * c

        // 2. Verificar si está fuera de rango
        if (distancia > radioMaximo) {
            // Marcar como INCUMPLIDO
            await supabaseAdmin.from('asistencia_personal').update({
                permanencia_entrada_estado: 'incumplido',
                permanencia_entrada_fin: new Date().toISOString()
            }).eq('id', record.id)

            // Registrar en auditoría
            await supabaseAdmin.from('auditoria').insert({
                tabla: 'asistencia_personal',
                accion: 'permanencia_fallida',
                registro_id: record.id,
                usuario_id: user.id,
                detalles: {
                    motivo: 'fuera_de_rango',
                    distancia: Math.round(distancia),
                    radio_maximo: radioMaximo,
                    lat, lon
                }
            })

            return NextResponse.json({ success: true, estado: 'incumplido', message: 'Fuera de rango' })
        }

        // 3. Verificar si el tiempo ha pasado
        const inicio = new Date(record.permanencia_entrada_inicio)
        const transcurridoMins = (now.getTime() - inicio.getTime()) / 60000

        if (transcurridoMins >= minsRequeridos) {
            // Cumplido - Realizar el registro oficial
            const inicioLima = new Date(inicio.toLocaleString('en-US', { timeZone: 'America/Lima' }))
            const horaEntradaOficial = `${String(inicioLima.getHours()).padStart(2, '0')}:${String(inicioLima.getMinutes()).padStart(2, '0')}`
            
            const timeToMinutes = (t: string) => {
                const [h, m] = t.split(':').map(Number)
                return (h || 0) * 60 + (m || 0)
            }

            const horaLimite = config?.horario_apertura || '08:00'
            const tLimite = timeToMinutes(horaLimite)
            const tActual = inicioLima.getHours() * 60 + inicioLima.getMinutes()
            const toleranciaMinutos = parseInt(config?.asistencia_tolerancia_minutos || '15')
            const descuentoPorMinuto = parseFloat(config?.asistencia_descuento_por_minuto || '0.15')

            let minutosTardanza = 0
            let descuentoTardanza = 0

            if (tActual > tLimite) {
                const diferenciaTotal = tActual - tLimite
                if (diferenciaTotal > toleranciaMinutos) {
                    minutosTardanza = diferenciaTotal - toleranciaMinutos
                    descuentoTardanza = minutosTardanza * descuentoPorMinuto
                }
            }

            const estadoFinal = (minutosTardanza > 0) ? 'tardanza' : 'puntual'

            // Actualizar registro de asistencia
            await supabaseAdmin.from('asistencia_personal').update({
                hora_entrada: horaEntradaOficial,
                permanencia_entrada_estado: 'cumplido',
                permanencia_entrada_fin: new Date().toISOString(),
                minutos_tardanza: (record.minutos_tardanza || 0) + minutosTardanza,
                descuento_tardanza: (record.descuento_tardanza || 0) + descuentoTardanza,
                estado: estadoFinal,
                tardanza_entrada: minutosTardanza
            }).eq('id', record.id)

            // Si hubo descuento, actualizar nómina
            if (descuentoTardanza > 0) {
                const mes = inicioLima.getMonth() + 1
                const anio = inicioLima.getFullYear()
                
                const { data: nomina } = await supabaseAdmin
                    .from('nomina_personal')
                    .select('id, descuentos')
                    .eq('trabajador_id', user.id)
                    .eq('mes', mes)
                    .eq('anio', anio)
                    .maybeSingle()

                if (nomina) {
                    const nuevoDescuento = parseFloat(((nomina.descuentos || 0) + descuentoTardanza).toFixed(2))
                    await supabaseAdmin.from('nomina_personal').update({ descuentos: nuevoDescuento }).eq('id', nomina.id)
                } else {
                    const { data: perfil } = await supabaseAdmin.from('perfiles').select('sueldo_base').eq('id', user.id).single()
                    await supabaseAdmin.from('nomina_personal').insert({
                        trabajador_id: user.id,
                        mes,
                        anio,
                        sueldo_base: perfil?.sueldo_base || 0,
                        descuentos: descuentoTardanza,
                        estado: 'pendiente'
                    })
                }
            }

            // Auditoría del éxito
            await supabaseAdmin.from('auditoria').insert({
                tabla: 'asistencia_personal',
                accion: 'permanencia_cumplida',
                registro_id: record.id,
                usuario_id: user.id,
                detalles: { 
                    hora_entrada: horaEntradaOficial, 
                    minutos_tardanza: minutosTardanza, 
                    descuento: descuentoTardanza 
                }
            })

            return NextResponse.json({ 
                success: true, 
                estado: 'cumplido', 
                message: 'Permanencia completada. Registro de entrada finalizado exitosamente.',
                hora_entrada: horaEntradaOficial
            })
        }

        // Sigue pendiente
        return NextResponse.json({ success: true, estado: 'pendiente', transcurrido: Math.floor(transcurridoMins) })

    } catch (error: any) {
        console.error('[PERMANENCIA_PING]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
