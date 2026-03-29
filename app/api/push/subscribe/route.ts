import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const subscription = await request.json();
    const supabaseAdmin = createAdminClient();

    // LIMPIEZA ABSOLUTA: Borramos cualquier rastro previo para el usuario
    const { error: deleteError } = await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .eq('usuario_id', user.id);

    if (deleteError) {
        console.error('[SUBSCRIBE] Error limpiando registros previos:', deleteError);
    }

    // REGISTRO FRESCO: Insertar la suscripción recibida del navegador actual
    const { data: sub_res, error } = await supabaseAdmin
        .from('push_subscriptions')
        .insert({
            usuario_id: user.id,
            subscription: subscription,
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('[SUBSCRIBE] Error guardando en DB:', error);
        return NextResponse.json({ 
            error: error.message,
            details: error.details,
            hint: error.hint
        }, { status: 500 });
    }

    console.info(`[SUBSCRIBE SUCCESS] Canal único registrado para: ${user.id}`);

    return NextResponse.json({ success: true, data: sub_res });
}
