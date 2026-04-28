import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'
import { addDays, addWeeks, addMonths, format } from 'date-fns'

export const dynamic = 'force-dynamic'

const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'

/**
 * POST /api/migracion/prestamos
 * Importación masiva de préstamos históricos.
 * Maneja tanto préstamos ya pagados como activos con abonos previos.
 */

function normalizeDate(dateStr: any): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    if (dateStr instanceof Date) return dateStr.toISOString().split('T')[0];
    
    const str = String(dateStr).trim();
    
    // Formato DD/MM/YYYY o DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
        const [_, day, month, year] = dmyMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Si ya parece YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.split(' ')[0];
    }

    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch (e) {}

    return new Date().toISOString().split('T')[0];
}

export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

        // 1. Obtener cuenta financiera
        let cuentaFinanciera: any = null
        if (cuenta_id) {
            const { data } = await supabaseAdmin.from('cuentas_financieras').select('*').eq('id', cuenta_id).single()
            cuentaFinanciera = data
        }

        if (!cuentaFinanciera) {
            const { data: cuentas } = await supabaseAdmin.from('cuentas_financieras').select('*').eq('cartera_id', GLOBAL_CARTERA_ID).order('nombre')
            cuentaFinanciera = cuentas?.find(c => c.nombre?.toLowerCase().includes('efectivo')) || cuentas?.[0]
        }

        if (!cuentaFinanciera) {
            return NextResponse.json({ error: 'No se encontró una cuenta financiera para procesar los movimientos' }, { status: 404 })
        }

        const results = {
            total: loans.length,
            success: 0,
            skipped: 0,
            skippedData: [] as any[],
            errors: [] as string[],
            totalDesembolsado: 0,
            totalIngresado: 0
        }

        const createdLoanIds: string[] = []
        let currentBalance = parseFloat(cuentaFinanciera.saldo)

        // 2. Procesar cada préstamo
        for (const l of loans) {
            try {
                const dni = (l.dni_cliente || l.DNI || l.dni || '').toString().trim()
                const monto = parseFloat(l.monto || l.Monto || 0)
                const interes = parseFloat(l.interes || l.Interes || 0)
                const cuotas = parseInt(l.cuotas || l.Cuotas || 0)
                const modalidad = (l.modalidad || l.Modalidad || 'diario').toLowerCase().trim()
                const fechaInicio = normalizeDate(l.fecha_inicio || l.FechaInicio)
                const yaPagadoStr = (l.ya_pagado || l.YaPagado || 'NO').toString().toUpperCase().trim()
                const esPagado = yaPagadoStr === 'SI' || yaPagadoStr === 'SÍ' || yaPagadoStr === 'YES'
                const montoAbonado = parseFloat(l.monto_abonado || l.MontoAbonado || l['Monto Abonado'] || 0)
                const interesExtra = parseFloat(l.interes_extra || l.InteresExtra || l.extra || l['Interes Extra'] || l['Interés Extra'] || l['interes extra'] || 0)

                if (!dni || monto <= 0 || cuotas <= 0) {
                    results.errors.push(`Fila omitida: Datos inválidos para DNI "${dni}"`)
                    continue
                }

                // A. Buscar cliente por DNI
                const { data: cliente } = await supabaseAdmin
                    .from('clientes')
                    .select('id, nombres, asesor_id')
                    .eq('dni', dni)
                    .maybeSingle()

                if (!cliente) {
                    results.skipped++
                    results.skippedData.push({ dni, nombres: l.nombres || 'Desconocido', motivo: 'El cliente no existe en la base de datos' })
                    continue
                }

                // B. Generar Cronograma Real (Con domingos y feriados)
                const { data: holidaysData } = await supabaseAdmin.from('feriados').select('fecha')
                const holidaysSet = new Set(holidaysData?.map((h: any) => h.fecha) || [])

                const schedule = []
                let currentDate = new Date(fechaInicio + 'T12:00:00Z')
                const totalToPay = monto * (1 + (interes / 100))
                const quotaAmount = Math.round((totalToPay / cuotas) * 100) / 100

                // Regla de día libre para cobro diario
                if (modalidad === 'diario') {
                    currentDate.setDate(currentDate.getDate() + 1)
                }

                let abonoRestante = esPagado ? totalToPay : montoAbonado
                let quotasCount = 0

                while (quotasCount < cuotas) {
                    let nextDate = new Date(currentDate)
                    
                    if (modalidad === 'diario') nextDate.setDate(nextDate.getDate() + 1)
                    else if (modalidad === 'semanal') nextDate.setDate(nextDate.getDate() + 7)
                    else if (modalidad === 'quincenal') nextDate.setDate(nextDate.getDate() + 14)
                    else if (modalidad === 'mensual') nextDate.setMonth(nextDate.getMonth() + 1)

                    let isValidDay = false
                    let checkDate = new Date(nextDate)
                    let daySafety = 0
                    while (!isValidDay && daySafety < 30) {
                        daySafety++
                        const dayOfWeek = checkDate.getDay() // 0 = Domingo
                        const dateStr = checkDate.toISOString().split('T')[0]
                        if (dayOfWeek === 0 || holidaysSet.has(dateStr)) {
                            checkDate.setDate(checkDate.getDate() + 1)
                        } else {
                            isValidDay = true
                        }
                    }
                    
                    let estadoCuota = 'pendiente'
                    let montoPagadoCuota = 0

                    if (esPagado) {
                        estadoCuota = 'pagado'
                        montoPagadoCuota = quotaAmount
                    } else if (abonoRestante >= quotaAmount) {
                        estadoCuota = 'pagado'
                        montoPagadoCuota = quotaAmount
                        abonoRestante -= quotaAmount
                    } else if (abonoRestante > 0) {
                        montoPagadoCuota = abonoRestante
                        abonoRestante = 0
                    }

                    schedule.push({
                        numero_cuota: quotasCount + 1,
                        fecha_vencimiento: checkDate.toISOString().split('T')[0],
                        monto_cuota: quotaAmount,
                        estado: estadoCuota,
                        monto_pagado: montoPagadoCuota
                    })
                    quotasCount++
                    currentDate = checkDate
                }

                const fechaFin = schedule[schedule.length - 1].fecha_vencimiento

                // C. Crear Préstamo
                const { data: prestamo, error: loanError } = await supabaseAdmin
                    .from('prestamos')
                    .insert({
                        cliente_id: cliente.id,
                        monto,
                        interes,
                        cuotas,
                        frecuencia: modalidad,
                        fecha_inicio: fechaInicio,
                        fecha_fin: fechaFin,
                        estado: esPagado ? 'finalizado' : 'activo',
                        created_by: user.id,
                        observacion_supervisor: '[MIGRACIÓN] Importado del sistema anterior'
                    })
                    .select()
                    .single()

                if (loanError) throw new Error(`Error creando préstamo: ${loanError.message}`)
                createdLoanIds.push(prestamo.id)

                // D. Insertar Cronograma
                const scheduleWithId = schedule.map(s => ({ 
                    prestamo_id: prestamo.id,
                    numero_cuota: s.numero_cuota,
                    monto_cuota: s.monto_cuota,
                    fecha_vencimiento: s.fecha_vencimiento,
                    estado: s.estado,
                    monto_pagado: s.monto_pagado
                }))
                const { error: cronoError } = await supabaseAdmin.from('cronograma_cuotas').insert(scheduleWithId)
                if (cronoError) throw new Error(`Error cronograma: ${cronoError.message}`)

                // D. Movimientos Financieros
                // 1. Egreso por desembolso
                await supabaseAdmin.from('movimientos_financieros').insert({
                    cartera_id: cuentaFinanciera.cartera_id || GLOBAL_CARTERA_ID,
                    cuenta_origen_id: cuentaFinanciera.id,
                    monto,
                    tipo: 'egreso',
                    descripcion: `[MIGRACIÓN] Desembolso préstamo #${prestamo.id.split('-')[0]} - DNI: ${dni}`,
                    registrado_por: user.id,
                    created_at: fechaInicio + 'T10:00:00Z'
                })
                currentBalance -= monto
                results.totalDesembolsado += monto

                // 2. Ingresos por pagos previos
                const regularPayments = esPagado ? totalToPay : montoAbonado
                
                // 2a. Cobro acumulado regular
                if (regularPayments > 0) {
                    await supabaseAdmin.from('movimientos_financieros').insert({
                        cartera_id: cuentaFinanciera.cartera_id || GLOBAL_CARTERA_ID,
                        cuenta_destino_id: cuentaFinanciera.id,
                        monto: regularPayments,
                        tipo: 'ingreso',
                        descripcion: `[MIGRACIÓN] Cobro acumulado préstamo #${prestamo.id.split('-')[0]} - DNI: ${dni}`,
                        registrado_por: user.id,
                        created_at: new Date().toISOString()
                    })
                    currentBalance += regularPayments
                    results.totalIngresado += regularPayments
                }

                // 2b. Interés Extra (Prórroga)
                if (interesExtra > 0) {
                    await supabaseAdmin.from('movimientos_financieros').insert({
                        cartera_id: cuentaFinanciera.cartera_id || GLOBAL_CARTERA_ID,
                        cuenta_destino_id: cuentaFinanciera.id,
                        monto: interesExtra,
                        tipo: 'ingreso',
                        descripcion: `[MIGRACIÓN] Interés extra (prórroga) préstamo #${prestamo.id.split('-')[0]} - DNI: ${dni}`,
                        registrado_por: user.id,
                        created_at: new Date().toISOString()
                    })
                    currentBalance += interesExtra
                    results.totalIngresado += interesExtra
                }

                // E. Actualizar Saldo Final de la cuenta
                await supabaseAdmin.from('cuentas_financieras').update({ saldo: currentBalance }).eq('id', cuentaFinanciera.id)

                // F. Auditoría
                await supabaseAdmin.from('auditoria').insert({
                    usuario_id: user.id,
                    accion: 'migracion_prestamo',
                    tabla_afectada: 'prestamos',
                    registro_id: prestamo.id,
                    detalle: { dni, monto, esPagado, montoAbonado, interesExtra }
                })

                results.success++

            } catch (err: any) {
                console.error('Loan Row Error:', err.message)
                results.errors.push(`Error en DNI ${l.dni_cliente || 'N/A'}: ${err.message}`)
            }
        }

        // G. Limpieza de notificaciones y tareas generadas por triggers
        // Al ser datos migrados, no queremos que se generen auditorías dirigidas ni tareas de evidencia automáticas.
        if (createdLoanIds.length > 0) {
            // 1. Borrar tareas de evidencia autogeneradas
            await supabaseAdmin
                .from('tareas_evidencia')
                .delete()
                .in('prestamo_id', createdLoanIds)

            // 2. Borrar notificaciones de Auditoría Dirigida
            await supabaseAdmin
                .from('notificaciones')
                .delete()
                .eq('titulo', '⚖️ Auditoría Dirigida')
                .gt('created_at', new Date(Date.now() - 300000).toISOString()) // Creadas en los últimos 5 min
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Loan Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
