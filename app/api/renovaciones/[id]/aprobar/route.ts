import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

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
        let cuentaSeleccionada = null;
        let monto_a_descontar = solicitud.monto_solicitado;

        if (cuentaOrigenId) {
            const { data: cuenta } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('cartera_id, saldo')
                .eq('id', cuentaOrigenId)
                .single()

            if (!cuenta) {
                return NextResponse.json({ error: 'La cuenta de origen seleccionada no existe.' }, { status: 404 })
            }

            // Calcular saldo anterior (deuda retenida)
            const { data: prestamoAnterior } = await supabaseAdmin
                .from('prestamos')
                .select(`
                    id, 
                    cronograma_cuotas (monto_cuota)
                `)
                .eq('id', solicitud.prestamo_id)
                .eq('cronograma_cuotas.estado', 'pendiente');

            let saldo_retenido = 0;
            if (prestamoAnterior && prestamoAnterior.length > 0) {
                const cuotasPendientes = prestamoAnterior[0].cronograma_cuotas || [];
                saldo_retenido = cuotasPendientes.reduce((acc: number, c: any) => acc + Number(c.monto_cuota), 0);
            }

            const desembolso_neto = solicitud.monto_solicitado - saldo_retenido;
            monto_a_descontar = desembolso_neto > 0 ? desembolso_neto : solicitud.monto_solicitado;

            if (cuenta.saldo < monto_a_descontar) {
                return NextResponse.json({ 
                    error: `Saldo insuficiente en la cuenta. Se requieren $${monto_a_descontar} (Monto menos saldo retenido) pero la cuenta solo tiene $${cuenta.saldo}.` 
                }, { status: 400 })
            }
            
            cuentaSeleccionada = cuenta;
        }

        // Procesar renovación usando la función RPC
        const { data: resultado, error: rpcError } = await supabaseAdmin
            .rpc('procesar_renovacion_aprobada', {
                p_solicitud_id: id,
                p_aprobado_por: user.id
            })

        if (rpcError) {
            console.error('Error processing renovation:', rpcError)
            return NextResponse.json({ error: rpcError.message }, { status: 400 })
        }

        if (!resultado.success) {
            return NextResponse.json({ error: 'Error procesando renovación' }, { status: 400 })
        }

        // ===== DESEMBOLSAR PRÉSTAMO (Deducir de cartera global) =====
        if (cuentaOrigenId && cuentaSeleccionada) {
            // Actualizar saldo
            await supabaseAdmin
                .from('cuentas_financieras')
                .update({ saldo: cuentaSeleccionada.saldo - monto_a_descontar })
                .eq('id', cuentaOrigenId)
            
            // Registrar movimiento financiero
            const nombreCliente = solicitud.cliente?.nombres || 'Cliente'
            await supabaseAdmin
                .from('movimientos_financieros')
                .insert({
                    cartera_id: cuentaSeleccionada.cartera_id,
                    cuenta_origen_id: cuentaOrigenId,
                    monto: monto_a_descontar,
                    tipo: 'egreso',
                    descripcion: `Desembolso neto por renovación #${resultado.prestamo_nuevo_id?.split('-')[0]} - Cliente: ${nombreCliente}`,
                    registrado_por: user.id
                })
        }


        // Liquidar cuotas pendientes del préstamo anterior (Old Loan)
        // Esto asegura que la deuda se considere saldada por la renovación
        // Liquidar cuotas pendientes del préstamo anterior (Old Loan)
        // 1. Obtener cuotas pendientes para saber el monto exacto a liquidar
        const { data: cuotasPendientes } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id, monto_cuota')
            .eq('prestamo_id', solicitud.prestamo_id)
            .neq('estado', 'pagado')

        if (cuotasPendientes && cuotasPendientes.length > 0) {
            console.log(`Liquidando ${cuotasPendientes.length} cuotas del préstamo ${solicitud.prestamo_id}`)
            
            // 2. Actualizar cada cuota para marcarla como pagada y saldar el monto
            // Usamos Promise.all para hacerlo en paralelo
            const updatePromises = cuotasPendientes.map(cuota => 
                supabaseAdmin
                    .from('cronograma_cuotas')
                    .update({ 
                        estado: 'pagado', 
                        fecha_pago: new Date().toISOString(),
                        monto_pagado: cuota.monto_cuota // Saldar deuda
                    })
                    .eq('id', cuota.id)
            )

            await Promise.all(updatePromises)
        }

        // Generar cronograma para el nuevo préstamo
        const { error: cronogramaError } = await supabaseAdmin.rpc('generar_cronograma_db', {
            p_prestamo_id: resultado.prestamo_nuevo_id
        })

        if (cronogramaError) {
            console.error('Error generating cronograma:', cronogramaError)
            // No hacemos rollback porque la renovación ya se procesó, pero registramos el error
            await supabaseAdmin.from('alertas').insert({
                tipo_alerta: 'error_cronograma',
                descripcion: `Error generando cronograma para préstamo renovado ${resultado.prestamo_nuevo_id}: ${cronogramaError.message}`,
                prestamo_id: resultado.prestamo_nuevo_id,
                usuario_id: user.id
            })
        }

        // Notificar al asesor
        await createFullNotification(solicitud.asesor_id, {
            titulo: '✅ Renovación Aprobada',
            mensaje: `La renovación por $${solicitud.monto_solicitado} ha sido aprobada. Nuevo préstamo creado.`,
            link: `/dashboard/prestamos/${resultado.prestamo_nuevo_id}`,
            tipo: 'success'
        })

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'aprobar_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: id,
            detalle: { 
                prestamo_original: solicitud.prestamo_id,
                prestamo_nuevo: resultado.prestamo_nuevo_id,
                monto: solicitud.monto_solicitado,
                saldo_anterior: resultado.saldo_anterior
            }
        })

        // ====== CREAR TAREA DE EVIDENCIA ======
        const { data: nuevaTarea } = await supabaseAdmin.from('tareas_evidencia').insert({
            asesor_id: solicitud.asesor_id,
            prestamo_id: resultado.prestamo_nuevo_id,
            tipo: 'renovacion'
        }).select('id').single()

        // Notificar al asesor sobre la nueva tarea
        await createFullNotification(solicitud.asesor_id, {
            titulo: '📸 Tarea Pendiente: Evidencia',
            mensaje: `Sube la foto o contrato para la renovación aprobada de $${solicitud.monto_solicitado}.`,
            link: '/dashboard/tareas',
            tipo: 'warning'
        })

        revalidatePath('/dashboard/renovaciones', 'page')
        revalidatePath('/dashboard/prestamos', 'page')
        revalidatePath('/dashboard', 'layout')

        return NextResponse.json({
            message: 'Renovación aprobada exitosamente',
            prestamo_nuevo_id: resultado.prestamo_nuevo_id,
            saldo_anterior: resultado.saldo_anterior
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
