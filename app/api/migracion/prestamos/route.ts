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
        
        // Colecciones para inserción masiva
        const allSchedules: any[] = []
        const allMovimientos: any[] = []
        const allAudits: any[] = []

        // 1.5 Precargar feriados
        const { data: holidaysData } = await supabaseAdmin.from('feriados').select('fecha')
        const holidaysSet = new Set(holidaysData?.map((h: any) => h.fecha) || [])

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

                // B. Generar Cronograma Real
                const schedule = []
                let currentDate = new Date(fechaInicio + 'T12:00:00Z')
                const totalToPay = monto * (1 + (interes / 100))
                const quotaAmount = Math.round((totalToPay / cuotas) * 100) / 100

                if (modalidad === 'diario') currentDate.setDate(currentDate.getDate() + 1)

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
                        const dayOfWeek = checkDate.getDay()
                        const dateStr = checkDate.toISOString().split('T')[0]
                        if (dayOfWeek === 0 || holidaysSet.has(dateStr)) checkDate.setDate(checkDate.getDate() + 1)
                        else isValidDay = true
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

                // C. Crear Préstamo (Individual para obtener ID)
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

                // D. Acumular Cronograma
                schedule.forEach(s => {
                    allSchedules.push({
                        prestamo_id: prestamo.id,
                        numero_cuota: s.numero_cuota,
                        monto_cuota: s.monto_cuota,
                        fecha_vencimiento: s.fecha_vencimiento,
                        estado: s.estado,
                        monto_pagado: s.monto_pagado
                    })
                })

                // E. Acumular Movimientos Financieros
                // 1. Egreso por desembolso
                allMovimientos.push({
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

                const regularPayments = esPagado ? totalToPay : montoAbonado
                if (regularPayments > 0) {
                    allMovimientos.push({
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

                if (interesExtra > 0) {
                    allMovimientos.push({
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

                allAudits.push({
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

        // F. INSERCIONES MASIVAS FINALES (Batch processing)
        console.log(`🚀 Ejecutando inserciones masivas: ${allSchedules.length} cuotas, ${allMovimientos.length} movimientos...`)
        
        // Cuotas en bloques de 1000
        for (let i = 0; i < allSchedules.length; i += 1000) {
            await supabaseAdmin.from('cronograma_cuotas').insert(allSchedules.slice(i, i + 1000))
        }

        // Movimientos en bloques de 500
        for (let i = 0; i < allMovimientos.length; i += 500) {
            await supabaseAdmin.from('movimientos_financieros').insert(allMovimientos.slice(i, i + 500))
        }

        // Auditoría
        if (allAudits.length > 0) {
            await supabaseAdmin.from('auditoria').insert(allAudits)
        }

        // G. Actualización ÚNICA de Saldo Final
        await supabaseAdmin.from('cuentas_financieras').update({ saldo: currentBalance }).eq('id', cuentaFinanciera.id)

        // H. Limpieza de efectos secundarios (triggers)
        if (createdLoanIds.length > 0) {
            // Borrar tareas de evidencia autogeneradas por triggers
            for (let i = 0; i < createdLoanIds.length; i += 200) {
                await supabaseAdmin.from('tareas_evidencia').delete().in('prestamo_id', createdLoanIds.slice(i, i + 200))
            }

            // Borrar notificaciones de Auditoría Dirigida masivas
            await supabaseAdmin
                .from('notificaciones')
                .delete()
                .eq('titulo', '⚖️ Auditoría Dirigida')
                .gt('created_at', new Date(Date.now() - 600000).toISOString())
        }

        return NextResponse.json(results)
    } catch (error: any) {
        console.error('Critical Loan Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
