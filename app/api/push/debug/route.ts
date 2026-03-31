import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import webpush from 'web-push'

export async function GET() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // 1. Check VAPID keys
        const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY

        // 2. Get all push subscriptions for this user
        const { data: subs, error: subsError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('usuario_id', user.id)

        // 3. Get user's profile
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo, rol')
            .eq('id', user.id)
            .single()

        // 4. Get all admins and their subscriptions
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol, activo')
            .eq('rol', 'admin')
            .eq('activo', true)

        let adminSubs: any[] = []
        if (admins && admins.length > 0) {
            for (const admin of admins) {
                const { data: adminSubData } = await supabaseAdmin
                    .from('push_subscriptions')
                    .select('id, usuario_id, created_at, subscription')
                    .eq('usuario_id', admin.id)

                adminSubs.push({
                    admin_id: admin.id,
                    admin_name: admin.nombre_completo,
                    activo: admin.activo,
                    subscription_count: adminSubData?.length || 0,
                    subscriptions: adminSubData?.map(s => ({
                        id: s.id,
                        created_at: s.created_at,
                        endpoint_snippet: typeof s.subscription === 'string' 
                            ? JSON.parse(s.subscription).endpoint?.substring(0, 60)
                            : s.subscription?.endpoint?.substring(0, 60)
                    }))
                })
            }
        }

        // 5. Try a test push to THIS user
        let testResult: any = null
        if (subs && subs.length > 0) {
            try {
                webpush.setVapidDetails(
                    'mailto:operaciones@profesional-pf.com',
                    vapidPublic!,
                    vapidPrivate!
                )

                const sub = typeof subs[0].subscription === 'string' 
                    ? JSON.parse(subs[0].subscription) 
                    : subs[0].subscription

                const testPayload = JSON.stringify({
                    title: '🔧 Push Debug Test',
                    body: `Prueba directa del servidor - ${new Date().toLocaleTimeString()}`,
                    url: '/dashboard/notificaciones'
                })

                const pushResult = await webpush.sendNotification(sub, testPayload)
                testResult = { 
                    success: true, 
                    statusCode: pushResult.statusCode,
                    headers: pushResult.headers 
                }
            } catch (pushErr: any) {
                testResult = { 
                    success: false, 
                    statusCode: pushErr.statusCode,
                    body: pushErr.body,
                    message: pushErr.message,
                    endpoint: pushErr.endpoint
                }
            }
        }

        return NextResponse.json({
            user_id: user.id,
            user_name: perfil?.nombre_completo,
            user_role: perfil?.rol,
            vapid: {
                public_key_exists: !!vapidPublic,
                public_key_length: vapidPublic?.length,
                private_key_exists: !!vapidPrivate,
                private_key_length: vapidPrivate?.length
            },
            my_subscriptions: {
                count: subs?.length || 0,
                error: subsError?.message,
                details: subs?.map(s => ({
                    id: s.id,
                    created_at: s.created_at,
                    endpoint_snippet: typeof s.subscription === 'string'
                        ? JSON.parse(s.subscription).endpoint?.substring(0, 80)
                        : s.subscription?.endpoint?.substring(0, 80)
                }))
            },
            admin_subscriptions: adminSubs,
            test_push_result: testResult
        })
    } catch (e: any) {
        console.error('Debug error:', e)
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
    }
}
