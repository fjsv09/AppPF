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

    let subscription: any;
    try {
        subscription = await request.json();
    } catch (parseErr) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!subscription || !subscription.endpoint) {
        return NextResponse.json({ error: 'Invalid subscription: missing endpoint' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient();

    try {
        // Delete all previous subscriptions for this user
        const { error: deleteError } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('usuario_id', user.id);

        if (deleteError) {
            console.error('[SUBSCRIBE] Error cleaning previous subscriptions:', deleteError);
            // Continue anyway - we'll try to insert
        }

        // Insert the fresh subscription
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
            console.error('[SUBSCRIBE] Error saving to DB:', error);
            return NextResponse.json({ 
                error: error.message,
                details: error.details,
                hint: error.hint
            }, { status: 500 });
        }

        console.info(`[SUBSCRIBE SUCCESS] Push subscription registered for user: ${user.id} | Endpoint: ${subscription.endpoint.substring(0, 50)}...`);

        return NextResponse.json({ success: true, data: sub_res });
    } catch (err: any) {
        console.error('[SUBSCRIBE] Unexpected error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
