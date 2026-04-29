import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutos para migraciones grandes

const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'
const LOAN_BATCH = 50   // préstamos por lote (cada uno genera N cuotas, cuidar memoria)
const SCHED_BATCH = 1000
const MOV_BATCH = 500

/**
 * POST /api/migracion/prestamos
 * Importación masiva de préstamos históricos.
 * Optimizado: clientes cargados en 1 query, préstamos en batch (no 1 insert por fila).
 */

function normalizeDate(dateStr: any): string {
    if (!dateStr) return new Date().toISOString().split('T')[0]
    if (dateStr instanceof Date) return dateStr.toISOString().split('T')[0]

    const str = String(dateStr).trim()
    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (dmyMatch) {
        const [_, day, month, year] = dmyMatch
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split(' ')[0]
    try {
        const d = new Date(str)
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    } catch (_) {}
    return new Date().toISOString().split('T')[0]
}

function buildSchedule(
    fechaInicio: string,
    modalidad: string,
    cuotas: number,
    totalToPay: number,
    montoAbonado: number,
    esPagado: boolean,
    holidaysSet: Set<string>
): { schedule: any[]; fechaFin: string } {
    const schedule: any[] = []
    const quotaAmount = Math.round((totalToPay / cuotas) * 100) / 100
    let currentDate = new Date(fechaInicio + 'T12:00:00Z')
    if (modalidad === 'diario') currentDate.setDate(currentDate.getDate() + 1)

    let abonoRestante = esPagado ? totalToPay : montoAbonado

    for (let q = 0; q < cuotas; q++) {
        let nextDate = new Date(currentDate)
        if (modalidad === 'diario') nextDate.setDate(nextDate.getDate() + 1)
        else if (modalidad === 'semanal') nextDate.setDate(nextDate.getDate() + 7)
        else if (modalidad === 'quincenal') nextDate.setDate(nextDate.getDate() + 14)
        else if (modalidad === 'mensual') nextDate.setMonth(nextDate.getMonth() + 1)

        // Saltar domingos y feriados
        let safety = 0
        while (safety < 30) {
            safety++
            const dow = nextDate.getDay()
            const ds = nextDate.toISOString().split('T')[0]
            if (dow === 0 || holidaysSet.has(ds)) nextDate.setDate(nextDate.getDate() + 1)
            else break
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
            numero_cuota: q + 1,
            fecha_vencimiento: nextDate.toISOString().split('T')[0],
            monto_cuota: quotaAmount,
            estado: estadoCuota,
            monto_pagado: montoPagadoCuota,
        })
        currentDate = nextDate
    }

    return { schedule, fechaFin: schedule[schedule.length - 1].fecha_vencimiento }
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

        // ── Fase 1: Precargar referencias en paralelo ──────────────────────────
        const [cuentaRes, holidaysRes] = await Promise.all([
            cuenta_id
                ? supabaseAdmin.from('cuentas_financieras').select('*').eq('id', cuenta_id).single()
                : supabaseAdmin.from('cuentas_financieras').select('*').eq('cartera_id', GLOBAL_CARTERA_ID).order('nombre'),
            supabaseAdmin.from('feriados').select('fecha'),
        ])

        let cuentaFinanciera: any = null
        if (cuenta_id) {
            cuentaFinanciera = cuentaRes.data
        } else {
            const cuentas = cuentaRes.data as any[]
            cuentaFinanciera = cuentas?.find(c => c.nombre?.toLowerCase().includes('efectivo')) || cuentas?.[0]
        }
        if (!cuentaFinanciera) {
            return NextResponse.json({ error: 'No se encontró una cuenta financiera para procesar los movimientos' }, { status: 404 })
        }

        const holidaysSet = new Set<string>(
            holidaysRes.data?.map((h: any) =>
                typeof h.fecha === 'string' ? h.fecha.split('T')[0] : new Date(h.fecha).toISOString().split('T')[0]
            ) || []
        )

        // ── Cargar TODOS los clientes de los DNIs del lote en 1 sola query ────
        const uniqueDnis = [...new Set(
            loans.map((l: any) => (l.dni_cliente || l.DNI || l.dni || '').toString().trim()).filter(Boolean)
        )]

        const clientesData: any[] = []
        // Chunked para respetar límite de URL en .in()
        for (let i = 0; i < uniqueDnis.length; i += 500) {
            const { data } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres, asesor_id, dni')
                .in('dni', uniqueDnis.slice(i, i + 500))
            if (data) clientesData.push(...data)
        }
        const clienteMap = new Map<string, any>(clientesData.map(c => [c.dni, c]))

        // ── Fase 2: Validar y preparar todo en memoria (sin DB) ───────────────
        type LoanPreparado = {
            prestamoPayload: Record<string, any>
            schedule: any[]              // sin prestamo_id aún
            egresoBase: Record<string, any>
            ingresoBase: Record<string, any> | null
            interesExtraBase: Record<string, any> | null
            auditBase: Record<string, any>
            dni: string
            monto: number
            regularPayments: number
            interesExtra: number
        }

        const results = {
            total: loans.length,
            success: 0,
            skipped: 0,
            skippedData: [] as any[],
            errors: [] as string[],
            totalDesembolsado: 0,
            totalIngresado: 0,
        }

        const validos: LoanPreparado[] = []
        let balanceDelta = 0

        for (const l of loans) {
            const dni = (l.dni_cliente || l.DNI || l.dni || '').toString().trim()
            const monto = parseFloat(l.monto || l.Monto || 0)
            const interes = parseFloat(l.interes || l.Interes || 0)
            const cuotas = parseInt(l.cuotas || l.Cuotas || 0)
            const modalidad = (l.modalidad || l.Modalidad || 'diario').toLowerCase().trim()
            const fechaInicio = normalizeDate(l.fecha_inicio || l.FechaInicio)
            const yaPagadoStr = (l.ya_pagado || l.YaPagado || 'NO').toString().toUpperCase().trim()
            const esPagado = yaPagadoStr === 'SI' || yaPagadoStr === 'SÍ' || yaPagadoStr === 'YES'
            const montoAbonado = parseFloat(l.monto_abonado || l.MontoAbonado || l['Monto Abonado'] || 0)
            const interesExtra = parseFloat(
                l.interes_extra || l.InteresExtra || l.extra ||
                l['Interes Extra'] || l['Interés Extra'] || l['interes extra'] || 0
            )

            if (!dni || monto <= 0 || cuotas <= 0) {
                results.errors.push(`Fila omitida: Datos inválidos para DNI "${dni}"`)
                continue
            }

            const cliente = clienteMap.get(dni)
            if (!cliente) {
                results.skipped++
                results.skippedData.push({ dni, nombres: l.nombres || 'Desconocido', motivo: 'El cliente no existe en la base de datos' })
                continue
            }

            const totalToPay = monto * (1 + interes / 100)
            const { schedule, fechaFin } = buildSchedule(fechaInicio, modalidad, cuotas, totalToPay, montoAbonado, esPagado, holidaysSet)
            const regularPayments = esPagado ? totalToPay : montoAbonado

            validos.push({
                prestamoPayload: {
                    cliente_id: cliente.id,
                    monto,
                    interes,
                    cuotas,
                    frecuencia: modalidad,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    estado: esPagado ? 'finalizado' : 'activo',
                    created_by: user.id,
                    observacion_supervisor: '[MIGRACIÓN] Importado del sistema anterior',
                },
                schedule,
                egresoBase: {
                    cartera_id: cuentaFinanciera.cartera_id || GLOBAL_CARTERA_ID,
                    cuenta_origen_id: cuentaFinanciera.id,
                    monto,
                    tipo: 'egreso',
                    registrado_por: user.id,
                    created_at: fechaInicio + 'T10:00:00Z',
                },
                ingresoBase: regularPayments > 0 ? {
                    cartera_id: cuentaFinanciera.cartera_id || GLOBAL_CARTERA_ID,
                    cuenta_destino_id: cuentaFinanciera.id,
                    monto: regularPayments,
                    tipo: 'ingreso',
                    registrado_por: user.id,
                    created_at: new Date().toISOString(),
                } : null,
                interesExtraBase: interesExtra > 0 ? {
                    cartera_id: cuentaFinanciera.cartera_id || GLOBAL_CARTERA_ID,
                    cuenta_destino_id: cuentaFinanciera.id,
                    monto: interesExtra,
                    tipo: 'ingreso',
                    registrado_por: user.id,
                    created_at: new Date().toISOString(),
                } : null,
                auditBase: {
                    usuario_id: user.id,
                    accion: 'migracion_prestamo',
                    tabla_afectada: 'prestamos',
                    detalle: { dni, monto, esPagado, montoAbonado, interesExtra },
                },
                dni,
                monto,
                regularPayments,
                interesExtra,
            })

            // Calcular delta de saldo en memoria
            balanceDelta -= monto
            balanceDelta += regularPayments
            balanceDelta += interesExtra
            results.totalDesembolsado += monto
            results.totalIngresado += regularPayments + interesExtra
        }

        // ── Fase 3: Batch insert préstamos → obtener IDs ──────────────────────
        const allSchedules: any[] = []
        const allMovimientos: any[] = []
        const allAudits: any[] = []
        const createdLoanIds: string[] = []

        for (let i = 0; i < validos.length; i += LOAN_BATCH) {
            const lote = validos.slice(i, i + LOAN_BATCH)

            const { data: nuevosPrestamos, error: loanError } = await supabaseAdmin
                .from('prestamos')
                .insert(lote.map(l => l.prestamoPayload))
                .select('id')

            if (loanError) {
                results.errors.push(`Error en lote préstamos ${i}-${i + lote.length}: ${loanError.message}`)
                // Descontar del total esperado
                results.totalDesembolsado -= lote.reduce((s, l) => s + l.monto, 0)
                results.totalIngresado -= lote.reduce((s, l) => s + l.regularPayments + l.interesExtra, 0)
                continue
            }

            // Los IDs vienen en el mismo orden que el payload enviado
            nuevosPrestamos!.forEach((p: any, idx: number) => {
                const loan = lote[idx]
                const shortId = p.id.split('-')[0]
                createdLoanIds.push(p.id)

                // Cuotas: agregar prestamo_id
                loan.schedule.forEach(s => {
                    allSchedules.push({ prestamo_id: p.id, ...s })
                })

                // Movimientos: completar descripción con ID real
                allMovimientos.push({
                    ...loan.egresoBase,
                    descripcion: `[MIGRACIÓN] Desembolso préstamo #${shortId} - DNI: ${loan.dni}`,
                })
                if (loan.ingresoBase) {
                    allMovimientos.push({
                        ...loan.ingresoBase,
                        descripcion: `[MIGRACIÓN] Cobro acumulado préstamo #${shortId} - DNI: ${loan.dni}`,
                    })
                }
                if (loan.interesExtraBase) {
                    allMovimientos.push({
                        ...loan.interesExtraBase,
                        descripcion: `[MIGRACIÓN] Interés extra (prórroga) préstamo #${shortId} - DNI: ${loan.dni}`,
                    })
                }

                allAudits.push({ ...loan.auditBase, registro_id: p.id })
                results.success++
            })
        }

        // ── Fase 4: Batch inserts finales ──────────────────────────────────────
        for (let i = 0; i < allSchedules.length; i += SCHED_BATCH) {
            const { error } = await supabaseAdmin
                .from('cronograma_cuotas')
                .insert(allSchedules.slice(i, i + SCHED_BATCH))
            if (error) results.errors.push(`Error cuotas lote ${i}: ${error.message}`)
        }

        for (let i = 0; i < allMovimientos.length; i += MOV_BATCH) {
            const { error } = await supabaseAdmin
                .from('movimientos_financieros')
                .insert(allMovimientos.slice(i, i + MOV_BATCH))
            if (error) results.errors.push(`Error movimientos lote ${i}: ${error.message}`)
        }

        if (allAudits.length > 0) {
            for (let i = 0; i < allAudits.length; i += 500) {
                await supabaseAdmin.from('auditoria').insert(allAudits.slice(i, i + 500))
            }
        }

        // Actualización única de saldo
        const saldoFinal = parseFloat(cuentaFinanciera.saldo) + balanceDelta
        await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: saldoFinal })
            .eq('id', cuentaFinanciera.id)

        // ── Fase 5: Limpieza de efectos secundarios de triggers ───────────────
        if (createdLoanIds.length > 0) {
            for (let i = 0; i < createdLoanIds.length; i += 200) {
                await supabaseAdmin
                    .from('tareas_evidencia')
                    .delete()
                    .in('prestamo_id', createdLoanIds.slice(i, i + 200))
            }

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
