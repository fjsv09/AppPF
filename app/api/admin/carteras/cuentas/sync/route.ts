import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { cuenta_id } = body
        
        if (!cuenta_id) {
            return NextResponse.json({ error: 'ID de cuenta requerido.' }, { status: 400 })
        }

        const { requireAdmin } = await import('@/utils/supabase/admin')
        const authCheck = await requireAdmin()
        if ('error' in authCheck) return authCheck.error

        const supabaseAdmin = createAdminClient()

        
        // 1. Obtener todos los movimientos asociados a esta cuenta
        const { data: movimientos, error: movError } = await supabaseAdmin
            .from('movimientos_financieros')
            .select('tipo, monto, cuenta_origen_id, cuenta_destino_id')
            .or(`cuenta_origen_id.eq.${cuenta_id},cuenta_destino_id.eq.${cuenta_id}`)

        if (movError) throw movError

        // 2. Calcular el saldo real
        // Un ingreso es cuando la cuenta es destino.
        // Un egreso es cuando la cuenta es origen.
        let saldoReal = 0
        movimientos.forEach(m => {
            const monto = parseFloat(m.monto?.toString() || '0')
            if (m.cuenta_destino_id === cuenta_id) {
                saldoReal += monto
            } else if (m.cuenta_origen_id === cuenta_id) {
                saldoReal -= monto
            }
        })

        // 3. Actualizar la cuenta con el saldo calculado
        const { error: updateError } = await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: saldoReal })
            .eq('id', cuenta_id)

        if (updateError) throw updateError

        return NextResponse.json({ 
            success: true, 
            message: 'Saldo sincronizado correctamente', 
            nuevo_saldo: saldoReal 
        })

    } catch (error: any) {
        console.error('Error sincronizando saldo:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
