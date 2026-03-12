import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - Obtener notificaciones del usuario actual
export async function GET() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { data: notificaciones, error } = await supabaseAdmin
            .from('notificaciones')
            .select('*')
            .eq('usuario_destino_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('Error fetching notificaciones:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Contar no leídas
        const noLeidas = notificaciones?.filter(n => !n.leido).length || 0

        return NextResponse.json({
            notificaciones,
            no_leidas: noLeidas
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// PATCH - Marcar todas como leídas
export async function PATCH() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { error } = await supabaseAdmin
            .from('notificaciones')
            .update({ leido: true })
            .eq('usuario_destino_id', user.id)
            .eq('leido', false)

        if (error) {
            console.error('Error updating notificaciones:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
