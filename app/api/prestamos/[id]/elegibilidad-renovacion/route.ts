import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - Verificar elegibilidad para renovación
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Evaluar elegibilidad usando la función RPC
        // Ahora la lógica de Principal/Paralelo vive dentro de este RPC
        const { data: elegibilidad, error } = await supabaseAdmin
            .rpc('evaluar_elegibilidad_renovacion', { p_prestamo_id: id })

        if (error) {
            console.error('Error evaluating eligibility:', error)
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        if (!elegibilidad.elegible) {
            return NextResponse.json({ 
                error: elegibilidad.razon_bloqueo,
                elegibilidad 
            }, { status: 400 })
        }

        return NextResponse.json(elegibilidad)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
