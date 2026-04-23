import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        // 1. Verificar Autenticación y Rol Admin
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()
        
        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden editar cuotas' }, { status: 403 })
        }

        const body = await request.json()
        const { monto_cuota, metodo_pago } = body

        // 2. Obtener datos actuales de la cuota
        const { data: cuotaActual, error: fetchError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('*')
            .eq('id', id)
            .single()
        
        if (fetchError || !cuotaActual) {
            return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
        }

        const nuevoMonto = parseFloat(monto_cuota || cuotaActual.monto_cuota)
        const diffMonto = nuevoMonto - cuotaActual.monto_cuota

        // 3. Si la cuota tiene pagos, ajustar pagos, movimientos y cuentas
        if (parseFloat(cuotaActual.monto_pagado) > 0) {
            // Buscamos la distribución del pago para esta cuota
            const { data: distribucion } = await supabaseAdmin
                .from('pagos_distribucion')
                .select('*, pago:pago_id(*)')
                .eq('cuota_id', id)
                .single()
            
            if (distribucion && distribucion.pago) {
                const pago = distribucion.pago
                // Si cambió el método de pago
                if (metodo_pago && metodo_pago !== pago.metodo_pago) {
                    await supabaseAdmin
                        .from('pagos')
                        .update({ metodo_pago })
                        .eq('id', pago.id)
                }

                // Ajuste de montos si la cuota estaba totalmente pagada o el monto cambió
                // Regla: Si el monto de la cuota cambió, asumimos que el pago también debe ajustarse 
                // para mantener el estado "pagado" (si así estaba).
                if (diffMonto !== 0) {
                    const nuevoMontoPagadoCuota = parseFloat(cuotaActual.monto_pagado) + diffMonto
                    const nuevoMontoPagoGlobal = parseFloat(pago.monto_pagado) + diffMonto

                    // Actualizar Pago y Distribución
                    await supabaseAdmin
                        .from('pagos_distribucion')
                        .update({ monto: nuevoMontoPagadoCuota })
                        .eq('id', distribucion.id)
                    
                    await supabaseAdmin
                        .from('pagos')
                        .update({ monto_pagado: nuevoMontoPagoGlobal })
                        .eq('id', pago.id)

                    // Ajustar Cuenta de Cobranza del Asesor
                    const { data: carteras } = await supabaseAdmin
                        .from('carteras')
                        .select('id')
                        .eq('asesor_id', pago.registrado_por)
                    
                    const carterIds = carteras?.map(c => c.id) || []
                    const { data: cuentaCobranza } = await supabaseAdmin
                        .from('cuentas_financieras')
                        .select('*')
                        .in('cartera_id', carterIds)
                        .eq('tipo', 'cobranzas')
                        .single()
                    
                    if (cuentaCobranza) {
                        await supabaseAdmin
                            .from('cuentas_financieras')
                            .update({ saldo: cuentaCobranza.saldo + diffMonto })
                            .eq('id', cuentaCobranza.id)
                        
                        // Registrar movimiento de ajuste
                        await supabaseAdmin.from('movimientos_financieros').insert({
                            cartera_id: cuentaCobranza.cartera_id,
                            cuenta_origen_id: cuentaCobranza.id,
                            monto: Math.abs(diffMonto),
                            tipo: diffMonto > 0 ? 'ingreso' : 'egreso',
                            descripcion: `Ajuste administrativo cuota #${cuotaActual.numero_cuota} (Préstamo #${cuotaActual.prestamo_id.split('-')[0]})`,
                            registrado_por: user.id
                        })
                    }

                    // Actualizar monto pagado en la cuota
                    await supabaseAdmin
                        .from('cronograma_cuotas')
                        .update({ 
                            monto_cuota: nuevoMonto,
                            monto_pagado: nuevoMontoPagadoCuota,
                            estado: nuevoMontoPagadoCuota >= nuevoMonto ? 'pagado' : 'pendiente'
                        })
                        .eq('id', id)
                } else if (metodo_pago) {
                    // Si solo cambió el método sin monto
                     await supabaseAdmin
                        .from('cronograma_cuotas')
                        .update({ monto_cuota: nuevoMonto })
                        .eq('id', id)
                }
            } else {
                // Si no hay distribución (raro si monto_pagado > 0), solo actualizamos la cuota
                await supabaseAdmin
                    .from('cronograma_cuotas')
                    .update({ monto_cuota: nuevoMonto })
                    .eq('id', id)
            }
        } else {
            // Cuota sin pagos, solo actualizar monto
            await supabaseAdmin
                .from('cronograma_cuotas')
                .update({ monto_cuota: nuevoMonto })
                .eq('id', id)
        }

        // 4. Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'editar_cuota',
            tabla_afectada: 'cronograma_cuotas',
            registro_id: id,
            detalle: { antes: cuotaActual, despues: body, diffMonto }
        })

        return NextResponse.json({ message: 'Cuota actualizada correctamente' })

    } catch (error: any) {
        console.error('ERROR EDITING QUOTA:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
    }
}
