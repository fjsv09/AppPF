import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
    try {
        const { pago_id } = await request.json()

        if (!pago_id) {
            return NextResponse.json({ error: 'Falta pago_id' }, { status: 400 })
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Marcar el voucher como compartido silenciosamente
        const { error } = await supabaseAdmin
            .from('pagos')
            .update({ voucher_compartido: true })
            .eq('id', pago_id)

        if (error) {
            console.error('Error al actualizar voucher_compartido:', error.message)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error en ruta de voucher:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
