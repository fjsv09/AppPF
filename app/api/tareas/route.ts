import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Fetch tareas for this user (RLS will filter automatically, but we can be explicit if we use admin client. Let's use user client for RLS)
        const { data: tareas, error } = await supabase
            .from('tareas_evidencia')
            .select(`
                *,
                asesor:asesor_id(nombre_completo),
                prestamo:prestamo_id(
                    id, 
                    monto, 
                    cliente:cliente_id(nombres, foto_perfil)
                )
            `)
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching tareas:', error)
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        return NextResponse.json(tareas)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
