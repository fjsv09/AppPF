import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'
import { checkSystemAccess } from '@/utils/systemRestrictions'
import { calculateMetasForUser } from '@/lib/metas-logic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // 0. VERIFICACIÓN DE ACCESO Y HORARIO (Solo para saber si el sistema está abierto)
        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
        if (!perfil) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })

        const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'cuadre');
        if (!access.allowed) {
            return NextResponse.json({ error: access.reason, tipo_error: access.code }, { status: 403 })
        }

        const body = await request.json()
        const { p_monto_efectivo, p_monto_digital, p_total_gastos, p_tipo_cuadre } = body

        const totalEntregar = (parseFloat(p_monto_efectivo) || 0) + (parseFloat(p_monto_digital) || 0)

        // 1. Validación: No permitir cuadres en 0, a menos que sea obligatorio
        const isObligatorio = p_tipo_cuadre === 'parcial_mañana' || p_tipo_cuadre === 'final' || p_tipo_cuadre === 'saldo_pendiente';
        if (totalEntregar <= 0 && !isObligatorio) {
            return NextResponse.json({ error: 'No se puede enviar un cuadre opcional con monto total de 0.00' }, { status: 400 })
        }

        // 2. Validación: No permitir entregar más de lo cobrado
        // Obtenemos la cartera del usuario
        const { data: carteras } = await supabaseAdmin
            .from('carteras')
            .select('id')
            .eq('asesor_id', user.id)

        if (!carteras || carteras.length === 0) {
            return NextResponse.json({ error: 'No tienes carteras asignadas.' }, { status: 400 })
        }

        const carteraId = carteras[0].id

        const { data: account } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('saldo')
            .eq('cartera_id', carteraId)
            .eq('tipo', 'cobranzas')
            .single()

        const totalCobrado = parseFloat(account?.saldo || '0')

        if (totalEntregar > totalCobrado) {
             return NextResponse.json({ 
                error: `El monto total (S/ ${totalEntregar.toFixed(2)}) no puede exceder el monto cobrado (S/ ${totalCobrado.toFixed(2)})` 
             }, { status: 400 })
        }

        // 2.5 Validación: No permitir cuadres regulares si hay deuda atrasada (SALDO PENDIENTE)
        if (p_tipo_cuadre !== 'saldo_pendiente') {
            const { checkAdvisorBlocked } = await import('@/utils/checkAdvisorBlocked')
            const blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id)
            if (blockInfo.code === 'SALDO_PENDIENTE') {
                return NextResponse.json({ 
                    error: blockInfo.reason 
                }, { status: 403 })
            }
        }

        // 3. Validación: No permitir múltiples cuadres pendientes
        const { data: pending, error: pendingError } = await supabaseAdmin
            .from('cuadres_diarios')
            .select('id')
            .eq('asesor_id', user.id)
            .eq('estado', 'pendiente')
            .limit(1)

        if (pendingError) throw pendingError
        if (pending && pending.length > 0) {
            return NextResponse.json({ error: 'Ya tienes una solicitud de cuadre pendiente de aprobación.' }, { status: 400 })
        }

        // 3. Ejecutar RPC para crear el cuadre en la DB
        const { data: cuadreId, error: rpcError } = await supabase.rpc('solicitar_cuadre_db', {
            p_asesor_id: user.id,
            p_monto_efectivo,
            p_monto_digital,
            p_total_gastos,
            p_tipo_cuadre
        })

        if (rpcError) throw rpcError

        // 2. Notificar a los administradores (DB + Push de escritorio)
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')
            .eq('activo', true)

        const totalEntregado = (parseFloat(p_monto_efectivo) || 0) + (parseFloat(p_monto_digital) || 0)
        
        // Obtenemos el nombre del asesor para el mensaje
        const { data: perfilAsesor } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo')
            .eq('id', user.id)
            .single()

        const nombreAsesor = perfilAsesor?.nombre_completo || 'Un asesor'

        if (admins && admins.length > 0) {
            console.info(`[CUADRE NOTIF] Notifying ${admins.length} active admins about the request from ${nombreAsesor}.`);
            for (const admin of admins) {
                await createFullNotification(admin.id, {
                    titulo: '📅 Nuevo Cuadre Solicitado',
                    mensaje: `${nombreAsesor} ha solicitado un cuadre por S/ ${totalEntregado.toFixed(2)}.`,
                    link: '/dashboard/admin/cuadres',
                    tipo: 'warning'
                })
            }

            // [NUEVO] Broadcast real-time a todos los canales escuchando por actualizaciones
            const channel = supabaseAdmin.channel('cuadres-sync-global')
            await channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                        type: 'broadcast',
                        event: 'new_cuadre',
                        payload: { asesor_id: user.id }
                    })
                    console.log('[BROADCAST] Evento de nuevo cuadre enviado.')
                    // Remover canal después de enviar
                    supabaseAdmin.removeChannel(channel)
                }
            })
        } else {
            console.warn(`[CUADRE NOTIF] No active administrators found to notify for cuadre request from ${nombreAsesor}. Check that 'rol' is 'admin' and 'activo' is true in perfiles table.`);
        }

        let bonusesToPayResult: any[] = [];

        // ==========================================
        // 3. EVALUACIÓN DE METAS (CIERRE DE DÍA)
        // ==========================================
        // Solamente disparamos bonos cuando el cuadre es "final" o "parcial_mañana" si aplican
        if (p_tipo_cuadre === 'final') {
            try {
                console.info(`[GATILLO METAS] Iniciando evaluación formal de metas post-cuadre_final para ${user.id}`);
                const { bonusesToPay, stats } = await calculateMetasForUser(supabaseAdmin, user.id, false);
                bonusesToPayResult = bonusesToPay || [];

                console.info(`[GATILLO METAS] Stats calculados:`, JSON.stringify(stats));
                console.info(`[GATILLO METAS] Metas alcanzadas para insertar: ${bonusesToPay.length}`);

                if (bonusesToPay && bonusesToPay.length > 0) {
                    // Mapear a estructura DB validando que no estén duplicados (upsert)
                    const insertPayload = bonusesToPay.map(bono => ({
                        meta_id: bono.meta_id,
                        asesor_id: user.id,
                        monto: bono.monto,
                        fecha: bono.fecha,
                        estado: 'pendiente',
                        detalles_calculo: { formula: bono.motivo, valor: bono.monto, statsVigentes: stats }
                    }))

                    const insertedBonos = [];
                    const errors = [];

                    for (const bonoPayload of insertPayload) {
                        const { data, error } = await supabaseAdmin
                            .from('bonos_pagados')
                            .insert(bonoPayload)
                            .select();
                        
                        if (error) {
                            if (error.code === '23505') {
                                console.info(`[GATILLO METAS] El bono ${bonoPayload.meta_id} ya existía para hoy. Saltando.`);
                            } else {
                                console.error(`[GATILLO METAS] Error insertando bono ${bonoPayload.meta_id}:`, error);
                                errors.push(error);
                            }
                        } else if (data && data.length > 0) {
                            insertedBonos.push(data[0]);
                        }
                    }
                        
                    if (insertedBonos.length > 0) {
                        const totalBonoSoles = insertedBonos.reduce((acc, curr) => acc + curr.monto, 0);
                        const nombresBonos = bonusesToPay.map(b => b.nombre_meta).join(', ');
                        console.info(`[GATILLO METAS] Inserción exitosa. Total S/ ${totalBonoSoles}.`);

                        // Notificación consolidada de metas para los Admin
                        if (admins && admins.length > 0) {
                            console.info(`[GATILLO METAS] Notificando a ${admins.length} administradores.`);
                            for (const admin of admins) {
                                try {
                                    await createFullNotification(admin.id, {
                                        titulo: '🏆 Cierre de Metas Alcanzado',
                                        mensaje: `${nombreAsesor} cerró su día y alcanzó sus metas: ${nombresBonos}. Total de bono para validación: S/ ${totalBonoSoles}.`,
                                        link: '/dashboard/admin/metas?tab=liquidaciones',
                                        tipo: 'success'
                                    })
                                } catch (notifErr) {
                                    console.error(`[GATILLO METAS] Error notificando al admin ${admin.id}:`, notifErr);
                                }
                            }
                        }
                    } else {
                        if (errors.length > 0) {
                            console.error('[GATILLO METAS] Errores durante la inserción de bonos:', errors);
                        } else {
                            console.info(`[GATILLO METAS] No se encontraron nuevas metas alcanzadas para procesar hoy.`);
                        }
                    }
                }
            } catch (evError) {
                console.error('[GATILLO METAS] Excepción durante evaluación de Cierre Final:', evError);
            }
        }

        return NextResponse.json({ 
            success: true, 
            id: cuadreId,
            evaluacion_metas: {
                procesado: p_tipo_cuadre === 'final',
                bonos_encontrados: bonusesToPayResult.length
            }
        })

    } catch (e: any) {
        console.error('Error solicitando cuadre:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
