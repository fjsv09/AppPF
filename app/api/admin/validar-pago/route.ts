import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Verificación de Rol (Admin o Secretaria)
        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
        if (!perfil || !['admin', 'secretaria'].includes(perfil.rol)) {
            return NextResponse.json({ error: 'No tienes permiso para validar pagos' }, { status: 403 })
        }

        const body = await request.json()
        const { pago_id, accion, motivo, cuenta_id } = body

        if (!pago_id || !accion) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
        }

        // Obtener el pago actual con relaciones
        const { data: pagoRaw, error: pagoErr } = await supabaseAdmin
            .from('pagos')
            .select('*, cronograma_cuotas(id, numero_cuota, prestamos(id, clientes(nombres)))')
            .eq('id', pago_id)
            .single()

        if (pagoErr || !pagoRaw) {
            return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
        }

        const pago = pagoRaw as any; // Cast para evitar errores de TS

        if (pago.estado_verificacion !== 'pendiente') {
            return NextResponse.json({ error: 'El pago ya fue procesado anteriormente' }, { status: 400 })
        }

        if (accion === 'aprobar') {
            const monto = parseFloat(pago.monto_pagado)

            // 1. Cambiar el estado a aprobado
            await supabaseAdmin
                .from('pagos')
                .update({ estado_verificacion: 'aprobado' })
                .eq('id', pago_id)

            // 2. CREAR MOVIMIENTO FINANCIERO
            // Obtenemos la cartera asociada a la cuenta de destino
            const { data: cuentaDestino } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('cartera_id')
                .eq('id', cuenta_id)
                .single()

            const cartera_id = cuentaDestino?.cartera_id || '00000000-0000-0000-0000-000000000000'

            const { data: newMov, error: movErr } = await supabaseAdmin.from('movimientos_financieros').insert({
                cartera_id,
                cuenta_destino_id: cuenta_id || null,
                monto: monto,
                tipo: 'ingreso',
                descripcion: `VALIDACIÓN DIGITAL: Pago de ${pago.cronograma_cuotas?.prestamos?.clientes?.nombres} [${pago.metodo_pago}]`,
                registrado_por: user.id
            }).select('id').single()

            if (movErr) console.error('Error al crear movimiento:', movErr)

            // 3. ACTUALIZAR SALDO DE LA CUENTA DESTINO
            if (cuenta_id) {
                const { error: rpcError } = await supabaseAdmin.rpc('incrementar_saldo_cuenta', {
                    p_cuenta_id: cuenta_id,
                    p_monto: monto
                })

                if (rpcError) {
                    console.error('❌ Error en RPC incrementar_saldo_cuenta:', rpcError)
                    // Fallback: Intento de actualización manual si el RPC falla o no existe
                    const { data: currentAcc } = await supabaseAdmin
                        .from('cuentas_financieras')
                        .select('saldo')
                        .eq('id', cuenta_id)
                        .single()

                    if (currentAcc) {
                        const nuevoSaldo = (parseFloat(currentAcc.saldo?.toString() || '0')) + monto
                        await supabaseAdmin
                            .from('cuentas_financieras')
                            .update({ saldo: nuevoSaldo })
                            .eq('id', cuenta_id)
                        console.log('✅ Saldo actualizado mediante fallback manual')
                    }
                } else {
                    console.log('✅ Saldo actualizado mediante RPC')
                }
            }

            // Notificación al asesor
            if (pago.registrado_por) {
                await createFullNotification(pago.registrado_por, {
                    titulo: 'Pago Aprobado ✅',
                    mensaje: `Tu cobro de S/${pago.monto_pagado} para ${pago.cronograma_cuotas?.prestamos?.clientes?.nombres} ha sido aprobado.`,
                    tipo: 'success',
                    link: '/dashboard/validacion-pagos?tab=historial'
                })
            }

            await supabaseAdmin.from('auditoria').insert({
                usuario_id: user.id,
                accion: 'validar_pago_aprobado',
                tabla_afectada: 'pagos',
                detalle: { pago_id, monto: pago.monto_pagado, cuenta_destino: cuenta_id, mov_id: newMov?.id }
            })

            revalidatePath('/dashboard/validacion-pagos')
            return NextResponse.json({ success: true, message: 'Pago aprobado y fondos registrados en cuenta' })
        }

        if (accion === 'rechazar') {
            const montoRevertir = parseFloat(pago.monto_pagado)

            // 1. Marcar pago como rechazado
            await supabaseAdmin
                .from('pagos')
                .update({ estado_verificacion: 'rechazado' })
                .eq('id', pago_id)

            // 2. Revertir todas las cuotas afectadas por este pago (Waterfall Reversal)
            // Primero intentamos por la tabla de distribución
            const { data: distribuciones } = await supabaseAdmin
                .from('pagos_distribucion')
                .select('cuota_id, monto')
                .eq('pago_id', pago_id)

            if (distribuciones && distribuciones.length > 0) {
                // Revertir cada cuota en la distribución
                for (const dist of distribuciones) {
                    const { data: cuota } = await supabaseAdmin.from('cronograma_cuotas').select('monto_cuota, monto_pagado').eq('id', dist.cuota_id).single()
                    if (cuota) {
                        const nuevoMontoPagado = Math.max(0, parseFloat(cuota.monto_pagado) - parseFloat(dist.monto))
                        const nuevoEstado = nuevoMontoPagado >= (parseFloat(cuota.monto_cuota) - 0.01) ? 'pagado' : (nuevoMontoPagado > 0.01 ? 'parcial' : 'pendiente')

                        await supabaseAdmin
                            .from('cronograma_cuotas')
                            .update({ monto_pagado: nuevoMontoPagado, estado: nuevoEstado })
                            .eq('id', dist.cuota_id)
                    }
                }
            } else {
                // Fallback: Revertir solo la cuota principal (para pagos antiguos o digitales que no tengan distribución)
                const cuotaId = pago.cuota_id
                const { data: cuota } = await supabaseAdmin.from('cronograma_cuotas').select('monto_cuota, monto_pagado').eq('id', cuotaId).single()

                if (cuota) {
                    const nuevoMontoPagado = Math.max(0, parseFloat(cuota.monto_pagado) - montoRevertir)
                    const nuevoEstado = nuevoMontoPagado >= (parseFloat(cuota.monto_cuota) - 0.01) ? 'pagado' : (nuevoMontoPagado > 0.01 ? 'parcial' : 'pendiente')

                    await supabaseAdmin
                        .from('cronograma_cuotas')
                        .update({ monto_pagado: nuevoMontoPagado, estado: nuevoEstado })
                        .eq('id', cuotaId)
                }
            }

            // Notificar al asesor
            if (pago.registrado_por) {
                await createFullNotification(pago.registrado_por, {
                    titulo: '🚨 PAGO RECHAZADO',
                    mensaje: `Se rechazó el voucher de S/${montoRevertir} para ${pago.cronograma_cuotas?.prestamos?.clientes?.nombres}. Motivo: ${motivo}`,
                    tipo: 'alerta',
                    link: '/dashboard/tareas'
                })
            }

            await supabaseAdmin.from('auditoria').insert({
                usuario_id: user.id,
                accion: 'validar_pago_rechazado',
                tabla_afectada: 'pagos',
                detalle: { pago_id, monto: montoRevertir, motivo }
            })

            revalidatePath('/dashboard/validacion-pagos')
            revalidatePath('/dashboard/pagos')
            return NextResponse.json({ success: true, message: 'Pago rechazado y cuota revertida. No hubo afectación contable.' })
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })

    } catch (error: any) {
        console.error('Error en validación:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
