import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const subscription = await request.json()
    const supabaseAdmin = createAdminClient()

    // Eliminar la suscripción específica
    const { error } = await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .match({ 
            usuario_id: user.id,
            subscription: subscription
        })

    if (error) {
        console.error('Error removing subscription:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
