import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
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
            return NextResponse.json({ error: 'Solo administradores pueden restaurar préstamos' }, { status: 403 })
        }

        // 2. Obtener datos del préstamo inactivo
        const { data: prestamoActual } = await supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .single()
        
        if (!prestamoActual) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        if (prestamoActual.estado !== 'inactivo') {
            return NextResponse.json({ error: 'Solo se pueden restaurar préstamos inactivatados' }, { status: 400 })
        }

        const body = await request.json()
        const { cuenta_id } = body 

        if (!cuenta_id) {
            return NextResponse.json({ error: 'Se requiere especificar la cuenta para de donde saldrá el capital' }, { status: 400 })
        }

        const { data: cuenta } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuenta_id)
            .single()
        
        if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

        // 3. Validar saldo
        if (cuenta.saldo < prestamoActual.monto) {
            return NextResponse.json({ error: 'Saldo insuficiente para restaurar el préstamo' }, { status: 400 })
        }

        // 4. Descontar capital
        await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: cuenta.saldo - prestamoActual.monto })
            .eq('id', cuenta.id)
        
        // Registrar movimiento (egreso)
        await supabaseAdmin.from('movimientos_financieros').insert({
            cartera_id: cuenta.cartera_id,
            cuenta_origen_id: cuenta.id,
            monto: prestamoActual.monto,
            tipo: 'egreso',
            descripcion: `Restauración de préstamo #${id.split('-')[0]}`,
            registrado_por: user.id
        })

        // 5. Reactivación
        const { error: updateError } = await supabaseAdmin
            .from('prestamos')
            .update({ estado: 'activo' })
            .eq('id', id)

        if (updateError) throw updateError

        // 6. Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'restaurar_prestamo',
            tabla_afectada: 'prestamos',
            registro_id: id,
            detalle: { monto: prestamoActual.monto, cuenta_id }
        })

        return NextResponse.json({ message: 'Préstamo restaurado exitosamente' })

    } catch (error: any) {
        console.error('ERROR RESTORING LOAN:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
    }
}
