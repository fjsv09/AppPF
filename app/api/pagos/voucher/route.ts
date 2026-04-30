import { NextResponse } from 'next/server'
import { createAdminClient, requireRole } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
    // requireRole con todos los roles válidos = autenticación con info de perfil
    const guard = await requireRole(['admin', 'supervisor', 'secretaria', 'asesor', 'cobrador'])
    if ('error' in guard) return guard.error
    const { user, perfil } = guard
    const rol = perfil.rol

    try {
        const { pago_id } = await request.json()

        if (!pago_id || typeof pago_id !== 'string') {
            return NextResponse.json({ error: 'Falta pago_id' }, { status: 400 })
        }

        const supabaseAdmin = createAdminClient()

        // Verificar que el pago existe y validar autorización
        const { data: pago, error: errPago } = await supabaseAdmin
            .from('pagos')
            .select('id, registrado_por')
            .eq('id', pago_id)
            .maybeSingle()

        if (errPago || !pago) {
            return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
        }

        const esAdmin = rol === 'admin' || rol === 'supervisor' || rol === 'secretaria'
        const esDueno = pago.registrado_por === user.id
        if (!esAdmin && !esDueno) {
            return NextResponse.json({ error: 'No autorizado para este pago' }, { status: 403 })
        }

        const { error } = await supabaseAdmin
            .from('pagos')
            .update({ voucher_compartido: true })
            .eq('id', pago_id)

        if (error) {
            console.error('Error al actualizar voucher_compartido:', error.message)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Auditar el cambio
        await supabaseAdmin.from('auditoria').insert({
            tabla: 'pagos',
            accion: 'voucher_compartido',
            registro_id: pago_id,
            usuario_id: user.id,
            detalles: { voucher_compartido: true }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error en ruta de voucher:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
