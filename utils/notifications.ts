import { createClient } from '@supabase/supabase-js'

/**
 * Notifica al cliente por WhatsApp sobre un pago realizado.
 * Esta función está diseñada para ser extensible a diferentes proveedores (Twilio, Whapi, Meta, etc.)
 */
export async function notificarPagoCliente(pagoId: string) {
    // 1. Inicializar cliente admin para obtener datos del pago y cliente
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        // 2. Obtener toda la información necesaria para el mensaje
        const { data: pago, error } = await supabaseAdmin
            .from('pagos')
            .select(`
                id,
                monto_pagado,
                created_at,
                cronograma_cuotas (
                    numero_cuota,
                    prestamos (
                        id,
                        monto,
                        clientes (
                            nombres,
                            telefono
                        )
                    )
                )
            `)
            .eq('id', pagoId)
            .single()

        if (error || !pago) {
            console.error('[NOTIFICACION] Error al obtener datos del pago:', error)
            return { success: false, error: 'No se pudo obtener la información del pago' }
        }

        const info = pago as any
        const clienteNom = info.cronograma_cuotas?.prestamos?.clientes?.nombres
        const clienteTel = info.cronograma_cuotas?.prestamos?.clientes?.telefono
        const monto = info.monto_pagado
        const cuotaNum = info.cronograma_cuotas?.numero_cuota
        const prestamoId = info.cronograma_cuotas?.prestamos?.id
        const fecha = new Date(info.created_at).toLocaleString('es-PE', { 
            timeZone: 'America/Lima',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })

        if (!clienteTel) {
            console.warn(`[NOTIFICACION] Cliente ${clienteNom} no tiene teléfono registrado.`)
            return { success: false, error: 'Cliente sin teléfono' }
        }

        // 3. Calcular saldo pendiente (opcional pero muy útil para transparencia)
        const { data: resumenDeuda } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('monto_cuota, monto_pagado')
            .eq('prestamo_id', prestamoId)

        let saldoPendiente = 0
        if (resumenDeuda) {
            saldoPendiente = resumenDeuda.reduce((acc: number, curr: any) => 
                acc + (Number(curr.monto_cuota) - Number(curr.monto_pagado)), 0)
        }

        // 4. Construir el mensaje
        const mensaje = 
`✅ *NOTIFICACIÓN DE PAGO*
Hola *${clienteNom}*, hemos registrado tu pago correctamente.

💰 *Monto:* $${monto.toFixed(2)}
🔢 *Cuota:* #${cuotaNum}
📅 *Fecha:* ${fecha}
📉 *Saldo Restante:* $${saldoPendiente.toFixed(2)}

¡Gracias por tu puntualidad! Si no realizaste este pago, contáctanos de inmediato.`

        console.log(`[NOTIFICACION] Enviando mensaje a ${clienteTel}:`, mensaje)

        /**
         * 💡 IMPLEMENTACIÓN DEL ENVÍO REAL:
         * Para que el mensaje llegue automáticamente al celular del cliente sin que el asesor haga nada,
         * debes conectar un proveedor de WhatsApp API aquí. 
         * 
        
         * 
         * Ejemplo de implementación con fetch:
         * await fetch('https://api.tu-proveedor.com/send', {
         *   method: 'POST',
         *   body: JSON.stringify({ to: clienteTel, message: mensaje }),
         *   headers: { 'Authorization': 'Bearer TU_TOKEN' }
         * })
         */
        
        // Registro en auditoría para control interno
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: '00000000-0000-0000-0000-000000000000', // Sistema
            accion: 'notificacion_whatsapp_send',
            tabla_afectada: 'pagos',
            detalle: { 
                pago_id: pagoId, 
                telefono: clienteTel, 
                mensaje,
                estado: 'procesado_back' 
            }
        })

        return { success: true, message: 'Notificación procesada' }

    } catch (e: any) {
        console.error('[NOTIFICACION] Error:', e)
        return { success: false, error: e.message }
    }
}
