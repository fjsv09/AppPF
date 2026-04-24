import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { action, id, cartera_id, nombre, tipo, usuarios_autorizados } = body
        const supabaseAdmin = createAdminClient()
        // 1. Verificar Rol Admin antes de cualquier acción
        const { createClient: createServerClient } = await import('@/utils/supabase/server')
        const supabase = await createServerClient()
        
        // 1. Verificar Rol Admin antes de cualquier acción
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
        
        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'No tienes permisos para realizar esta acción.' }, { status: 403 })
        }

        const isAdmin = true // Ya confirmamos que es admin arriba

        if (action === 'create') {
            if (!cartera_id || !nombre || !tipo) {
                return NextResponse.json({ error: 'Faltan datos requeridos.' }, { status: 400 })
            }
            const { data, error } = await supabaseAdmin.from('cuentas_financieras').insert({
                cartera_id,
                nombre,
                tipo,
                saldo: 0,
                usuarios_autorizados: isAdmin ? (usuarios_autorizados || []) : []
            }).select().single()
            
            if (error) throw error
            return NextResponse.json({ success: true, message: 'Cuenta creada', data })
        }

        if (action === 'update') {
            if (!id || !nombre || !tipo) {
                return NextResponse.json({ error: 'Faltan datos requeridos.' }, { status: 400 })
            }
            const updateData: any = { nombre, tipo }
            if (isAdmin) {
                updateData.usuarios_autorizados = usuarios_autorizados || []
            }

            const { data, error } = await supabaseAdmin.from('cuentas_financieras')
                .update(updateData)
                .eq('id', id)
                .select().single()
                
            if (error) throw error
            return NextResponse.json({ success: true, message: 'Cuenta actualizada', data })
        }

        if (action === 'delete') {
            if (!id) return NextResponse.json({ error: 'ID de cuenta requerido.' }, { status: 400 })
            
            // Verificar saldo antes de eliminar
            const { data: cuenta, error: fetchError } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('saldo')
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
            return NextResponse.json({ success: true, message: 'Cuenta eliminada' })
        }

        return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
    } catch (error: any) {
        console.error('Error in cuentas endpoint:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor.' }, { status: 500 })
    }
}
