import { NextResponse } from 'next/server'
import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'

export async function POST(request: Request) {
    const guard = await requireAdmin()
    if ('error' in guard) return guard.error
    const { user } = guard

    try {
        const body = await request.json()
        const { action, id, cartera_id, nombre, tipo, usuarios_autorizados } = body
        const supabaseAdmin = createAdminClient()

        const accionesValidas = ['create', 'update', 'delete']
        if (!accionesValidas.includes(action)) {
            return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
        }

        if (action === 'create') {
            if (!cartera_id || !nombre || !tipo) {
                return NextResponse.json({ error: 'Faltan datos requeridos.' }, { status: 400 })
            }
            const { data, error } = await supabaseAdmin.from('cuentas_financieras').insert({
                cartera_id,
                nombre,
                tipo,
                saldo: 0,
                usuarios_autorizados: usuarios_autorizados || []
            }).select().single()

            if (error) throw error

            await supabaseAdmin.from('auditoria').insert({
                tabla: 'cuentas_financieras',
                accion: 'create',
                registro_id: data.id,
                usuario_id: user.id,
                detalles: { nombre, tipo, cartera_id, usuarios_autorizados: usuarios_autorizados || [] }
            })

            return NextResponse.json({ success: true, message: 'Cuenta creada', data })
        }

        if (action === 'update') {
            if (!id || !nombre || !tipo) {
                return NextResponse.json({ error: 'Faltan datos requeridos.' }, { status: 400 })
            }

            // Estado previo para auditoría
            const { data: prev } = await supabaseAdmin.from('cuentas_financieras')
                .select('nombre, tipo, usuarios_autorizados').eq('id', id).maybeSingle()
            if (!prev) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

            const updateData: any = { nombre, tipo, usuarios_autorizados: usuarios_autorizados || [] }

            const { data, error } = await supabaseAdmin.from('cuentas_financieras')
                .update(updateData)
                .eq('id', id)
                .select().single()

            if (error) throw error

            await supabaseAdmin.from('auditoria').insert({
                tabla: 'cuentas_financieras',
                accion: 'update',
                registro_id: id,
                usuario_id: user.id,
                detalles: { antes: prev, despues: updateData }
            })

            return NextResponse.json({ success: true, message: 'Cuenta actualizada', data })
        }

        if (action === 'delete') {
            if (!id) return NextResponse.json({ error: 'ID de cuenta requerido.' }, { status: 400 })

            const { data: cuenta, error: fetchError } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('saldo, nombre')
                .eq('id', id)
                .single()

            if (fetchError || !cuenta) return NextResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 })

            if (parseFloat(cuenta.saldo) !== 0) {
                return NextResponse.json({ error: 'No se puede eliminar una cuenta con saldo positivo.' }, { status: 400 })
            }

            const { error: deleteError } = await supabaseAdmin
                .from('cuentas_financieras')
                .delete()
                .eq('id', id)

            if (deleteError) throw deleteError

            await supabaseAdmin.from('auditoria').insert({
                tabla: 'cuentas_financieras',
                accion: 'delete',
                registro_id: id,
                usuario_id: user.id,
                detalles: { nombre: cuenta.nombre }
            })

            return NextResponse.json({ success: true, message: 'Cuenta eliminada' })
        }

        return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
    } catch (error: any) {
        console.error('Error in cuentas endpoint:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor.' }, { status: 500 })
    }
}
