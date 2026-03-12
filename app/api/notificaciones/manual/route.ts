import { createAdminClient } from '@/utils/supabase/admin';
import { sendPushNotification } from '@/services/notification-service';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabaseAdmin = createAdminClient();

  try {
    const body = await request.json();
    const { usuario_id, titulo, mensaje, link, tipo } = body;

    if (!usuario_id || !titulo || !mensaje) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });
    }

    // 1. Insertar en tabla notificaciones (para la campanita)
    const { data: notification, error: insertError } = await supabaseAdmin
      .from('notificaciones')
      .insert({
        usuario_destino_id: usuario_id,
        titulo,
        mensaje,
        link_accion: link || null,
        tipo: tipo || 'info',
        leido: false
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 2. Enviar notificación Push (para el navegador)
    await sendPushNotification(usuario_id, {
      title: titulo,
      body: mensaje,
      url: link || '/'
    });

    return NextResponse.json({ success: true, notification });
  } catch (err: any) {
    console.error('Error in manual notification API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
