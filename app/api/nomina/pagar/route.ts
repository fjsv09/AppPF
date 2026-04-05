import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/nomina/pagar — Ejecutar pago (parcial o total)
 * 
 * Columnas reales de nomina_personal:
 *   id, trabajador_id, mes, anio, sueldo_base, bonos, descuentos, adelantos, estado
 * 
 * Los pagos completados se cuentan desde la tabla auditoria (accion='pago_nomina').
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { nominaId, trabajadorId, mes, anio, cuentaOrigenId, incluirBonos } = await request.json()

        // 1. Obtener nómina — buscar por ID o por trabajador/mes/año
        let nomina: any = null
        const realTrabajadorId = trabajadorId
        const realMes = mes || (new Date().getMonth() + 1)
        const realAnio = anio || new Date().getFullYear()
        
        if (nominaId) {
            const { data } = await supabaseAdmin
                .from('nomina_personal')
                .select('*, perfiles!trabajador_id(nombre_completo, sueldo_base, frecuencia_pago)')
                .eq('id', nominaId)
                .maybeSingle()
            nomina = data
        }

        // Fallback: buscar por trabajador/mes/año
        if (!nomina && realTrabajadorId) {
            const { data: existing } = await supabaseAdmin
                .from('nomina_personal')
                .select('*, perfiles!trabajador_id(nombre_completo, sueldo_base, frecuencia_pago)')
                .eq('trabajador_id', realTrabajadorId)
                .eq('mes', realMes)
                .eq('anio', realAnio)
                .maybeSingle()
            
            if (existing) {
                nomina = existing
            } else {
                // AUTO-CREACIÓN si no existe
                const { data: prof } = await supabaseAdmin
                    .from('perfiles').select('*').eq('id', realTrabajadorId).single()
                if (!prof) return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 })

                const { data: nuevo, error: createErr } = await supabaseAdmin
                    .from('nomina_personal')
                    .insert({
                        trabajador_id: realTrabajadorId,
                        mes: realMes,
                        anio: realAnio,
                        sueldo_base: prof.sueldo_base,
                        estado: 'pendiente',
                        bonos: 0,
                        descuentos: 0,
                        adelantos: 0
                    })
                    .select('*, perfiles!trabajador_id(nombre_completo, sueldo_base, frecuencia_pago)')
                    .single()
                
                if (createErr) throw createErr
                nomina = nuevo
            }
        }

        if (!nomina || nomina.estado === 'pagado') {
            return NextResponse.json({ error: 'Nómina no encontrada o ya pagada totalmente' }, { status: 400 })
        }

        const trabajador = nomina.perfiles
        const frecuencia = trabajador.frecuencia_pago || 'mensual'
        
        // Contar sábados del mes para pagos semanales
        const getSaturdaysInMonth = (m: number, y: number) => {
            let count = 0
            const daysInMonth = new Date(y, m, 0).getDate()
            for (let i = 1; i <= daysInMonth; i++) {
                if (new Date(y, m - 1, i).getDay() === 6) count++
            }
            return count
        }

        let maxPagos = 1
        if (frecuencia === 'semanal') {
            maxPagos = getSaturdaysInMonth(nomina.mes, nomina.anio)
        } else if (frecuencia === 'quincenal') {
            maxPagos = 2
        }

        // 2. Verificar pagos completados (lectura directa de la tabla)
        const pagosCompletados = nomina.pagos_completados || 0

        if (pagosCompletados >= maxPagos) {
            if (nomina.estado !== 'pagado') {
                await supabaseAdmin.from('nomina_personal').update({ estado: 'pagado' }).eq('id', nomina.id)
            }
            return NextResponse.json({ error: `Ya se realizaron los ${maxPagos} pagos de este mes` }, { status: 400 })
        }

        // 3. Cálculos de Montos
        const divisor = maxPagos
        const sueldoBasePeriodo = (nomina.sueldo_base || trabajador.sueldo_base || 0) / divisor
        
        const esUltimoPago = (pagosCompletados + 1) === maxPagos
        const bonosPeriodo = (esUltimoPago && incluirBonos) ? (nomina.bonos || 0) : 0
        const descuentos = nomina.descuentos || 0
        const adelantosAcumulados = nomina.adelantos || 0
        
        const brutoPeriodo = sueldoBasePeriodo + bonosPeriodo - descuentos
        const deduccionAdelanto = Math.min(brutoPeriodo > 0 ? brutoPeriodo : 0, adelantosAcumulados)
        const montoPagarFinal = Math.max(0, brutoPeriodo - deduccionAdelanto)

        // 4. Validar Cuenta y Saldo
        let cuenta = null
        if (montoPagarFinal > 0) {
            const { data: c } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('*')
                .eq('id', cuentaOrigenId)
                .single()
            
            if (!c || parseFloat(c.saldo) < montoPagarFinal) {
                return NextResponse.json({ error: 'Saldo insuficiente' }, { status: 400 })
            }
            cuenta = c
        }

        // 5. Actualizar Nómina
        const nuevosPagosCount = pagosCompletados + 1
        const nuevoEstado = nuevosPagosCount >= maxPagos ? 'pagado' : 'pendiente'
        
        const saldoDisponibleParaDescuento = sueldoBasePeriodo + bonosPeriodo
        const deduccionDescuentoEfectiva = Math.min(saldoDisponibleParaDescuento, descuentos)
        const nuevoDescuentoPendiente = Math.max(0, descuentos - deduccionDescuentoEfectiva)
        const nuevoAdelantoPendiente = Math.max(0, adelantosAcumulados - deduccionAdelanto)

        // Guardar descuentos consumidos en _original (acumulativo)
        const updatePayload: any = {
            estado: nuevoEstado,
            pagos_completados: nuevosPagosCount,
            adelantos: nuevoAdelantoPendiente,
            descuentos: nuevoDescuentoPendiente
        }

        if (deduccionDescuentoEfectiva > 0) {
            updatePayload.descuentos_original = parseFloat(nomina.descuentos_original || 0) + deduccionDescuentoEfectiva
        }

        const { error: updError } = await supabaseAdmin
            .from('nomina_personal')
            .update(updatePayload)
            .eq('id', nomina.id)

        if (updError) throw updError

        // 6. Movimientos Financieros
        if (montoPagarFinal > 0 && cuenta) {
            await supabaseAdmin
                .from('cuentas_financieras')
                .update({ saldo: parseFloat(cuenta.saldo) - montoPagarFinal })
                .eq('id', cuentaOrigenId)

            await supabaseAdmin.from('movimientos_financieros').insert({
                cartera_id: cuenta.cartera_id,
                cuenta_origen_id: cuentaOrigenId,
                monto: montoPagarFinal,
                tipo: 'egreso',
                descripcion: `Pago Nómina — ${trabajador.nombre_completo} — ${frecuencia} (${nuevosPagosCount}/${maxPagos})`,
                registrado_por: user.id
            })
        }

        // 7. Auditoría del pago
        await supabaseAdmin.from('auditoria').insert({
            tabla_afectada: 'nomina_personal',
            accion: 'pago_nomina',
            registro_id: nomina.id,
            usuario_id: user.id,
            detalle: {
                trabajador_id: nomina.trabajador_id,
                monto: montoPagarFinal,
                cuota: `${nuevosPagosCount}/${maxPagos}`,
                frecuencia,
                cuenta: cuenta?.nombre || 'N/A',
                incluye_bonos: bonosPeriodo > 0,
                adelanto_descontado: deduccionAdelanto,
                descuento_aplicado: deduccionDescuentoEfectiva
            }
        })

        // 8. Auditoría separada del descuento por tardanza (si se aplicó)
        if (deduccionDescuentoEfectiva > 0) {
            await supabaseAdmin.from('auditoria').insert({
                tabla_afectada: 'nomina_personal',
                accion: 'descuento_nomina',
                registro_id: nomina.id,
                usuario_id: user.id,
                detalle: {
                    trabajador_id: nomina.trabajador_id,
                    tipo: 'tardanza',
                    monto: deduccionDescuentoEfectiva,
                    descripcion: `Descuento por tardanza aplicado en cuota ${nuevosPagosCount}/${maxPagos}`,
                    descuento_pendiente_restante: nuevoDescuentoPendiente
                }
            })
        }

        // 9. Auditoría separada del adelanto descontado (si se aplicó)
        if (deduccionAdelanto > 0) {
            await supabaseAdmin.from('auditoria').insert({
                tabla_afectada: 'nomina_personal',
                accion: 'descuento_adelanto',
                registro_id: nomina.id,
                usuario_id: user.id,
                detalle: {
                    trabajador_id: nomina.trabajador_id,
                    tipo: 'adelanto',
                    monto: deduccionAdelanto,
                    descripcion: `Adelanto descontado en cuota ${nuevosPagosCount}/${maxPagos}`,
                    adelanto_pendiente_restante: nuevoAdelantoPendiente
                }
            })
        }

        return NextResponse.json({
            success: true,
            message: `Pago (${nuevosPagosCount}/${maxPagos}) realizado: S/ ${montoPagarFinal.toFixed(2)}`,
            neto: montoPagarFinal,
            adelantoRestante: nuevoAdelantoPendiente
        })

    } catch (error: any) {
        console.error('[NOMINA PAGAR]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
