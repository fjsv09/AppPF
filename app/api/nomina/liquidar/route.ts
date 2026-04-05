import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/nomina/liquidar — Calcular y ejecutar liquidación por renuncia
 * Body: { trabajadorId, cuentaOrigenId, notas? }
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // Verificar admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden ejecutar liquidaciones' }, { status: 403 })
        }

        const { trabajadorId, cuentaOrigenId, notas } = await request.json()

        if (!trabajadorId || !cuentaOrigenId) {
            return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
        }

        // 1. Obtener datos del trabajador
        const { data: trabajador, error: trabError } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, sueldo_base, fecha_ingreso, rol')
            .eq('id', trabajadorId)
            .single()

        if (trabError || !trabajador) {
            return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 })
        }

        // 2. Obtener cuenta origen
        const { data: cuenta, error: cuentaError } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuentaOrigenId)
            .single()

        if (cuentaError || !cuenta) {
            return NextResponse.json({ error: 'Cuenta de origen no encontrada' }, { status: 404 })
        }

        // 3. Calcular días trabajados en el mes actual
        const now = new Date()
        const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const currentMonth = limaDate.getMonth() + 1
        const currentYear = limaDate.getFullYear()
        const primerDiaMes = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
        const hoy = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`

        // Contar días con asistencia registrada en el mes
        const { data: asistencias, error: asistError } = await supabaseAdmin
            .from('asistencia_personal')
            .select('fecha')
            .eq('usuario_id', trabajadorId)
            .gte('fecha', primerDiaMes)
            .lte('fecha', hoy)

        const diasTrabajados = asistencias?.length || limaDate.getDate() // fallback al día del mes

        // 4. Obtener nómina del mes actual (puede no existir)
        const { data: nominaActual } = await supabaseAdmin
            .from('nomina_personal')
            .select('*')
            .eq('trabajador_id', trabajadorId)
            .eq('mes', currentMonth)
            .eq('anio', currentYear)
            .maybeSingle()

        const sueldoBase = trabajador.sueldo_base || 0
        const sueldoProporcional = parseFloat(((diasTrabajados / 30) * sueldoBase).toFixed(2))
        const bonos = nominaActual?.bonos || 0
        // Usar valores ORIGINALES (total real del mes, no el saldo pendiente)
        const descuentos = parseFloat(nominaActual?.descuentos_original || nominaActual?.descuentos || 0)
        const adelantos = parseFloat(nominaActual?.adelantos_original || nominaActual?.adelantos || 0)

        // 5. Obtener total ya pagado en cuotas de nómina (desde auditoría)
        let totalYaPagado = 0
        if (nominaActual?.id) {
            const { data: pagosHechos } = await supabaseAdmin
                .from('auditoria')
                .select('detalle')
                .eq('accion', 'pago_nomina')
                .eq('registro_id', nominaActual.id)

            totalYaPagado = (pagosHechos || []).reduce((acc: number, p: any) => 
                acc + parseFloat(p.detalle?.monto || 0), 0)
        }

        // Total = proporcional + bonos - descuentos_original - adelantos_original - ya pagado
        const totalLiquidacion = parseFloat((sueldoProporcional + bonos - descuentos - adelantos - totalYaPagado).toFixed(2))
        const montoAPagar = Math.max(0, totalLiquidacion) // Si es negativo, el trabajador debe

        // 6. Validar saldo (solo si hay que pagar)
        if (montoAPagar > 0 && parseFloat(cuenta.saldo) < montoAPagar) {
            return NextResponse.json({
                error: `Saldo insuficiente en "${cuenta.nombre}". Saldo: S/ ${parseFloat(cuenta.saldo).toFixed(2)}. Requerido: S/ ${montoAPagar.toFixed(2)}`
            }, { status: 400 })
        }

        // 7. Crear registro de liquidación
        const { data: liquidacion, error: liqError } = await supabaseAdmin
            .from('liquidaciones_personal')
            .insert({
                trabajador_id: trabajadorId,
                fecha_liquidacion: hoy,
                fecha_ingreso: trabajador.fecha_ingreso || null,
                dias_trabajados_mes: diasTrabajados,
                sueldo_base: sueldoBase,
                sueldo_proporcional: sueldoProporcional,
                bonos_acumulados: bonos,
                descuentos_acumulados: descuentos,
                adelantos_acumulados: adelantos,
                total_liquidacion: montoAPagar,
                estado: montoAPagar > 0 ? 'pagado' : 'saldado',
                cuenta_origen_id: montoAPagar > 0 ? cuentaOrigenId : null,
                pagado_por: user.id,
                notas: notas || `Liquidación por renuncia - ${trabajador.nombre_completo}${totalLiquidacion < 0 ? ` (Saldo a favor empresa: S/ ${Math.abs(totalLiquidacion).toFixed(2)})` : ''}`
            })
            .select()
            .single()

        if (liqError) {
            return NextResponse.json({ error: 'Error al crear liquidación: ' + liqError.message }, { status: 500 })
        }

        // 8. Descontar de cuenta si hay monto positivo a pagar
        if (montoAPagar > 0) {
            const nuevoSaldo = parseFloat(cuenta.saldo) - montoAPagar
            await supabaseAdmin
                .from('cuentas_financieras')
                .update({ saldo: nuevoSaldo })
                .eq('id', cuentaOrigenId)

            // Crear movimiento financiero
            await supabaseAdmin
                .from('movimientos_financieros')
                .insert({
                    cartera_id: cuenta.cartera_id,
                    cuenta_origen_id: cuentaOrigenId,
                    monto: montoAPagar,
                    tipo: 'egreso',
                    descripcion: `Liquidación por renuncia — ${trabajador.nombre_completo} — ${diasTrabajados} días trabajados`,
                    registrado_por: user.id
                })
        }

        // 9. Cerrar nómina del mes
        if (nominaActual && nominaActual.estado !== 'pagado') {
            await supabaseAdmin
                .from('nomina_personal')
                .update({ 
                    estado: 'liquidado',
                    notas: 'Cerrado por liquidación de renuncia'
                })
                .eq('id', nominaActual.id)
        }

        // 10. Auditoría
        await supabaseAdmin.from('auditoria').insert({
            tabla_afectada: 'liquidaciones_personal',
            accion: 'liquidacion_renuncia',
            registro_id: liquidacion.id,
            usuario_id: user.id,
            detalle: {
                trabajador_id: trabajadorId,
                trabajador: trabajador.nombre_completo,
                dias_trabajados: diasTrabajados,
                sueldo_proporcional: sueldoProporcional,
                bonos,
                descuentos,
                adelantos,
                total_ya_pagado: totalYaPagado,
                total_liquidacion: totalLiquidacion,
                monto_desembolsado: montoAPagar,
                saldo_favor_empresa: totalLiquidacion < 0 ? Math.abs(totalLiquidacion) : 0,
                cuenta: cuenta.nombre
            }
        })

        return NextResponse.json({
            success: true,
            liquidacion,
            message: `Liquidación procesada: S/ ${totalLiquidacion.toFixed(2)} (${diasTrabajados} días trabajados)`
        })
    } catch (error: any) {
        console.error('[NOMINA LIQUIDAR]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
