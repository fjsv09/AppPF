// Edge Function: Calcular Mora Automáticamente
// Este job debe ejecutarse diariamente vía cron
// supabase functions deploy calcular-mora --schedule "0 6 * * *"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Prestamo {
    id: string
    estado: string
    estado_mora: string
    fecha_fin: string
    monto: number
    interes: number
}

interface Cuota {
    id: string
    prestamo_id: string
    fecha_vencimiento: string
    monto_cuota: number
    monto_pagado: number
    estado: string
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const hoy = new Date()
        const hoyStr = hoy.toISOString().split('T')[0]
        
        console.log(`[MORA JOB] Ejecutando cálculo de mora - ${hoyStr}`)

        // Obtener préstamos activos, cpp o morosos (no finalizados)
        const { data: prestamos, error: prestamosError } = await supabaseAdmin
            .from('prestamos')
            .select('id, estado, estado_mora, fecha_fin, monto, interes')
            .in('estado', ['activo'])
            .in('estado_mora', ['normal', 'cpp', 'moroso'])

        if (prestamosError) {
            console.error('[MORA JOB] Error fetching prestamos:', prestamosError)
            throw prestamosError
        }

        console.log(`[MORA JOB] Préstamos a evaluar: ${prestamos?.length || 0}`)

        const resultados = {
            evaluados: 0,
            actualizados: 0,
            errores: 0,
            cambios: [] as any[]
        }

        for (const prestamo of prestamos || []) {
            resultados.evaluados++

            try {
                // Obtener cuotas del préstamo
                const { data: cuotas, error: cuotasError } = await supabaseAdmin
                    .from('cronograma_cuotas')
                    .select('id, prestamo_id, fecha_vencimiento, monto_cuota, monto_pagado, estado')
                    .eq('prestamo_id', prestamo.id)
                    .order('fecha_vencimiento', { ascending: true })

                if (cuotasError) {
                    console.error(`[MORA JOB] Error cuotas prestamo ${prestamo.id}:`, cuotasError)
                    resultados.errores++
                    continue
                }

                // Calcular cuotas vencidas (no pagadas y fecha < hoy)
                const cuotasVencidas = (cuotas || []).filter(c => 
                    c.estado !== 'pagado' && 
                    c.monto_pagado < c.monto_cuota &&
                    new Date(c.fecha_vencimiento) < hoy
                )

                const diasAtraso = cuotasVencidas.length

                // Calcular saldo pendiente
                const saldoPendiente = (cuotas || []).reduce((acc, c) => 
                    acc + (c.monto_cuota - (c.monto_pagado || 0)), 0
                )

                // Obtener umbrales de configuración
                const { data: configData } = await supabaseAdmin
                    .from('configuracion_sistema')
                    .select('clave, valor')
                    .in('clave', ['umbral_cpp_cuotas', 'umbral_moroso_cuotas'])

                const minCpp = parseInt(configData?.find(c => c.clave === 'umbral_cpp_cuotas')?.valor || '3')
                const minMoroso = parseInt(configData?.find(c => c.clave === 'umbral_moroso_cuotas')?.valor || '6')

                // Determinar nuevo estado
                let nuevoEstadoMora = 'normal'
                let motivo = ''

                // Regla 1: Si saldo == 0, préstamo finalizado
                if (saldoPendiente <= 0) {
                    nuevoEstadoMora = 'finalizado'
                    motivo = 'Préstamo pagado completamente'
                    
                    // Actualizar estado del préstamo a finalizado
                    await supabaseAdmin
                        .from('prestamos')
                        .update({ estado: 'finalizado', estado_mora: 'normal' })
                        .eq('id', prestamo.id)

                    // Registrar en historial
                    await supabaseAdmin.rpc('registrar_cambio_estado', {
                        p_prestamo_id: prestamo.id,
                        p_estado_anterior: prestamo.estado,
                        p_estado_nuevo: 'finalizado',
                        p_dias_atraso: 0,
                        p_motivo: motivo,
                        p_responsable: 'sistema'
                    })

                    resultados.cambios.push({
                        prestamo_id: prestamo.id,
                        cambio: 'activo -> finalizado',
                        motivo
                    })
                    resultados.actualizados++
                    continue
                }

                // Regla 2: Fecha fin pasada con saldo > 0 -> VENCIDO
                if (new Date(prestamo.fecha_fin) < hoy && saldoPendiente > 0) {
                    nuevoEstadoMora = 'vencido'
                    motivo = `Contrato vencido con saldo pendiente de $${saldoPendiente.toFixed(2)}`
                }
                // Regla 3: minMoroso+ cuotas de atraso -> MOROSO (según umbral_moroso_cuotas)
                else if (diasAtraso >= minMoroso) {
                    nuevoEstadoMora = 'moroso'
                    motivo = `${diasAtraso} cuotas vencidas sin pagar`
                }
                // Regla 4: minCpp+ cuotas de atraso -> CPP (según umbral_cpp_cuotas)
                else if (diasAtraso >= minCpp && diasAtraso < minMoroso) {
                    nuevoEstadoMora = 'cpp'
                    motivo = `${diasAtraso} cuotas vencidas - Cartera Pesada Potencial`
                }

                // Si hay cambio de estado, actualizar
                if (nuevoEstadoMora !== prestamo.estado_mora) {
                    const { error: updateError } = await supabaseAdmin
                        .from('prestamos')
                        .update({ estado_mora: nuevoEstadoMora })
                        .eq('id', prestamo.id)

                    if (updateError) {
                        console.error(`[MORA JOB] Error updating prestamo ${prestamo.id}:`, updateError)
                        resultados.errores++
                        continue
                    }

                    // Registrar en historial
                    await supabaseAdmin.rpc('registrar_cambio_estado', {
                        p_prestamo_id: prestamo.id,
                        p_estado_anterior: prestamo.estado_mora,
                        p_estado_nuevo: nuevoEstadoMora,
                        p_dias_atraso: diasAtraso,
                        p_motivo: motivo,
                        p_responsable: 'sistema'
                    })

                    // Notificar a supervisores y admin si es moroso o vencido
                    if (['moroso', 'vencido'].includes(nuevoEstadoMora)) {
                        const { data: admins } = await supabaseAdmin
                            .from('perfiles')
                            .select('id')
                            .in('rol', ['admin', 'supervisor'])

                        for (const admin of admins || []) {
                            await supabaseAdmin.rpc('crear_notificacion', {
                                p_usuario_id: admin.id,
                                p_titulo: `⚠️ Préstamo ${nuevoEstadoMora.toUpperCase()}`,
                                p_mensaje: motivo,
                                p_link: `/dashboard/prestamos/${prestamo.id}`,
                                p_tipo: 'warning'
                            })
                        }
                    }

                    resultados.cambios.push({
                        prestamo_id: prestamo.id,
                        cambio: `${prestamo.estado_mora} -> ${nuevoEstadoMora}`,
                        dias_atraso: diasAtraso,
                        motivo
                    })
                    resultados.actualizados++

                    console.log(`[MORA JOB] Préstamo ${prestamo.id}: ${prestamo.estado_mora} -> ${nuevoEstadoMora}`)
                }

            } catch (err) {
                console.error(`[MORA JOB] Error procesando prestamo ${prestamo.id}:`, err)
                resultados.errores++
            }
        }

        console.log(`[MORA JOB] Completado. Evaluados: ${resultados.evaluados}, Actualizados: ${resultados.actualizados}, Errores: ${resultados.errores}`)

        return new Response(
            JSON.stringify({
                success: true,
                fecha: hoyStr,
                resultados
            }),
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200 
            }
        )

    } catch (error: any) {
        console.error('[MORA JOB] Error fatal:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500 
            }
        )
    }
})
