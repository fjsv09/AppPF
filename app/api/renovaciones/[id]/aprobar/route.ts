import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'
import { generarCronogramaNode, computeVirtualCronograma } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

// PATCH - Aprobar solicitud de renovación final (Admin)
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const payload = await request.json().catch(() => ({}))
        const { cuentaOrigenId } = payload

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Verificar que es admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden aprobar renovaciones' }, { status: 403 })
        }

        // Verificar solicitud
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .select(`
                *,
                cliente:cliente_id(id, nombres),
                asesor:asesor_id(id, nombre_completo)
            `)
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        if (solicitud.estado_solicitud !== 'pre_aprobado') {
            return NextResponse.json({ 
                error: `Solo se pueden aprobar solicitudes pre-aprobadas. Estado actual: "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        // ===== CALCULAR DESEMBOLSO NETO Y VALIDAR SALDO =====
        if (!cuentaOrigenId) {
            return NextResponse.json({ error: 'Debes seleccionar una cuenta para el desembolso.' }, { status: 400 })
        }

        const { data: cuentaSeleccionada } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('cartera_id, saldo')
            .eq('id', cuentaOrigenId)
            .single()

        if (!cuentaSeleccionada) {
            return NextResponse.json({ error: 'La cuenta de origen seleccionada no existe.' }, { status: 404 })
        }

        // Obtener TODAS las cuotas + pagos para calcular saldo real via cascada FIFO
        const { data: todasCuotas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id, numero_cuota, monto_cuota, monto_pagado')
            .eq('prestamo_id', solicitud.prestamo_id)

        const cuotaIds = (todasCuotas || []).map((c: any) => c.id)
        const pagosResult = cuotaIds.length > 0
            ? await supabaseAdmin.from('pagos').select('monto_pagado, estado_verificacion, created_at').in('cuota_id', cuotaIds)
            : { data: [] }

        // Saldo retenido = saldo real pendiente via FIFO (fuente de verdad, igual que el dashboard)
        const { saldoTotalPendiente } = computeVirtualCronograma(todasCuotas || [], pagosResult.data || [])
        const saldo_retenido = saldoTotalPendiente

        // cuotasPendientes solo se necesita para obtener p_cuota_id de referencia en la RPC
        const { data: cuotasPendientes } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id')
            .eq('prestamo_id', solicitud.prestamo_id)
            .neq('estado', 'pagado')
            .limit(1)

        const desembolso_neto = solicitud.monto_solicitado - saldo_retenido;
        // El monto a descontar de la cuenta es el NETO (lo que efectivamente sale del sistema)
        const monto_a_descontar = desembolso_neto > 0 ? desembolso_neto : 0;

        if (cuentaSeleccionada.saldo < monto_a_descontar) {
            return NextResponse.json({ 
                error: `Saldo insuficiente en la cuenta. Se requieren $${monto_a_descontar} (Monto nuevo - Deuda anterior) pero la cuenta solo tiene $${cuentaSeleccionada.saldo}.` 
            }, { status: 400 })
        }

        // Procesar renovación usando la función RPC
        const { data: resultado, error: rpcError } = await supabaseAdmin
            .rpc('procesar_renovacion_aprobada', {
                p_solicitud_id: id,
                p_aprobado_por: user.id
            })

        if (rpcError || !resultado?.success) {
            console.error('Error processing renovation:', rpcError, resultado)
            return NextResponse.json({ error: rpcError?.message || resultado?.error || 'Error procesando renovación' }, { status: 400 })
        }

        const nombreCliente = solicitud.cliente?.nombres || 'Cliente'
        const prestamo_nuevo_id = resultado.prestamo_nuevo_id

        // PASO CONTABLE ATÓMICO: saldo + movimientos + autopago en una sola transacción DB
        const { data: contabilidad, error: contabilidadError } = await supabaseAdmin
            .rpc('registrar_contabilidad_renovacion', {
                p_cuenta_id:            cuentaOrigenId,
                p_cartera_id:           cuentaSeleccionada.cartera_id,
                p_monto_a_descontar:    monto_a_descontar,
                p_saldo_retenido:       saldo_retenido,
                p_monto_solicitado:     solicitud.monto_solicitado,
                p_prestamo_original_id: solicitud.prestamo_id,
                p_prestamo_nuevo_id:    prestamo_nuevo_id,
                p_cuota_id:             cuotasPendientes?.[0]?.id ?? null,
                p_nombre_cliente:       nombreCliente,
                p_registrado_por:       user.id
            })

        if (contabilidadError || !contabilidad?.success) {
            console.error('CRITICAL: Contabilidad RPC failed, rolling back loan:', contabilidadError, contabilidad)
            // La RPC falló sin commitear nada — revertir el préstamo creado por procesar_renovacion_aprobada
            await supabaseAdmin.from('prestamos').delete().eq('id', prestamo_nuevo_id)
            await supabaseAdmin.from('cronograma_cuotas').delete().eq('prestamo_id', prestamo_nuevo_id)
            await supabaseAdmin.from('solicitudes_renovacion').update({ estado_solicitud: 'pre_aprobado' }).eq('id', id)
            await supabaseAdmin.from('prestamos').update({ estado: 'activo' }).eq('id', solicitud.prestamo_id)
            return NextResponse.json({
                error: `Error contable: ${contabilidad?.error || contabilidadError?.message || 'Error desconocido'}. La operación fue revertida.`
            }, { status: 500 })
        }

        // Garantizar que saldo_pendiente_original refleje el valor FIFO correcto.
        // Los RPCs internos pueden calcularlo con lógica diferente; este update es la fuente de verdad.
        await supabaseAdmin
            .from('renovaciones')
            .update({ saldo_pendiente_original: saldo_retenido })
            .eq('prestamo_nuevo_id', prestamo_nuevo_id)

        // Generar cronograma para el nuevo préstamo (lógica Node, fuera de la transacción DB)
        const { error: cronogramaError } = await generarCronogramaNode(supabaseAdmin, prestamo_nuevo_id)
            .then(() => ({ error: null }))
            .catch(err => ({ error: err }));
        if (cronogramaError) {
            console.error('Error generando cronograma (contabilidad ya commiteada):', cronogramaError)
        }

        await supabaseAdmin
            .from('prestamos')
            .update({ bloqueo_cronograma: true })
            .eq('id', prestamo_nuevo_id)

        const clienteNombres = (solicitud.cliente as any)?.nombres || 'Cliente'
        await createFullNotification(solicitud.asesor_id, {
            titulo: '✅ Renovación Aprobada',
            mensaje: `La renovación de ${clienteNombres} ha sido aprobada. Nuevo préstamo creado.`,
            link: `/dashboard/prestamos/${prestamo_nuevo_id}`,
            tipo: 'success'
        })

        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'aprobar_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: {
                prestamo_original: solicitud.prestamo_id,
                prestamo_nuevo: prestamo_nuevo_id,
                monto: solicitud.monto_solicitado,
                desembolso_neto: monto_a_descontar
            }
        })

        await supabaseAdmin.from('tareas_evidencia').insert({
            asesor_id: solicitud.asesor_id,
            prestamo_id: prestamo_nuevo_id,
            tipo: 'renovacion'
        })

        await createFullNotification(solicitud.asesor_id, {
            titulo: '📷 Evidencia Requerida',
            mensaje: `Se requiere foto de evidencia para la renovación de ${clienteNombres}.`,
            link: `/dashboard/tareas?tab=evidencia`,
            tipo: 'warning'
        })

        revalidatePath('/dashboard/renovaciones', 'page')
        revalidatePath('/dashboard/prestamos', 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json({
            message: 'Renovación aprobada exitosamente',
            prestamo_nuevo_id: prestamo_nuevo_id,
            desembolso_neto: monto_a_descontar
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
