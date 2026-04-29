import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { generarCronogramaNode } from '@/lib/financial-logic'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // Verificar que sea admin o asesor del préstamo
        const { data: prestamo } = await supabaseAdmin
            .from('prestamos')
            .select('created_by, cliente:cliente_id(asesor_id)')
            .eq('id', id)
            .single()

        if (!prestamo) return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })

        // Solo admin puede regenerar cronogramas manualmente desde esta ruta por ahora
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden regenerar el cronograma manualmente' }, { status: 403 })
        }

        const result = await generarCronogramaNode(supabaseAdmin, id)
        return NextResponse.json(result)

    } catch (error: any) {
        console.error('Error in generar-cronograma route:', error)
        const isValidationError = error.message.includes('ya existen cuotas con pagos registrados');
        return NextResponse.json(
            { error: error.message }, 
            { status: isValidationError ? 400 : 500 }
        )
    }
}
