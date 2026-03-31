import { createAdminClient } from '@/utils/supabase/admin'
import { createFullNotification } from '@/services/notification-service'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabaseAdmin = createAdminClient()

    try {
        const body = await request.json()
        const { userId, motivo } = body

        if (!userId || !motivo) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
        }

        // 1. Obtener datos del asesor
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo')
            .eq('id', userId)
            .single()

        const nombreCom = perfil?.nombre_completo || 'Un asesor'

        // 2. Obtener admins
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')
            .eq('activo', true)

        if (admins && admins.length > 0) {
            for (const admin of admins) {
                // `createFullNotification` inserta en 'notificaciones' y manda WebPush
                await createFullNotification(admin.id, {
                    titulo: `🚫 Bloqueo: ${nombreCom}`,
                    mensaje: `Inició su jornada pero está bloqueado. Motivo: ${motivo}`,
                    link: '/dashboard/admin',
                    tipo: 'error'
                })
            }
        }

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Error enviando alerta de bloqueo:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
