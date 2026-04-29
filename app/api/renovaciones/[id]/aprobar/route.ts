import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'
import { generarCronogramaNode } from '@/lib/financial-logic'

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

        // 1. Obtener cuotas pendientes ANTES de que el RPC las ponga como pagadas
        const { data: cuotasPendientes } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id, monto_cuota, monto_pagado')
            .eq('prestamo_id', solicitud.prestamo_id)
            .neq('estado', 'pagado');

        let saldo_retenido = 0;
        if (cuotasPendientes && cuotasPendientes.length > 0) {
            saldo_retenido = cuotasPendientes.reduce((acc: number, c: any) => 
                acc + (Number(c.monto_cuota) - Number(c.monto_pagado || 0)), 0);
        }

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

        // APLICAR CAMBIOS CONTABLES (Rollback manual si algo sale mal)
        let rollbackInfo = {
            prestamo_nuevo_id: (resultado as any).prestamo_nuevo_id,
            solicitud_id: id,
            prestamo_original_id: solicitud.prestamo_id
        };

        try {
            // 1. Actualizar saldo real de la cuenta
            const { error: errorSaldo } = await supabaseAdmin
                .from('cuentas_financieras')
                .update({ saldo: cuentaSeleccionada.saldo - monto_a_descontar })
                .eq('id', cuentaOrigenId)
            
            if (errorSaldo) throw new Error(`Error actualizando saldo: ${errorSaldo.message}`);

            // 2. Registrar movimientos financieros (Doble asiento)
            const nombreCliente = solicitud.cliente?.nombres || 'Cliente'
            const movimientos = [];
            
            // Registro A: Ingreso (Cobro del saldo retenido)
            if (saldo_retenido > 0) {
                movimientos.push({
                    cartera_id: cuentaSeleccionada.cartera_id,
                    cuenta_origen_id: cuentaOrigenId,
                    monto: saldo_retenido,
                    tipo: 'ingreso',
                    descripcion: `Liquidación deuda previa por renovación (Préstamo #${solicitud.prestamo_id.split('-')[0]}) - Cliente: ${nombreCliente}`,
                    registrado_por: user.id
                });
            }

            // Registro B: Egreso (Desembolso total)
            movimientos.push({
                cartera_id: cuentaSeleccionada.cartera_id,
                cuenta_origen_id: cuentaOrigenId,
                monto: solicitud.monto_solicitado,
                tipo: 'egreso',
                descripcion: `Desembolso total renovación #${resultado.prestamo_nuevo_id?.split('-')[0]} - Cliente: ${nombreCliente}`,
                registrado_por: user.id
            });

            const { error: moveError } = await supabaseAdmin.from('movimientos_financieros').insert(movimientos);
            if (moveError) throw new Error(`Error registrando movimientos: ${moveError.message}`);

            // 3. Generar UN SOLO recibo de pago consolidado para el historial
            // Marcado como autopago para que NO aparezca en auditoría de vouchers
            if (cuotasPendientes && cuotasPendientes.length > 0) {
                const montoTotalLiquidado = cuotasPendientes.reduce((acc: number, c: any) => 
                    acc + (Number(c.monto_cuota) - Number(c.monto_pagado || 0)), 0);

                const { error: pagosError } = await supabaseAdmin.from('pagos').insert({
                    cuota_id: cuotasPendientes[0].id, // Referencia a la primera cuota
                    monto_pagado: montoTotalLiquidado,
                    registrado_por: user.id,
                    es_autopago_renovacion: true,
                    voucher_compartido: true,
                    metodo_pago: 'Renovación'
                });
                if (pagosError) throw new Error(`Error generando recibo: ${pagosError.message}`);
            }

            // 4. Generar cronograma para el nuevo préstamo (Centralizado en Node)
            const { error: cronogramaError } = await generarCronogramaNode(supabaseAdmin, resultado.prestamo_nuevo_id)
                .then(() => ({ error: null }))
                .catch(err => ({ error: err }));
            if (cronogramaError) throw new Error(`Error generando cronograma: ${cronogramaError.message}`);

            // 5. Notificar al asesor
            const clienteNombres = (solicitud.cliente as any)?.nombres || 'Cliente'
            await createFullNotification(solicitud.asesor_id, {
                titulo: '✅ Renovación Aprobada',
                mensaje: `La renovación de ${clienteNombres} ha sido aprobada. Nuevo préstamo creado.`,
                link: `/dashboard/prestamos/${resultado.prestamo_nuevo_id}`,
                tipo: 'success'
            })

            // 6. Auditoría
            await supabaseAdmin.from('auditoria').insert({
                usuario_id: user.id,
                accion: 'aprobar_renovacion',
                tabla_afectada: 'solicitudes_renovacion',
                registro_id: id,
                detalle: { 
                    prestamo_original: solicitud.prestamo_id,
                    prestamo_nuevo: resultado.prestamo_nuevo_id,
                    monto: solicitud.monto_solicitado,
                    desembolso_neto: monto_a_descontar
                }
            })

            // 7. Tarea de Evidencia
            await supabaseAdmin.from('tareas_evidencia').insert({
                asesor_id: solicitud.asesor_id,
                prestamo_id: resultado.prestamo_nuevo_id,
                tipo: 'renovacion'
            })

            // 8. Notificar sobre la evidencia pendiente (Sistema + Push)
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
                prestamo_nuevo_id: resultado.prestamo_nuevo_id,
                desembolso_neto: monto_a_descontar
            })

        } catch (errorOperacion: any) {
            console.error('CRITICAL: Rollback triggered during approval:', errorOperacion);
            
            // INTENTO DE ROLLBACK MANUAL (Limpieza técnica)
            // 1. Borrar préstamo nuevo si se creó
            if (rollbackInfo.prestamo_nuevo_id) {
                await supabaseAdmin.from('prestamos').delete().eq('id', rollbackInfo.prestamo_nuevo_id);
                await supabaseAdmin.from('cronograma_cuotas').delete().eq('prestamo_id', rollbackInfo.prestamo_nuevo_id);
            }
            // 2. Revertir estado de la solicitud
            await supabaseAdmin.from('solicitudes_renovacion').update({ estado_solicitud: 'pre_aprobado' }).eq('id', rollbackInfo.solicitud_id);
            
            // 3. Revertir préstamo original a activo (aproximación, ya que el RPC hizo cambios)
            await supabaseAdmin.from('prestamos').update({ estado: 'activo' }).eq('id', rollbackInfo.prestamo_original_id);

            return NextResponse.json({ 
                error: `Error crítico durante el proceso contable. Se intentó revertir para evitar inconsistencias. Detalle: ${errorOperacion.message}` 
            }, { status: 500 });
        }

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
