import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/nomina/adelanto — Registrar un adelanto de sueldo
 * Body: { trabajadorId, cuentaId, monto, concepto? }
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // Verificar rol admin/supervisor
        const { data: perfilUser } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfilUser || !['admin', 'supervisor'].includes(perfilUser.rol)) {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 })
        }

        const { trabajadorId, cuentaId, monto, concepto } = await request.json()

        if (!trabajadorId || !cuentaId || !monto || monto <= 0) {
            return NextResponse.json({ error: 'Faltan datos requeridos (monto debe ser positivo)' }, { status: 400 })
        }

        // 1. Obtener registro de nómina del mes actual
        const now = new Date()
        const mes = now.getMonth() + 1
        const anio = now.getFullYear()

        let { data: nomina, error: nominaError } = await supabaseAdmin
            .from('nomina_personal')
            .select('*')
            .eq('trabajador_id', trabajadorId)
            .eq('mes', mes)
            .eq('anio', anio)
            .maybeSingle()

        // Si no existe nómina para el mes, la creamos
        if (!nomina) {
            const { data: worker } = await supabaseAdmin
                .from('perfiles')
                .select('sueldo_base')
                .eq('id', trabajadorId)
                .single()

            const { data: newNomina, error: createError } = await supabaseAdmin
                .from('nomina_personal')
                .insert({
                    trabajador_id: trabajadorId,
                    mes,
                    anio,
                    sueldo_base: worker?.sueldo_base || 0,
                    adelantos: 0,
                    descuentos: 0,
                    bonos: 0,
                    estado: 'pendiente'
                })
                .select()
                .single()
            
            if (createError) throw createError
            nomina = newNomina
        }

        // 2. Validar saldo en cuenta
        const { data: cuenta } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuentaId)
            .single()

        if (!cuenta || parseFloat(cuenta.saldo) < monto) {
            return NextResponse.json({ error: 'Saldo insuficiente en la cuenta seleccionada' }, { status: 400 })
        }

        // 3. Ejecutar transacción: registrar adelanto y descontar saldo
        // Incrementar adelanto en nómina
        const nuevoAdelantoTotal = parseFloat(nomina.adelantos || 0) + parseFloat(monto)
        const { error: updNominaError } = await supabaseAdmin
            .from('nomina_personal')
            .update({ 
                adelantos: nuevoAdelantoTotal,
                adelantos_original: parseFloat(nomina.adelantos_original || 0) + parseFloat(monto)
            })
            .eq('id', nomina.id)

        if (updNominaError) throw updNominaError

        // Descontar saldo de la cuenta
        const nuevoSaldo = parseFloat(cuenta.saldo) - parseFloat(monto)
        const { error: updCuentaError } = await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: nuevoSaldo })
            .eq('id', cuentaId)

        if (updCuentaError) throw updCuentaError

        // 4. Crear movimiento financiero
        const { data: trabajador } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo')
            .eq('id', trabajadorId)
            .single()

        const { error: moveError } = await supabaseAdmin
            .from('movimientos_financieros')
            .insert({
                cartera_id: cuenta.cartera_id,
                cuenta_origen_id: cuentaId,
                monto: monto,
                tipo: 'egreso',
                descripcion: `Adelanto de sueldo — ${trabajador?.nombre_completo || 'T.'} — ${concepto || 'S/ ' + monto}`,
                registrado_por: user.id
            })

        // 5. Registrar Transacción en la nueva tabla dedicada
        await supabaseAdmin.from('transacciones_personal').insert({
            trabajador_id: trabajadorId,
            nomina_id: nomina.id,
            tipo: 'adelanto',
            monto: monto,
            descripcion: `Adelanto de sueldo - ${concepto || (cuenta.nombre)}`,
            cuenta_id: cuentaId,
            metadatos: {
                mes,
                anio,
                cuenta: cuenta.nombre,
                concepto
            },
            registrado_por: user.id
        })

        // 6. Auditoría (legacy)
        const { error: auditError } = await supabaseAdmin.from('auditoria').insert({
            tabla_afectada: 'nomina_personal',
            accion: 'registro_adelanto',
            registro_id: nomina.id,
            usuario_id: user.id,
            detalle: {
                trabajador_id: trabajadorId,
                monto,
                mes,
                anio,
                cuenta: cuenta.nombre
            }
        })

        if (auditError) {
            console.error('[AUDIT ERROR]', auditError)
        }

        return NextResponse.json({ 
            success: true, 
            message: `Adelanto de S/ ${parseFloat(monto).toFixed(2)} registrado correctamente` 
        })

    } catch (error: any) {
        console.error('[NOMINA ADELANTO]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
