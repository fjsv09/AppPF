import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'

/**
 * POST /api/migracion/prestamos
 * Importación masiva de préstamos históricos del sistema anterior.
 * Crea movimientos financieros para egresos (desembolsos) e ingresos (pagos),
 * actualizando el saldo de la cuenta Efectivo Global.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // 1. Verificar rol admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden realizar migraciones' }, { status: 403 })
        }

        const { loans, cuenta_id } = await request.json()
        if (!loans || !Array.isArray(loans) || loans.length === 0) {
            return NextResponse.json({ error: 'Datos incompletos: Se requiere lista de préstamos' }, { status: 400 })
        }

        // 2. Buscar la cuenta financiera destino
        let cuentaEfectivo: any = null

        if (cuenta_id) {
            // Usar la cuenta específica proporcionada por el usuario
            const { data: cuentaEspecifica } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('*')
                .eq('id', cuenta_id)
                .single()
            cuentaEfectivo = cuentaEspecifica
        } else {
            // Fallback: Buscar cuenta "Efectivo Global" en la cartera global
            const { data: cuentasGlobal } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('*')
                .eq('cartera_id', GLOBAL_CARTERA_ID)
                .order('nombre')

            cuentaEfectivo = cuentasGlobal?.find(c => c.nombre?.toLowerCase().includes('efectivo'))
                || cuentasGlobal?.[0]
        }

        if (!cuentaEfectivo) {
            return NextResponse.json({ error: 'No se encontró la cuenta financiera seleccionada' }, { status: 404 })
        }

        // 3. Calcular neto del lote para validar saldo
        let totalDesembolsos = 0
        let totalIngresos = 0

        for (const l of loans) {
            const monto = parseFloat(l.monto || l.Monto || 0)
            const interes = parseFloat(l.interes || l.Interes || 0)
            const interesExtra = parseFloat(l.interes_extra || l.InteresExtra || l.extra || 0)
            const yaPagado = (l.ya_pagado || l.YaPagado || '').toString().toUpperCase().trim()
            const montoAbonado = parseFloat(l.monto_abonado || l.MontoAbonado || 0)

            if (monto > 0) {
                totalDesembolsos += monto
                if (yaPagado === 'SI' || yaPagado === 'SÍ' || yaPagado === 'YES') {
                    // Préstamo pagado: ingreso = capital + interés
                    totalIngresos += monto * (1 + interes / 100)
                } else if (montoAbonado > 0) {
                    // Préstamo activo con abonos
                    totalIngresos += montoAbonado
                }
                // El interés extra es un ingreso adicional directo
                totalIngresos += interesExtra
            }
        }

        const netoRequerido = totalDesembolsos - totalIngresos
        if (netoRequerido > 0 && cuentaEfectivo.saldo < netoRequerido) {
            return NextResponse.json({
                error: `Saldo insuficiente en Efectivo Global. Disponible: $${cuentaEfectivo.saldo?.toFixed(2)}, Neto requerido: $${netoRequerido.toFixed(2)} (Desembolsos: $${totalDesembolsos.toFixed(2)} - Ingresos: $${totalIngresos.toFixed(2)})`
            }, { status: 400 })
        }

        // Precargar datos de referencia
        const { data: perfilesData } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo')
            .eq('activo', true)
        const perfilMap = new Map(perfilesData?.map((p: any) => [p.nombre_completo.toLowerCase().trim(), p.id]) || [])

        const results = {
            total: loans.length,
            success: 0,
            skipped: 0,
            skippedData: [] as any[],
            errors: [] as string[],
            totalDesembolsado: 0,
            totalIngresado: 0
        }

        let currentBalance = parseFloat(cuentaEfectivo.saldo)

        // 4. Procesar cada préstamo
        for (const l of loans) {
            try {
                // a. Validar campos mínimos
                const dniCliente = (l.dni_cliente || l.DNI || l.dni || '').toString().trim()
                const monto = parseFloat(l.monto || l.Monto || 0)
                const interes = parseFloat(l.interes || l.Interes || 0)
                const cuotas = parseInt(l.cuotas || l.Cuotas || 0)
                const modalidad = (l.modalidad || l.frecuencia || l.Modalidad || 'diario').toString().toLowerCase().trim()
                const fechaInicio = (l.fecha_inicio || l.FechaInicio || new Date().toISOString().split('T')[0]).toString().trim()
                const yaPagado = (l.ya_pagado || l.YaPagado || 'NO').toString().toUpperCase().trim()
                const montoAbonado = parseFloat(l.monto_abonado || l.MontoAbonado || 0)
                const interesExtra = parseFloat(l.interes_extra || l.InteresExtra || l.extra || 0)
                const montoTotalDeuda = Math.round(monto * (1 + (interes / 100)) * 100) / 100
                
                // Un préstamo se considera pagado si explícitamente se marca como tal 
                // o si el monto abonado cubre el total de la deuda (con margen de 0.05)
                const esPagado = yaPagado === 'SI' || yaPagado === 'SÍ' || yaPagado === 'YES' || (montoAbonado >= montoTotalDeuda - 0.05)

                // Validación Estricta: No permitir montos o cuotas en cero o negativas
                if (!dniCliente || monto <= 0 || cuotas <= 0) {
                    results.errors.push(`Fila omitida [DNI: ${dniCliente || 'vacío'}]: Datos inválidos o faltantes. (Monto: ${monto}, Cuotas: ${cuotas})`)
                    continue
                }

                // Prevención de error de Cuota $0.00 (Mínimo 0.01 por cuota)
                if ((montoTotalDeuda / cuotas) < 0.01) {
                    results.errors.push(`Fila omitida [DNI: ${dniCliente}]: El cálculo de cuota resulta en $0.00. Verifique Monto/Interés/Cuotas en su Excel.`)
                    continue
                }

                // b. Buscar cliente por DNI
                const { data: cliente } = await supabaseAdmin
                    .from('clientes')
                    .select('id, nombres, asesor_id')
                    .eq('dni', dniCliente)
                    .maybeSingle()

                if (!cliente) {
                    results.errors.push(`Cliente no encontrado con DNI: ${dniCliente}. Importe primero los clientes.`)
                    continue
                }

                // c. Mapear asesor (Prioridad al asesor ya vinculado al cliente)
                let asesorId = cliente.asesor_id || user.id
                const asesorName = (l.asesor_nombre || l.asesor || l.Asesor || '').toString().trim()
                
                // Solo si el cliente no tiene asesor asignado intentamos buscar por nombre del excel
                if (!cliente.asesor_id && asesorName) {
                    const mappedId = perfilMap.get(asesorName.toLowerCase().trim())
                    if (mappedId) asesorId = mappedId
                }

                // D. Crear Solicitud (como registro migrado)
                const { data: solicitud, error: solicitudError } = await supabaseAdmin
                    .from('solicitudes')
                    .insert({
                        cliente_id: cliente.id,
                        asesor_id: asesorId,
                        admin_id: user.id,
                        estado_solicitud: 'aprobado',
                        fecha_aprobacion: new Date().toISOString(),
                        monto_solicitado: monto,
                        interes,
                        cuotas,
                        modalidad,
                        fecha_inicio_propuesta: fechaInicio,
                        motivo_prestamo: 'Migración de datos - Sistema Anterior',
                        observacion_supervisor: `Préstamo migrado del sistema anterior. ${esPagado ? 'YA PAGADO.' : `Abonado: $${montoAbonado}`}`
                    })
                    .select()
                    .single()

                if (solicitudError) throw new Error(`Error creando solicitud: ${solicitudError.message}`)

                // E. Calcular fecha fin
                const dateInicio = new Date(fechaInicio)
                let dateFin = new Date(dateInicio)
                if (modalidad === 'diario') dateFin.setDate(dateFin.getDate() + cuotas)
                else if (modalidad === 'semanal') dateFin.setDate(dateFin.getDate() + (cuotas * 7))
                else if (modalidad === 'quincenal') dateFin.setDate(dateFin.getDate() + (cuotas * 15))
                else if (modalidad === 'mensual') dateFin.setMonth(dateFin.getMonth() + cuotas)

                // F. Crear Préstamo
                const { data: prestamo, error: prestamoError } = await supabaseAdmin
                    .from('prestamos')
                    .insert({
                        cliente_id: cliente.id,
                        solicitud_id: solicitud.id,
                        monto,
                        interes,
                        fecha_inicio: fechaInicio,
                        fecha_fin: dateFin.toISOString().split('T')[0],
                        frecuencia: modalidad,
                        cuotas,
                        estado: esPagado ? 'finalizado' : 'activo',
                        estado_mora: 'ok',
                        bloqueo_cronograma: false,
                        observacion_supervisor: `Préstamo migrado del sistema anterior. ${esPagado ? 'YA PAGADO.' : `Abonado: $${montoAbonado}`}`,
                        created_by: asesorId
                    })
                    .select()
                    .single()

                if (prestamoError) throw new Error(`Error creando préstamo: ${prestamoError.message}`)

                // G. Generar Cronograma
                const { error: cronogramaError } = await supabaseAdmin.rpc('generar_cronograma_db', {
                    p_prestamo_id: prestamo.id
                })
                if (cronogramaError) throw new Error(`Error generando cronograma: ${cronogramaError.message}`)

                // H. Si tiene pagos, marcar cuotas como pagadas
                if (esPagado || montoAbonado > 0) {
                    // Obtener cuotas del cronograma ordenadas por número de cuota
                    const { data: cuotasCronograma } = await supabaseAdmin
                        .from('cronograma_cuotas')
                        .select('id, monto_cuota')
                        .eq('prestamo_id', prestamo.id)
                        .order('numero_cuota', { ascending: true })

                    if (cuotasCronograma && cuotasCronograma.length > 0) {
                        if (esPagado) {
                            // Marcar TODAS las cuotas como pagadas
                            for (const cuota of cuotasCronograma) {
                                await supabaseAdmin
                                    .from('cronograma_cuotas')
                                    .update({
                                        estado: 'pagado',
                                        monto_pagado: cuota.monto_cuota
                                    })
                                    .eq('id', cuota.id)
                            }
                        } else if (montoAbonado > 0) {
                            // Marcar cuotas proporcionalmente según monto abonado
                            let remaining = montoAbonado
                            for (const cuota of cuotasCronograma) {
                                if (remaining <= 0) break
                                const montoCuota = parseFloat(cuota.monto_cuota || '0')
                                
                                if (remaining >= montoCuota - 0.01) {
                                    // Cuota completa pagada
                                    await supabaseAdmin
                                        .from('cronograma_cuotas')
                                        .update({
                                            estado: 'pagado',
                                            monto_pagado: montoCuota
                                        })
                                        .eq('id', cuota.id)
                                    remaining -= montoCuota
                                } else {
                                    // Cuota parcialmente pagada
                                    await supabaseAdmin
                                        .from('cronograma_cuotas')
                                        .update({
                                            estado: 'parcial',
                                            monto_pagado: remaining
                                        })
                                        .eq('id', cuota.id)
                                    remaining = 0
                                }
                            }
                        }
                    }
                }

                // H.2 Sincronización final de estado (Redundante para seguridad)
                const { data: finalCronograma } = await supabaseAdmin
                    .from('cronograma_cuotas')
                    .select('monto_cuota, monto_pagado')
                    .eq('prestamo_id', prestamo.id)
                
                if (finalCronograma) {
                    const totalMonto = finalCronograma.reduce((sum, c) => sum + Number(c.monto_cuota), 0)
                    const totalPagado = finalCronograma.reduce((sum, c) => sum + Number(c.monto_pagado), 0)
                    
                    if (totalMonto <= totalPagado + 0.01) {
                        await supabaseAdmin
                            .from('prestamos')
                            .update({ estado: 'finalizado' })
                            .eq('id', prestamo.id)
                    }
                }

                // I. Bloquear cronograma para que no sea borrador
                await supabaseAdmin
                    .from('prestamos')
                    .update({ bloqueo_cronograma: true })
                    .eq('id', prestamo.id)

                // J. MOVIMIENTOS FINANCIEROS — Todo debe cuadrar
                // NOTA: No se usa created_at histórico para que los movimientos
                // aparezcan en la fecha actual. La fecha original se incluye en la descripción.

                // I.1 EGRESO: Desembolso del préstamo
                currentBalance -= monto
                await supabaseAdmin
                    .from('movimientos_financieros')
                    .insert({
                        cartera_id: cuentaEfectivo.cartera_id || GLOBAL_CARTERA_ID,
                        cuenta_origen_id: cuentaEfectivo.id,
                        monto,
                        tipo: 'egreso',
                        descripcion: `[MIGRACIÓN] Desembolso préstamo - Cliente: ${cliente.nombres} (DNI: ${dniCliente}) - Fecha original: ${fechaInicio}`,
                        registrado_por: user.id
                    })

                results.totalDesembolsado += monto

                // I.2 INGRESO: Pagos recibidos
                if (esPagado) {
                    // Préstamo completamente pagado: ingreso = capital + interés
                    const ingresoTotal = monto * (1 + interes / 100)
                    currentBalance += ingresoTotal

                    await supabaseAdmin
                        .from('movimientos_financieros')
                        .insert({
                            cartera_id: cuentaEfectivo.cartera_id || GLOBAL_CARTERA_ID,
                            cuenta_origen_id: cuentaEfectivo.id,
                            monto: ingresoTotal,
                            tipo: 'ingreso',
                            descripcion: `[MIGRACIÓN] Pago completo préstamo - Cliente: ${cliente.nombres} (DNI: ${dniCliente}) - Capital: $${monto} + Interés: $${(monto * interes / 100).toFixed(2)}`,
                            registrado_por: user.id
                        })

                    results.totalIngresado += ingresoTotal
                } else if (montoAbonado > 0) {
                    // Préstamo con abonos parciales
                    currentBalance += montoAbonado

                    await supabaseAdmin
                        .from('movimientos_financieros')
                        .insert({
                            cartera_id: cuentaEfectivo.cartera_id || GLOBAL_CARTERA_ID,
                            cuenta_origen_id: cuentaEfectivo.id,
                            monto: montoAbonado,
                            tipo: 'ingreso',
                            descripcion: `[MIGRACIÓN] Pagos parciales préstamo - Cliente: ${cliente.nombres} (DNI: ${dniCliente}) - Abonado: $${montoAbonado.toFixed(2)} de $${(monto * (1 + interes / 100)).toFixed(2)}`,
                            registrado_por: user.id
                        })

                    results.totalIngresado += montoAbonado
                }

                // I.2.b INGRESO EXTRA: Interés por "no pago" de cuotas
                if (interesExtra > 0) {
                    currentBalance += interesExtra
                    await supabaseAdmin
                        .from('movimientos_financieros')
                        .insert({
                            cartera_id: cuentaEfectivo.cartera_id || GLOBAL_CARTERA_ID,
                            cuenta_origen_id: cuentaEfectivo.id,
                            monto: interesExtra,
                            tipo: 'ingreso',
                            descripcion: `[MIGRACIÓN] Interés Extra (No Pago Cuotas) - Cliente: ${cliente.nombres} (DNI: ${dniCliente})`,
                            registrado_por: user.id
                        })
                    results.totalIngresado += interesExtra
                }

                // I.3 Actualizar saldo de la cuenta
                await supabaseAdmin
                    .from('cuentas_financieras')
                    .update({ saldo: currentBalance })
                    .eq('id', cuentaEfectivo.id)

                // J. Auditoría
                await supabaseAdmin.from('auditoria').insert({
                    usuario_id: user.id,
                    accion: 'migracion_prestamo',
                    tabla_afectada: 'prestamos',
                    detalle: {
                        prestamo_id: prestamo.id,
                        cliente_id: cliente.id,
                        monto,
                        interes,
                        estado: esPagado ? 'finalizado' : 'activo',
                        monto_abonado: montoAbonado,
                        interes_extra: interesExtra,
                        fecha_original: fechaInicio,
                        origen: 'migracion_sistema_anterior'
                    }
                })

                results.success++

            } catch (err: any) {
                console.error('Row Import Error:', err.message)
                results.errors.push(`Error en préstamo (DNI: ${l.dni_cliente || 'N/A'}): ${err.message}`)
            }
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
