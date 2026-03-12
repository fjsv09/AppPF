import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - Obtener detalle de solicitud de renovación
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

        const { data: solicitud, error } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .select(`
                *,
                cliente:cliente_id(id, nombres, dni, telefono, direccion),
                prestamo:prestamo_id(
                    id, monto, interes, fecha_inicio, fecha_fin, 
                    estado, estado_mora, frecuencia, cuotas
                ),
                asesor:asesor_id(id, nombre_completo),
                supervisor:supervisor_id(id, nombre_completo),
                admin:admin_id(id, nombre_completo)
            `)
            .eq('id', id)
            .single()

        if (error || !solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        return NextResponse.json(solicitud)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
