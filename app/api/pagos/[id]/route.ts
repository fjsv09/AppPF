import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { format } from 'date-fns'

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
            return NextResponse.json({ error: 'Solo administradores pueden editar cobros' }, { status: 403 })
        }

        const body = await request.json()
        const { monto, metodo_pago, nota_auditoria } = body

        if (!monto || isNaN(parseFloat(monto)) || parseFloat(monto) < 0) {
            return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
        }

        // 2. Obtener datos actuales del pago
        const { data: pagoActual, error: fetchError } = await supabaseAdmin
            .from('pagos')
            .select('*, perfiles(nombre_completo)')
            .eq('id', id)
            .single()
        
        if (fetchError || !pagoActual) {
            return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
        }

        const pagoDate = new Date(pagoActual.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

        // 3. VALIDACIÓN DE FECHA (Solo permitir edición de pagos de HOY)
        if (pagoDate !== todayStr) {
            return NextResponse.json({ 
                error: `No se puede editar cobros de fechas anteriores. Solo se permiten correcciones del día de hoy.` 
            }, { status: 400 })
        }

        const nuevoMonto = parseFloat(monto)
        const diffMonto = nuevoMonto - parseFloat(pagoActual.monto_pagado)

        // 3.5 VALIDACIÓN DE CUADRE (Restricción Temporal Precisa)
        // Buscar TODOS los cuadres del asesor en esta fecha, sin filtrar por tipo
        const { data: cuadres, error: cuadreError } = await supabaseAdmin
            .from('cuadres_diarios')
            .select('id, tipo_cuadre, estado, created_at, fecha')
            .eq('asesor_id', pagoActual.registrado_por)
            .eq('fecha', pagoDate)
            .order('created_at', { ascending: false })
        
        console.log('=== DEBUG CUADRE VALIDATION ===')
        console.log('Pago ID:', id)
        console.log('Asesor ID:', pagoActual.registrado_por)
        console.log('Pago Date (computed):', pagoDate)
        console.log('Pago created_at:', pagoActual.created_at)
        console.log('Cuadre query error:', cuadreError)
        console.log('Cuadres encontrados:', JSON.stringify(cuadres, null, 2))
        console.log('Cuadres count:', cuadres?.length || 0)
        
        if (cuadres && cuadres.length > 0) {
            // Filtrar solo los estados válidos y tipos relevantes
            const cuadresRelevantes = cuadres.filter(c => 
                ['pendiente', 'aprobado'].includes(c.estado) &&
                ['parcial_mañana', 'final', 'parcial'].includes(c.tipo_cuadre)
            );
            
            console.log('Cuadres relevantes (después de filtro manual):', JSON.stringify(cuadresRelevantes, null, 2))

            if (cuadresRelevantes.length > 0) {
                // A. Si hay un cierre final aprobado, bloqueamos toda edición histórica de ese día
                const tieneFinal = cuadresRelevantes.some(c => c.tipo_cuadre === 'final');
                if (tieneFinal) {
                    return NextResponse.json({ 
                        error: `No se puede editar este cobro. El asesor ya realizó el Cierre Final del día ${pagoDate.split('-').reverse().join('/')}.` 
                    }, { status: 400 })
                }

                // B. Bloquear si el pago es ANTERIOR a cualquier cierre (parcial, parcial_mañana o final)
                const paymentTime = new Date(pagoActual.created_at).getTime();
                console.log('Payment timestamp:', paymentTime, '=', new Date(pagoActual.created_at).toISOString())
                
                for (const c of cuadresRelevantes) {
                    const cuadreTime = new Date(c.created_at).getTime();
                    console.log(`Cuadre ${c.tipo_cuadre} (${c.estado}) timestamp: ${cuadreTime} = ${new Date(c.created_at).toISOString()} | posterior al pago? ${cuadreTime > paymentTime}`)
                }

                const cuadreQueLoBloquea = cuadresRelevantes.find(c => new Date(c.created_at).getTime() > paymentTime);

                if (cuadreQueLoBloquea) {
                    const tipoStr = cuadreQueLoBloquea.tipo_cuadre === 'parcial_mañana' ? 'Cierre del Primer Turno' : 
                                    cuadreQueLoBloquea.tipo_cuadre === 'parcial' ? 'Cierre Parcial (Ruta)' : 'Cierre Oficial';
                    const horaCuadre = new Date(cuadreQueLoBloquea.created_at).toLocaleTimeString('es-PE', { 
                        timeZone: 'America/Lima', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });

                    return NextResponse.json({ 
                        error: `No se puede editar. Este cobro ya fue procesado y validado en el ${tipoStr} de las ${horaCuadre}.` 
                    }, { status: 400 })
                } else {
                    console.log('NINGÚN cuadre es posterior al pago - permitiendo edición')
                }
            } else {
                console.log('No hay cuadres relevantes después de filtrar por estado/tipo')
            }
        } else {
            console.log('No se encontraron cuadres para este asesor en esta fecha')
        }
        console.log('=== FIN DEBUG ===')

        // 4. Obtener Distribución y Cuota relacionada
        const { data: distribuciones } = await supabaseAdmin
            .from('pagos_distribucion')
            .select('*')
            .eq('pago_id', id)
        
        if (!distribuciones || distribuciones.length === 0) {
            return NextResponse.json({ error: 'No se encontró la distribución del pago' }, { status: 404 })
        }

        // Si el pago se distribuyó en varias cuotas, la lógica de edición simple fallaría.
        // Pero en cobros manuales de asesores suele ser 1 a 1.
        if (distribuciones.length > 1 && diffMonto !== 0) {
            return NextResponse.json({ error: 'Este pago se distribuyó en múltiples cuotas. Por seguridad, la edición automática está deshabilitada para pagos complejos.' }, { status: 400 })
        }

        const distribucion = distribuciones[0]
        const cuotaId = distribucion.cuota_id

        // 5. PROCESAR AJUSTES (Transacción manual simulada)
        
        // A. Actualizar Pago
        await supabaseAdmin
            .from('pagos')
            .update({ 
                monto_pagado: nuevoMonto,
                metodo_pago: metodo_pago || pagoActual.metodo_pago
            })
            .eq('id', id)

        // B. Actualizar Distribución
        await supabaseAdmin
            .from('pagos_distribucion')
            .update({ monto: nuevoMonto })
            .eq('id', distribucion.id)

        // C. Actualizar Cuota (Incrementar/Decrementar monto_pagado)
        const { data: cuota } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('monto_cuota, monto_pagado')
            .eq('id', cuotaId)
            .single()
        
        if (cuota) {
            const nuevoPagadoCuota = parseFloat(cuota.monto_pagado) + diffMonto
            await supabaseAdmin
                .from('cronograma_cuotas')
                .update({ 
                    monto_pagado: nuevoPagadoCuota,
                    estado: nuevoPagadoCuota >= (parseFloat(cuota.monto_cuota) - 0.01) ? 'pagado' : 'pendiente'
                })
                .eq('id', cuotaId)
        }

        // D. Ajustar Cuenta de Cobranza del Asesor
        if (diffMonto !== 0) {
            const { data: carteras } = await supabaseAdmin
                .from('carteras')
                .select('id')
                .eq('asesor_id', pagoActual.registrado_por)
            
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
                    .update({ saldo: parseFloat(cuentaCobranza.saldo) + diffMonto })
                    .eq('id', cuentaCobranza.id)
                
                // E. Registrar movimiento de ajuste para trazabilidad
                await supabaseAdmin.from('movimientos_financieros').insert({
                    cartera_id: cuentaCobranza.cartera_id,
                    cuenta_origen_id: cuentaCobranza.id,
                    monto: Math.abs(diffMonto),
                    tipo: diffMonto > 0 ? 'ingreso' : 'egreso',
                    descripcion: `Ajuste administrativo de cobro #${id.split('-')[0]} (Anterior: S/ ${pagoActual.monto} -> Nuevo: S/ ${nuevoMonto}). ${nota_auditoria || ''}`,
                    registrado_por: user.id
                })
            }
        }

        // 6. Auditoría Final
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'editar_pago_individual',
            tabla_afectada: 'pagos',
            registro_id: id,
            detalle: { antes: pagoActual, despues: { monto: nuevoMonto, metodo_pago }, diffMonto, nota: nota_auditoria }
        })

        return NextResponse.json({ message: 'Cobro actualizado correctamente' })

    } catch (error: any) {
        console.error('ERROR EDITING PAYMENT:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
    }
}
