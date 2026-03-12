import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

// PATCH - Marcar notificación específica como leída
export async function PATCH(
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

        const { data: updated, error } = await supabaseAdmin
            .from('notificaciones')
            .update({ leido: true })
            .eq('id', id)
            .eq('usuario_destino_id', user.id)
            .select()
            .single()

        if (error) {
            console.error('Error updating notificacion:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(updated)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
