import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

        // Verificar rol admin
        const { data: profile } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()
        
        if (profile?.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo el administrador puede realizar pagos de nómina' }, { status: 403 })
        }

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

        if (deduccionAdelanto > 0) {
            updatePayload.adelantos_original = parseFloat(nomina.adelantos_original || 0) + deduccionAdelanto
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

        // 7. Registro en la nueva tabla dedicada (transacciones_personal)
        const transacciones = []

        // A. Transacción de Pago de Sueldo
        transacciones.push({
            trabajador_id: nomina.trabajador_id,
            nomina_id: nomina.id,
            tipo: 'pago',
            monto: montoPagarFinal - bonosPeriodo, // El pago base (neto sin el bono)
            descripcion: `Pago de Nómina - Cuota ${nuevosPagosCount}/${maxPagos}`,
            cuenta_id: cuentaOrigenId,
            metadatos: {
                cuota: `${nuevosPagosCount}/${maxPagos}`,
                frecuencia,
                bruto_base: sueldoBasePeriodo,
                adelanto_descontado: deduccionAdelanto,
                descuento_aplicado: deduccionDescuentoEfectiva,
                cuenta: cuenta?.nombre
            },
            registrado_por: user.id
        })

        // B. Transacción de Bonos (Separada si existen)
        if (bonosPeriodo > 0) {
            transacciones.push({
                trabajador_id: nomina.trabajador_id,
                nomina_id: nomina.id,
                tipo: 'bono',
                monto: bonosPeriodo,
                descripcion: `Pago de Bonos de Producción - Mes ${nomina.mes}/${nomina.anio}`,
                cuenta_id: cuentaOrigenId,
                metadatos: {
                    cuota: `${nuevosPagosCount}/${maxPagos}`,
                    cuenta: cuenta?.nombre
                },
                registrado_por: user.id
            })
        }

        // C. Registro de Descuento por Tardanza (como transacción informativa de ajuste)
        if (deduccionDescuentoEfectiva > 0) {
            transacciones.push({
                trabajador_id: nomina.trabajador_id,
                nomina_id: nomina.id,
                tipo: 'descuento',
                monto: deduccionDescuentoEfectiva,
                descripcion: `Descuento por Tardanza - Aplicado en Cuota ${nuevosPagosCount}/${maxPagos}`,
                metadatos: {
                    tipo: 'tardanza',
                    pendiente_restante: nuevoDescuentoPendiente
                },
                registrado_por: user.id
            })
        }

        // D. Registro de Amortización de Adelanto (Opcional - Se omite para evitar duplicidad visual con el registro original de adelanto)
        /* 
        if (deduccionAdelanto > 0) {
            transacciones.push({
                trabajador_id: nomina.trabajador_id,
                nomina_id: nomina.id,
                tipo: 'descuento',
                monto: deduccionAdelanto,
                descripcion: `Amortización de Adelanto - Descontado en Cuota ${nuevosPagosCount}/${maxPagos}`,
                metadatos: {
                    tipo: 'adelanto',
                    pendiente_restante: nuevoAdelantoPendiente
                },
                registrado_por: user.id
            })
        }
        */

        const { error: transError } = await supabaseAdmin.from('transacciones_personal').insert(transacciones)
        if (transError) console.error('[TRANSACCIONES ERROR]', transError)

        // 8. Auditoría (Legacy)
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
