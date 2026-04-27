import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/asistencia/exonerar
 * Exonerar tardanza de un registro de asistencia
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const supabaseAdmin = createAdminClient()
        
        // Verificar rol (solo admin y supervisor pueden exonerar)
        const { data: perfilRequester } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()
        
        if (perfilRequester?.rol !== 'admin') {
            return NextResponse.json({ error: 'No tienes permisos para exonerar tardanzas' }, { status: 403 })
        }

        const body = await request.json()
        const { asistenciaId, turno } = body

        if (!asistenciaId || !turno) {
            return NextResponse.json({ error: 'ID de asistencia y turno requeridos' }, { status: 400 })
        }

        // Obtener el registro de asistencia actual
        const { data: asistencia } = await supabaseAdmin
            .from('asistencia_personal')
            .select('*')
            .eq('id', asistenciaId)
            .single()

        if (!asistencia) {
            return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
        }

        // Obtener configuración para tiempos por defecto
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'horario_apertura',
                'horario_fin_turno_1',
                'horario_cierre',
                'asistencia_descuento_por_minuto'
            ])
        
        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        const descuentoPorMinuto = parseFloat(config?.asistencia_descuento_por_minuto || '0.15')

        // Determinar qué columna anular
        const updates: any = {}
        let tardanzaAAnularMinutos = 0
        let isForcedEntry = false

        if (turno === 'entrada') {
            tardanzaAAnularMinutos = asistencia.tardanza_entrada || 0
            updates.tardanza_entrada = 0
            if (!asistencia.hora_entrada) {
                updates.hora_entrada = config?.horario_apertura || '08:00'
                isForcedEntry = true
            }
        } else if (turno === 'tarde') {
            tardanzaAAnularMinutos = asistencia.tardanza_turno_tarde || 0
            updates.tardanza_turno_tarde = 0
            if (!asistencia.hora_turno_tarde) {
                updates.hora_turno_tarde = config?.horario_fin_turno_1 || '13:30'
                isForcedEntry = true
            }
        } else if (turno === 'cierre') {
            tardanzaAAnularMinutos = asistencia.tardanza_cierre || 0
            updates.tardanza_cierre = 0
            if (!asistencia.hora_cierre) {
                updates.hora_cierre = config?.horario_cierre || '19:00'
                isForcedEntry = true
            }
        }

        if (tardanzaAAnularMinutos === 0 && !isForcedEntry) {
            return NextResponse.json({ success: true, message: 'Ya estaba exonerado' })
        }

        // 1. Actualizar el registro de asistencia
        const { data: asistenciaActualizada, error: errorAsistencia } = await supabaseAdmin
            .from('asistencia_personal')
            .update(updates)
            .eq('id', asistenciaId)
            .select()
            .single()

        if (errorAsistencia) throw errorAsistencia

        // 2. Recalcular totales del día
        const minutosRestantes = (asistenciaActualizada.tardanza_entrada || 0) + 
                                (asistenciaActualizada.tardanza_turno_tarde || 0) + 
                                (asistenciaActualizada.tardanza_cierre || 0)
        
        const nuevoDescuentoDia = parseFloat((minutosRestantes * descuentoPorMinuto).toFixed(2))

        await supabaseAdmin
            .from('asistencia_personal')
            .update({
                minutos_tardanza: minutosRestantes,
                descuento_tardanza: nuevoDescuentoDia,
                estado: minutosRestantes > 0 ? 'tardanza' : 'puntual'
            })
            .eq('id', asistenciaId)

        const usuarioId = asistencia.usuario_id
        const fechaRecord = new Date(asistencia.fecha + 'T12:00:00')
        const mes = fechaRecord.getMonth() + 1
        const anio = fechaRecord.getFullYear()

        // 3. Sincronizar la nómina
        const firstDay = new Date(anio, mes - 1, 1).toISOString().split('T')[0]
        const lastDay = new Date(anio, mes, 0).toISOString().split('T')[0]

        const { data: todosLosRegistrosMes } = await supabaseAdmin
            .from('asistencia_personal')
            .select('descuento_tardanza')
            .eq('usuario_id', usuarioId)
            .gte('fecha', firstDay)
            .lte('fecha', lastDay)
        
        const nuevoTotalDescuentosMes = (todosLosRegistrosMes || []).reduce((acc, curr) => acc + (curr.descuento_tardanza || 0), 0)

        const { data: nomina } = await supabaseAdmin
            .from('nomina_personal')
            .select('id')
            .eq('trabajador_id', usuarioId)
            .eq('mes', mes)
            .eq('anio', anio)
            .maybeSingle()
        
        if (nomina) {
            await supabaseAdmin
                .from('nomina_personal')
                .update({ descuentos: parseFloat(nuevoTotalDescuentosMes.toFixed(2)) })
                .eq('id', nomina.id)

            const readableTurno = turno === 'entrada' ? 'Mañana' : (turno === 'tarde' ? 'Turno Tarde' : 'Cierre')
            const montoExonerado = parseFloat((tardanzaAAnularMinutos * descuentoPorMinuto).toFixed(2))
            
            if (montoExonerado > 0 || isForcedEntry) {
                await supabaseAdmin.from('transacciones_personal').insert({
                    trabajador_id: usuarioId,
                    nomina_id: nomina.id,
                    tipo: 'ajuste_positivo',
                    monto: montoExonerado,
                    descripcion: isForcedEntry 
                        ? `Exoneración de Asistencia (Trabajo en Campo: ${readableTurno}) — ${asistencia.fecha}`
                        : `Ajuste Positivo: Exoneración de Tardanza (${readableTurno}) — ${asistencia.fecha}`,
                    metadatos: {
                        asistencia_id: asistenciaId,
                        turno: turno,
                        minutos_exonerados: tardanzaAAnularMinutos,
                        campo: isForcedEntry
                    },
                    registrado_por: user.id
                })
            }
        }

        // 4. Registrar auditoría
        await supabaseAdmin.from('auditoria').insert({
            tabla_afectada: 'asistencia_personal',
            accion: isForcedEntry ? 'exoneracion_asistencia_campo' : 'exoneracion_tardanza',
            registro_id: asistenciaId,
            usuario_id: user.id,
            detalle: {
                turno_exonerado: turno,
                minutos_anulados: tardanzaAAnularMinutos,
                es_campo: isForcedEntry,
                asistencia_anterior: asistencia,
                motivo: isForcedEntry ? 'Trabajo en campo (asistencia forzada)' : 'Exoneración manual de tardanza'
            }
        })

        return NextResponse.json({ success: true, message: 'Tardanza/Asistencia exonerada correctamente' })

    } catch (error: any) {
        console.error('[EXONERAR ASISTENCIA]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
