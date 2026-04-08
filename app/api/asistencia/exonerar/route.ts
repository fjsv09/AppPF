import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

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

        // Determinar qué columna anular
        let tardanzaAAnularMinutos = 0
        const updates: any = {}

        if (turno === 'entrada') {
            tardanzaAAnularMinutos = asistencia.tardanza_entrada || 0
            updates.tardanza_entrada = 0
        } else if (turno === 'tarde') {
            tardanzaAAnularMinutos = asistencia.tardanza_turno_tarde || 0
            updates.tardanza_turno_tarde = 0
        } else if (turno === 'cierre') {
            tardanzaAAnularMinutos = asistencia.tardanza_cierre || 0
            updates.tardanza_cierre = 0
        }

        // Obtener configuración para el costo por minuto
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('valor')
            .eq('clave', 'asistencia_descuento_por_minuto')
            .single()
        
        const descuentoPorMinuto = parseFloat(configRows?.valor || '0.15')
        const descuentoAAnular = parseFloat((tardanzaAAnularMinutos * descuentoPorMinuto).toFixed(2))

        // Calcular nuevos totales del día
        const nuevosMinutosTotales = Math.max(0, (asistencia.minutos_tardanza || 0) - tardanzaAAnularMinutos)
        const nuevoDescuentoTotal = Math.max(0, (asistencia.descuento_tardanza || 0) - descuentoAAnular)

        updates.minutos_tardanza = nuevosMinutosTotales
        updates.descuento_tardanza = nuevoDescuentoTotal
        updates.estado = nuevosMinutosTotales > 0 ? 'tardanza' : 'puntual'

        const usuarioId = asistencia.usuario_id
        const fechaRecord = new Date(asistencia.fecha)
        const mes = fechaRecord.getMonth() + 1
        const anio = fechaRecord.getFullYear()

        // Validar si el descuento ya fue aplicado en un pago al trabajador
        // Los pagos pueden ser semanales, quincenales o mensuales.
        // Si ya se hizo al menos un pago que consumió descuentos, no se puede exonerar.
        const { data: nominaCheck } = await supabaseAdmin
            .from('nomina_personal')
            .select('estado, pagos_completados, descuentos, descuentos_original')
            .eq('trabajador_id', usuarioId)
            .eq('mes', mes)
            .eq('anio', anio)
            .maybeSingle()
        
        if (nominaCheck) {
            const pagosRealizados = nominaCheck.pagos_completados || 0
            const descuentosYaDescontados = parseFloat(nominaCheck.descuentos_original || 0)

            // Si la nómina ya está pagada completamente
            if (nominaCheck.estado === 'pagado' || nominaCheck.estado === 'liquidado') {
                return NextResponse.json({ 
                    error: `No se puede exonerar. La nómina de ${mes}/${anio} ya está ${nominaCheck.estado}.` 
                }, { status: 400 })
            }

            // Si ya se hizo un pago parcial que ya aplicó descuentos
            if (pagosRealizados > 0 && descuentosYaDescontados > 0) {
                return NextResponse.json({ 
                    error: `No se puede exonerar. Ya se realizó un pago (${pagosRealizados}) que incluyó S/ ${descuentosYaDescontados.toFixed(2)} en descuentos por tardanza.` 
                }, { status: 400 })
            }
        }

        // 1. Actualizar el registro de asistencia
        const { error: errorAsistencia } = await supabaseAdmin
            .from('asistencia_personal')
            .update(updates)
            .eq('id', asistenciaId)

        if (errorAsistencia) throw errorAsistencia

        // 2. Si se anuló descuento, restarlo de la nómina
        if (descuentoAAnular > 0) {
            const { data: nomina } = await supabaseAdmin
                .from('nomina_personal')
                .select('id, descuentos')
                .eq('trabajador_id', usuarioId)
                .eq('mes', mes)
                .eq('anio', anio)
                .maybeSingle()
            
            if (nomina) {
                const nuevoDescuentoNomina = Math.max(0, (nomina.descuentos || 0) - descuentoAAnular)
                await supabaseAdmin
                    .from('nomina_personal')
                    .update({ descuentos: parseFloat(nuevoDescuentoNomina.toFixed(2)) })
                    .eq('id', nomina.id)
            }
        }

        // 3. Registrar auditoría con el turno específico
        await supabaseAdmin.from('auditoria').insert({
            tabla_afectada: 'asistencia_personal',
            accion: 'exoneracion_tardanza',
            registro_id: asistenciaId,
            usuario_id: user.id,
            detalle: {
                turno_exonerado: turno,
                minutos_anulados: tardanzaAAnularMinutos,
                asistencia_anterior: asistencia,
                motivo: 'Trabajo en campo / Exoneración manual de turno'
            }
        })

        return NextResponse.json({ success: true, message: 'Tardanza exonerada correctamente' })
    } catch (error: any) {
        console.error('[EXONERAR ASISTENCIA]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
