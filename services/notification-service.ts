import webpush from 'web-push';
import { createAdminClient } from '@/utils/supabase/admin';

// Validar que las llaves existan
if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('CRITICAL: VAPID keys are missing from environment variables.');
}


export async function sendPushNotification(usuarioId: string, payload: { title: string; body: string; url?: string }) {
    const supabaseAdmin = createAdminClient();

    // Configuración robusta de VAPID antes de cada envío
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
            'mailto:operaciones@profesional-pf.com', 
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
    } else {
        console.error('[WebPush] VAPID keys not configured - cannot send push');
        return { success: false, error: 'VAPID keys missing' };
    }
    
    // Obtener todas las suscripciones de push para el usuario
    const { data: subscriptions, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('subscription')
        .eq('usuario_id', usuarioId);

    console.log(`[WebPush DEBUG] Usuario: ${usuarioId} | Registros en DB: ${subscriptions?.length || 0}`);

    if (error) {
        console.error('Error fetching subscriptions from DB:', error);
        return { success: false, error };
    }

    if (!subscriptions || subscriptions.length === 0) {
        console.warn(`[WebPush] No active push subscriptions found for user ${usuarioId}. The user must activate notifications in the dashboard bell.`);
        return { success: false, message: 'No subscriptions found' };
    }

    console.info(`[WebPush] Sending push to ${subscriptions.length} devices for user ${usuarioId}`);

    const jsonPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || '/'
    });

    const results = await Promise.allSettled(subscriptions.map(async (row: any) => {
        const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
        try {
            const res = await webpush.sendNotification(sub, jsonPayload);
            console.log(`[Push Success] Usuario: ${usuarioId} | Status: ${res.statusCode} | Endpoint: ${sub.endpoint.substring(0, 40)}...`);
            return { success: true, status: res.statusCode };
        } catch (err: any) {
            console.error(`[Push Failed] Status: ${err.statusCode} | Usuario: ${usuarioId}`);
            
            if (err.statusCode === 410 || err.statusCode === 404) {
                console.warn(`[Push Cleanup] Borrando suscripción caducada (${err.statusCode})`);
                await supabaseAdmin
                    .from('push_subscriptions')
                    .delete()
                    .eq('usuario_id', usuarioId)
                    .match({ subscription: row.subscription });
            } else {
                console.error('[Push Error Critico] Error inesperado:', {
                    status: err.statusCode,
                    body: err.body,
                    message: err.message
                });
            }
            throw err;
        }
    }));

    const totalSent = results.filter(r => r.status === 'fulfilled').length;
    console.info(`[Push Summary] Usuario: ${usuarioId} | Enviados con éxito: ${totalSent} de ${subscriptions.length}`);

    return results;
}

/**
 * Helper unificado para crear notificación y enviar push.
 * Uses DIRECT insert instead of RPC for reliability, ensuring the Realtime channel always fires.
 */
export async function createFullNotification(usuarioId: string, data: { titulo: string; mensaje: string; link?: string; tipo?: string }) {
    const supabaseAdmin = createAdminClient();
    
    // 1. Insert notification directly into the table (more reliable than RPC for Realtime)
    const { data: notification, error } = await supabaseAdmin
        .from('notificaciones')
        .insert({
            usuario_destino_id: usuarioId,
            titulo: data.titulo,
            mensaje: data.mensaje,
            link_accion: data.link || null,
            tipo: data.tipo || 'info',
            leido: false
        })
        .select('id')
        .single();

    if (error) {
        console.error('[createFullNotification] Error inserting notification:', error);
        // Fallback: try the RPC method
        const { data: notifId, error: rpcError } = await supabaseAdmin.rpc('crear_notificacion', {
            p_usuario_id: usuarioId,
            p_titulo: data.titulo,
            p_mensaje: data.mensaje,
            p_link: data.link || null,
            p_tipo: data.tipo || 'info'
        });
        if (rpcError) {
            console.error('[createFullNotification] RPC fallback also failed:', rpcError);
        }
    }

    // 2. Send push notification (independent of DB notification)
    try {
        await sendPushNotification(usuarioId, {
            title: data.titulo,
            body: data.mensaje,
            url: data.link
        });
    } catch (pushErr) {
        console.error('[createFullNotification] Push notification failed:', pushErr);
    }

    return notification?.id || null;
}
