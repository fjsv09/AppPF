import webpush from 'web-push';
import { createAdminClient } from '@/utils/supabase/admin';

// Validar que las llaves existan
if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('CRITICAL: VAPID keys are missing from environment variables.');
}

webpush.setVapidDetails(
    'mailto:operaciones@profesional-pf.com', 
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    process.env.VAPID_PRIVATE_KEY || ''
);

export async function sendPushNotification(usuarioId: string, payload: { title: string; body: string; url?: string }) {
    const supabaseAdmin = createAdminClient();
    
    // Obtener todas las suscripciones de push para el usuario
    const { data: subscriptions, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('subscription')
        .eq('usuario_id', usuarioId);

    if (error) {
        console.error('Error fetching subscriptions from DB:', error);
        return { success: false, error };
    }

    if (!subscriptions || subscriptions.length === 0) {
        console.log(`No active push subscriptions for user ${usuarioId}`);
        return { success: false, message: 'No subscriptions found' };
    }

    console.log(`Sending push to ${subscriptions.length} devices for user ${usuarioId}`);

    const jsonPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || '/'
    });

    const results = await Promise.allSettled(subscriptions.map(async (row: any) => {
        try {
            // Asegurarnos de que row.subscription es un objeto válido para web-push
            const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
            
            await webpush.sendNotification(sub, jsonPayload);
            return { success: true };
        } catch (err: any) {
            console.error('[WebPush] Send failed:', err.statusCode, err.endpoint);
            
            if (err.statusCode === 410 || err.statusCode === 404) {
                console.log('[WebPush] Removing expired subscription');
                await supabaseAdmin
                    .from('push_subscriptions')
                    .delete()
                    .eq('usuario_id', usuarioId)
                    .match({ subscription: row.subscription });
            }
            throw err;
        }
    }));

    return results;
}

/**
 * Helper unificado para crear notificación y enviar push
 */
export async function createFullNotification(usuarioId: string, data: { titulo: string; mensaje: string; link?: string; tipo?: string }) {
    const supabaseAdmin = createAdminClient();
    
    // 1. Crear notificación en DB (llamando al RPC existente)
    const { data: notifId, error } = await supabaseAdmin.rpc('crear_notificacion', {
        p_usuario_id: usuarioId,
        p_titulo: data.titulo,
        p_mensaje: data.mensaje,
        p_link: data.link || null,
        p_tipo: data.tipo || 'info'
    });

    if (error) {
        console.error('Error creating database notification:', error);
    }

    // 2. Intentar enviar push
    try {
        await sendPushNotification(usuarioId, {
            title: data.titulo,
            body: data.mensaje,
            url: data.link
        });
    } catch (pushErr) {
        console.error('Error in sendPushNotification wrapper:', pushErr);
    }

    return notifId;
}
