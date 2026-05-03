import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden eliminar gastos' }, { status: 403 })
        }

        // Obtener el movimiento antes de eliminar
        const { data: movimiento, error: fetchError } = await supabaseAdmin
            .from('movimientos_financieros')
            .select('id, monto, cuenta_origen_id, descripcion, tipo')
            .eq('id', id)
            .single()

        if (fetchError || !movimiento) {
            return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
        }

        if (movimiento.tipo !== 'egreso') {
            return NextResponse.json({ error: 'Solo se pueden eliminar gastos (egresos)' }, { status: 400 })
        }

        // Eliminar el movimiento
        const { error: deleteError } = await supabaseAdmin
            .from('movimientos_financieros')
            .delete()
            .eq('id', id)

        if (deleteError) {
            return NextResponse.json({ error: `Error al eliminar: ${deleteError.message}` }, { status: 500 })
        }

        // Restaurar el saldo de la cuenta afectada
        if (movimiento.cuenta_origen_id) {
            const { data: cuenta } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('saldo')
                .eq('id', movimiento.cuenta_origen_id)
                .single()

            if (cuenta) {
                const nuevoSaldo = parseFloat(cuenta.saldo) + parseFloat(movimiento.monto)
                await supabaseAdmin
                    .from('cuentas_financieras')
                    .update({ saldo: nuevoSaldo })
                    .eq('id', movimiento.cuenta_origen_id)
            }
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'eliminar_gasto',
            tabla_afectada: 'movimientos_financieros',
            detalle: {
                movimiento_id: id,
                monto: movimiento.monto,
                descripcion: movimiento.descripcion,
                cuenta_origen_id: movimiento.cuenta_origen_id,
            },
        })

        return NextResponse.json({ success: true, montoRestaurado: movimiento.monto })

    } catch (error: any) {
        console.error('Error eliminando gasto:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
