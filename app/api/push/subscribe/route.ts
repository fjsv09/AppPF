import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const subscription = await request.json()
    const supabaseAdmin = createAdminClient()

    // Guardar o actualizar suscripción
    // Usamos el endpoint para el usuario autenticado
    const { error } = await supabaseAdmin
        .from('push_subscriptions')
        .upsert({
            usuario_id: user.id,
            subscription: subscription,
            created_at: new Date().toISOString()
        }, {
            onConflict: 'usuario_id, subscription' // Idealmente tendríamos una clave única combinada o solo usuario_id si permitimos 1 dispositivo
        })

    if (error) {
        console.error('Error saving subscription:', error)
        return NextResponse.json({ 
            error: error.message,
            details: error.details,
            hint: error.hint
        }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
