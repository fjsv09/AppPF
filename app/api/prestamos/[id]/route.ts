import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { addDays } from 'date-fns'
import { revalidatePath } from 'next/cache'


// Helper para fechas - MISMA LÓGICA QUE EN /api/prestamos/route.ts
function parseUTCDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
}

function formatUTCDate(date: Date): string {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

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
            return NextResponse.json({ error: 'Solo administradores pueden editar préstamos' }, { status: 403 })
        }

        // 2. Verificar si el préstamo tiene cuotas pagadas
        const { data: cuotasPagadas, error: checkError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id')
            .eq('prestamo_id', id)
            .gt('monto_pagado', 0)
            .limit(1)
        
        if (cuotasPagadas && cuotasPagadas.length > 0) {
            return NextResponse.json({ error: 'No se puede editar un préstamo que ya tiene cuotas pagadas total o parcialmente' }, { status: 400 })
        }

        // 3. Obtener datos actuales del préstamo
        const { data: prestamoActual, error: fetchError } = await supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .single()
        
        if (fetchError || !prestamoActual) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        const body = await request.json()
        const { monto, interes, fecha_inicio, frecuencia, cuotas, cuenta_id } = body

        // 4. Calcular diferencia de capital si aplica
        const nuevoMonto = parseFloat(monto || prestamoActual.monto)
        const diffMonto = nuevoMonto - prestamoActual.monto

        if (diffMonto !== 0) {
            if (!cuenta_id) {
                return NextResponse.json({ error: 'Se requiere una cuenta para procesar el cambio de capital' }, { status: 400 })
            }

            const { data: cuenta } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('*')
                .eq('id', cuenta_id)
                .single()
            
            if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

            if (diffMonto > 0) {
                // Aumento de capital: verificar saldo
                if (cuenta.saldo < diffMonto) {
                    return NextResponse.json({ error: `Saldo insuficiente en la cuenta ${cuenta.nombre}` }, { status: 400 })
                }
                // Descontar saldo
                await supabaseAdmin
                    .from('cuentas_financieras')
                    .update({ saldo: cuenta.saldo - diffMonto })
                    .eq('id', cuenta.id)
                
                // Registrar movimiento (egreso)
                await supabaseAdmin.from('movimientos_financieros').insert({
                    cartera_id: cuenta.cartera_id,
                    cuenta_origen_id: cuenta.id,
                    monto: diffMonto,
                    tipo: 'egreso',
                    descripcion: `Aumento de capital préstamo #${id.split('-')[0]}`,
                    registrado_por: user.id
                })
            } else {
                // Reducción de capital: devolver dinero
                const montoADevolver = Math.abs(diffMonto)
                await supabaseAdmin
                    .from('cuentas_financieras')
                    .update({ saldo: cuenta.saldo + montoADevolver })
                    .eq('id', cuenta.id)
                
                // Registrar movimiento (ingreso)
                await supabaseAdmin.from('movimientos_financieros').insert({
                    cartera_id: cuenta.cartera_id,
                    cuenta_origen_id: cuenta.id,
                    monto: montoADevolver,
                    tipo: 'ingreso',
                    descripcion: `Reducción de capital préstamo #${id.split('-')[0]}`,
                    registrado_por: user.id
                })
            }
        }

        // 5. Calcular nueva fecha_fin
        const fInicio = parseUTCDate(fecha_inicio || prestamoActual.fecha_inicio)
        let fFin = new Date(fInicio)
        const nCuotas = parseInt(cuotas || prestamoActual.cuotas)
        const nFrecuencia = frecuencia || prestamoActual.frecuencia

        switch (nFrecuencia) {
            case 'diario':
                fFin.setUTCDate(fFin.getUTCDate() + nCuotas)
                break
            case 'semanal':
                fFin.setUTCDate(fFin.getUTCDate() + (nCuotas * 7))
                break
            case 'quincenal':
                fFin.setUTCDate(fFin.getUTCDate() + (nCuotas * 15))
                break
            case 'mensual':
                fFin.setUTCMonth(fFin.getUTCMonth() + nCuotas)
                break
        }
        const nuevaFechaFin = formatUTCDate(fFin)

        // 6. Actualizar préstamo
        const { error: updateError } = await supabaseAdmin
            .from('prestamos')
            .update({
                monto: nuevoMonto,
                interes: parseFloat(interes || prestamoActual.interes),
                fecha_inicio: fecha_inicio || prestamoActual.fecha_inicio,
                frecuencia: nFrecuencia,
                cuotas: nCuotas,
                fecha_fin: nuevaFechaFin,
            })
            .eq('id', id)


        if (updateError) throw updateError

        // 7. Eliminar cronograma antiguo y regenerar MANUALMENTE
        // Esto garantiza que el cronograma siempre aparezca en ediciones administrativas
        await supabaseAdmin.from('cronograma_cuotas').delete().eq('prestamo_id', id)

        // Lógica de Generación Manual (Sincronizada con reglas de negocio)
        const totalPagar = nuevoMonto * (1 + (parseFloat(interes || prestamoActual.interes) / 100))
        const montoCuota = parseFloat((totalPagar / nCuotas).toFixed(2))
        
        const cuotasNuevas = []
        let fechaTemp = new Date(fInicio)

        for (let i = 1; i <= nCuotas; i++) {
            // Avanzar fecha según modalidad
            if (nFrecuencia === 'diario') {
                fechaTemp.setUTCDate(fechaTemp.getUTCDate() + 1)
                // Omitir domingos (Business Rule: Sistema PF no cobra domingos en diario)
                while (fechaTemp.getUTCDay() === 0) {
                    fechaTemp.setUTCDate(fechaTemp.getUTCDate() + 1)
                }
            } else if (nFrecuencia === 'semanal') {
                fechaTemp.setUTCDate(fechaTemp.getUTCDate() + 7)
            } else if (nFrecuencia === 'quincenal') {
                fechaTemp.setUTCDate(fechaTemp.getUTCDate() + 15)
            } else if (nFrecuencia === 'mensual') {
                fechaTemp.setUTCMonth(fechaTemp.getUTCMonth() + 1)
            }

            cuotasNuevas.push({
                prestamo_id: id,
                numero_cuota: i,
                monto_cuota: i === nCuotas ? parseFloat((totalPagar - (montoCuota * (nCuotas - 1))).toFixed(2)) : montoCuota,
                monto_pagado: 0,
                fecha_vencimiento: formatUTCDate(new Date(fechaTemp)),
                estado: 'pendiente'
            })
        }

        const { error: insertError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .insert(cuotasNuevas)

        if (insertError) throw insertError

        // Recalcular fecha_fin real basada en la última cuota (por si hubo saltos de domingos)
        const ultimaCuota = cuotasNuevas[cuotasNuevas.length - 1]
        if (ultimaCuota) {
            await supabaseAdmin
                .from('prestamos')
                .update({ fecha_fin: ultimaCuota.fecha_vencimiento })
                .eq('id', id)
        }


        // 8. Registrar en historial para que aparezca en la pestaña Historial
        await supabaseAdmin.rpc('registrar_cambio_estado', {
            p_prestamo_id: id,
            p_estado_anterior: prestamoActual.estado,
            p_estado_nuevo: prestamoActual.estado, // El estado no cambia, solo los datos
            p_dias_atraso: 0,
            p_motivo: `Edición administrativa: Capital ${prestamoActual.monto} -> ${nuevoMonto}, Cuotas ${prestamoActual.cuotas} -> ${nCuotas}`,
            p_responsable: user.id
        })


        // 7. Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'editar_prestamo',
            tabla_afectada: 'prestamos',
            registro_id: id,
            detalle: { antes: prestamoActual, despues: body, diffMonto, cuenta_id }
        })

        revalidatePath('/dashboard/prestamos', 'page')
        revalidatePath(`/dashboard/prestamos/${id}`, 'page')

        return NextResponse.json({ message: 'Préstamo actualizado exitosamente' })


    } catch (error: any) {
        console.error('ERROR EDITING LOAN:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
    }
}

export async function DELETE(
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
            return NextResponse.json({ error: 'Solo administradores pueden eliminar préstamos' }, { status: 403 })
        }

        // 2. Verificar si el préstamo tiene cuotas pagadas
        const { data: cuotasPagadas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id')
            .eq('prestamo_id', id)
            .gt('monto_pagado', 0)
            .limit(1)
        
        if (cuotasPagadas && cuotasPagadas.length > 0) {
            return NextResponse.json({ error: 'No se puede eliminar un préstamo con pagos realizados' }, { status: 400 })
        }

        // 3. Obtener datos antes de "eliminar" para devolver el dinero
        const { data: prestamoActual } = await supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .single()
        
        if (!prestamoActual) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

        const body = await request.json().catch(() => ({}))
        const { cuenta_id } = body // La cuenta donde se devolverá el dinero

        if (!cuenta_id) {
            return NextResponse.json({ error: 'Se requiere especificar la cuenta para devolver el capital' }, { status: 400 })
        }

        const { data: cuenta } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuenta_id)
            .single()
        
        if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

        // 4. Devolución de capital
        await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: cuenta.saldo + prestamoActual.monto })
            .eq('id', cuenta.id)
        
        // Registrar movimiento (ingreso)
        await supabaseAdmin.from('movimientos_financieros').insert({
            cartera_id: cuenta.cartera_id,
            cuenta_origen_id: cuenta.id,
            monto: prestamoActual.monto,
            tipo: 'ingreso',
            descripcion: `Devolución por eliminación de préstamo #${id.split('-')[0]}`,
            registrado_por: user.id
        })

        // 5. Eliminación lógica (Cambio de estado)
        const { error: updateError } = await supabaseAdmin
            .from('prestamos')
            .update({ estado: 'inactivo' }) // O 'anulado'? Prefiero 'inactivo' por requisito
            .eq('id', id)

        if (updateError) throw updateError

        // 6. Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'eliminar_prestamo',
            tabla_afectada: 'prestamos',
            registro_id: id,
            detalle: { monto: prestamoActual.monto, cuenta_id }
        })

        revalidatePath('/dashboard/prestamos', 'page')
        revalidatePath(`/dashboard/prestamos/${id}`, 'page')

        return NextResponse.json({ message: 'Préstamo desactivado y dinero devuelto' })


    } catch (error: any) {
        console.error('ERROR DELETING LOAN:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
    }
}
