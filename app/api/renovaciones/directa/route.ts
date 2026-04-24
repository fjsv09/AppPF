import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { checkSystemAccess } from '@/utils/systemRestrictions'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// POST - Crear y aprobar instantaneamente refinanciacion admin
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Verificar perfil Admin Estrictamente
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden realizar esta acción' }, { status: 403 })
        }

        // VERIFICACIÓN CENTRALIZADA DE ACCESO Y REGLAS DE NEGOCIO
        const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'renovacion');
        if (!access.allowed) {
            return NextResponse.json({ 
                error: access.reason,
                tipo_error: access.code,
                config: access.config
            }, { status: 403 });
        }

        const body = await request.json()
        const { 
            prestamo_id,
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            score_al_solicitar,
            monto_minimo_permitido,
            monto_maximo_permitido,
            razon_limite,
            health_score,
            reputation_score,
            detalles_score,
            reputation_data,
            cuenta_id
        } = body

        if (!prestamo_id || monto_solicitado === undefined || interes === undefined || !cuotas || !modalidad || !fecha_inicio_propuesta || !cuenta_id) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
        }

        if (monto_maximo_permitido && monto_solicitado > monto_maximo_permitido) {
            return NextResponse.json({ error: `El monto solicitado excede el límite máximo permitido ($${monto_maximo_permitido})` }, { status: 400 })
        }
        
        if (monto_minimo_permitido && monto_solicitado < monto_minimo_permitido) {
            return NextResponse.json({ error: `El monto solicitado es menor al límite mínimo permitido ($${monto_minimo_permitido})` }, { status: 400 })
        }

        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select(`
                cliente_id, 
                created_by
            `)
            .eq('id', prestamo_id)
            .single()

        if (!prestamoInfo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        // ===== 1. PRE-VALIDAR CUENTA Y SALDO ANTES DE CREAR NUEVO PRÉSTAMO =====
        const { data: cuenta } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('cartera_id, saldo')
            .eq('id', cuenta_id)
            .single()

        if (!cuenta) {
            return NextResponse.json({ error: 'La cuenta seleccionada no existe.' }, { status: 404 })
        }

        // Obtener cuotas pendientes para saber cuánto debemos retener
        const { data: cuotasPendientes } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id, monto_cuota, monto_pagado')
            .eq('prestamo_id', prestamo_id)
            .neq('estado', 'pagado')

        let saldo_retenido = 0;
        if (cuotasPendientes && cuotasPendientes.length > 0) {
            saldo_retenido = cuotasPendientes.reduce((acc: number, c: any) => {
                const pagado = Number(c.monto_pagado || 0);
                return acc + (Number(c.monto_cuota) - pagado);
            }, 0);
        }

        const desembolso_neto = monto_solicitado - saldo_retenido;
        const monto_a_descontar = desembolso_neto; // puede ser negativo o 0

        if (cuenta.saldo < monto_a_descontar) {
            return NextResponse.json({ 
                error: `Saldo insuficiente en la cuenta. Se requieren $${monto_a_descontar} (Nuevo Préstamo - Deuda) pero la cuenta solo tiene $${cuenta.saldo}.` 
            }, { status: 400 })
        }

        // 2. Crear solicitud preaprobada automáticamente (AHORA QUE SABEMOS QUE HAY FONDOS)
        const solicitudData = {
            prestamo_id,
            cliente_id: prestamoInfo.cliente_id,
            asesor_id: user.id, // Admin como asesor en este caso
            monto_solicitado,
            interes,
            cuotas,
            modalidad,
            fecha_inicio_propuesta,
            estado_solicitud: 'pre_aprobado',
            requiere_excepcion: true,
            tipo_excepcion: 'mora_critica_admin',
            score_al_solicitar: health_score || score_al_solicitar,
            reputation_score_al_solicitar: reputation_score || 0,
            monto_minimo_permitido: monto_minimo_permitido || 0,
            monto_maximo_permitido: monto_maximo_permitido || 0,
            razon_limite: razon_limite || 'Ajuste directo admin',
            resumen_comportamiento: {
                health_evaluation: detalles_score || {},
                reputation_evaluation: reputation_data || {},
                health_score: health_score || score_al_solicitar,
                reputation_score: reputation_score || 0
            }
        }

        const { data: solicitud, error: createError } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .insert(solicitudData)

            .select()
            .single()

        if (createError) {
            console.error('Error creating direct solicitud:', createError)
            return NextResponse.json({ error: createError.message }, { status: 400 })
        }

        // 2. Procesar renovación (cierra anterior, crea nuevo)
        const { data: resultado, error: rpcError } = await supabaseAdmin
            .rpc('procesar_renovacion_aprobada', {
                p_solicitud_id: solicitud.id,
                p_aprobado_por: user.id
            })

        if (rpcError || !resultado?.success) {
            console.error('Error processing direct renovation:', rpcError, resultado)
            // ROLLBACK: Borrar la solicitud fallida para que no se quede bloqueada
            await supabaseAdmin.from('solicitudes_renovacion').delete().eq('id', solicitud.id);
            return NextResponse.json({ error: rpcError?.message || resultado?.error || 'Error al procesar en base de datos' }, { status: 400 })
        }

        // --- INICIO DE BLOQUE TRANSACCIONAL (CONTABLE) ---
        let rollbackInfo = {
            prestamo_nuevo_id: resultado.prestamo_nuevo_id,
            solicitud_id: solicitud.id,
            prestamo_original_id: prestamo_id
        };

        try {
            await supabaseAdmin
                .from('prestamos')
                .update({ 
                    estado: 'refinanciado',
                    estado_mora: 'castigado'
                })
                .eq('id', prestamo_id)

            await supabaseAdmin
                .from('historial_prestamos')
                .update({ estado_nuevo: 'refinanciado' })
                .eq('prestamo_id', prestamo_id)
                .eq('estado_nuevo', 'renovado')

            // 3. Liquidar cuotas pendientes y actualizar saldo
            // Actualizar el saldo de la cartera
            const { error: saldoError } = await supabaseAdmin
                .from('cuentas_financieras')
                .update({ saldo: cuenta.saldo - monto_a_descontar })
                .eq('id', cuenta_id)
            if (saldoError) throw new Error(`Error actualizando saldo: ${saldoError.message}`);

            // 4. Trazabilidad del dinero (DOS REGISTROS EXPLICITOS)
            const nombreC = (await supabaseAdmin.from('clientes').select('nombres').eq('id', prestamoInfo.cliente_id).single()).data?.nombres || 'Cliente';
            const movimientos = [];
            if (saldo_retenido > 0) {
                movimientos.push({
                    cartera_id: cuenta.cartera_id,
                    cuenta_origen_id: cuenta_id,
                    monto: saldo_retenido,
                    tipo: 'ingreso',
                    descripcion: `Liquidación deuda por refinanciamiento directo (Préstamo #${prestamo_id.split('-')[0]}) - Cliente: ${nombreC}`,
                    registrado_por: user.id
                });
            }
            movimientos.push({
                cartera_id: cuenta.cartera_id,
                cuenta_origen_id: cuenta_id,
                monto: monto_solicitado,
                tipo: 'egreso',
                descripcion: `Desembolso total refinanciamiento directo #${resultado.prestamo_nuevo_id?.split('-')[0]} - Cliente: ${nombreC}`,
                registrado_por: user.id
            });
            const { error: moveError } = await supabaseAdmin.from('movimientos_financieros').insert(movimientos);
            if (moveError) throw new Error(`Error registrando movimientos: ${moveError.message}`);

            // 5. Historial de Pagos - UN SOLO registro consolidado
            if (cuotasPendientes && cuotasPendientes.length > 0) {
                const montoTotalLiquidado = cuotasPendientes.reduce((acc: number, c: any) => 
                    acc + (Number(c.monto_cuota) - Number(c.monto_pagado || 0)), 0);

                const { error: pagosError } = await supabaseAdmin.from('pagos').insert({
                    cuota_id: cuotasPendientes[0].id,
                    monto_pagado: montoTotalLiquidado,
                    registrado_por: user.id,
                    es_autopago_renovacion: true,
                    voucher_compartido: true,
                    metodo_pago: 'Refinanciamiento'
                });
                if (pagosError) throw new Error(`Error generando recibo: ${pagosError.message}`);

                // El RPC ya debería haber marcado las cuotas como pagadas, pero nos aseguramos del saldo pagado
                const updatePromises = cuotasPendientes.map(cuota => 
                    supabaseAdmin.from('cronograma_cuotas').update({ 
                        monto_pagado: cuota.monto_cuota,
                        fecha_pago: new Date().toISOString()
                    }).eq('id', cuota.id)
                )
                await Promise.all(updatePromises)
            }

            // 6. Generar cronograma nuevo
            const { error: cronogramaError } = await supabaseAdmin.rpc('generar_cronograma_db', {
                p_prestamo_id: resultado.prestamo_nuevo_id
            })
            if (cronogramaError) throw new Error(`Error generando cronograma: ${cronogramaError.message}`);

            // 7. Auditoría y Tareas
            await supabaseAdmin.from('auditoria').insert({
                usuario_id: user.id,
                accion: 'refinanciar_directo_admin',
                tabla_afectada: 'prestamos',
                registro_id: resultado.prestamo_nuevo_id,
                detalle: { prestamo_original: prestamo_id, monto: monto_solicitado }
            })

            // Obtener el asesor del cliente para la tarea
            const { data: clienteInfo } = await supabaseAdmin
                .from('clientes')
                .select('asesor_id')
                .eq('id', prestamoInfo!.cliente_id)
                .single()

            const asesorResponsable = clienteInfo?.asesor_id || prestamoInfo?.created_by || user.id;

            const { error: errorTarea } = await supabaseAdmin.from('tareas_evidencia').insert({
                asesor_id: asesorResponsable,
                prestamo_id: resultado.prestamo_nuevo_id,
                tipo: 'refinanciacion'
            })

            if (errorTarea) {
                console.error('Error creando tarea de evidencia:', errorTarea)
            }

            if (asesorResponsable) {
                await createFullNotification(asesorResponsable, {
                    titulo: '📷 Evidencia Requerida',
                    mensaje: `Se requiere foto de evidencia para el refinanciamiento de ${nombreC}.`,
                    link: '/dashboard/tareas?tab=evidencia',
                    tipo: 'warning'
                }).catch(() => {});
            }

            revalidatePath('/dashboard/prestamos')
            revalidatePath('/dashboard/renovaciones')

            return NextResponse.json({ 
                success: true,
                prestamo_nuevo_id: resultado.prestamo_nuevo_id,
                message: 'Refinanciación administrativa completada' 
            }, { status: 200 })

        } catch (errorOperacion: any) {
            console.error('CRITICAL: Rollback triggered during direct refinancing:', errorOperacion);
            // ROLLBACK MANUAL
            if (rollbackInfo.prestamo_nuevo_id) {
                await supabaseAdmin.from('prestamos').delete().eq('id', rollbackInfo.prestamo_nuevo_id);
                await supabaseAdmin.from('cronograma_cuotas').delete().eq('prestamo_id', rollbackInfo.prestamo_nuevo_id);
            }
            await supabaseAdmin.from('prestamos').update({ estado: 'activo' }).eq('id', prestamo_id);
            await supabaseAdmin.from('solicitudes_renovacion').delete().eq('id', rollbackInfo.solicitud_id);

            return NextResponse.json({ error: `Error durante el proceso contable. Rollback ejecutado: ${errorOperacion.message}` }, { status: 500 });
        }

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
