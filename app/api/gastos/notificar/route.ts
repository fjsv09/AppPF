import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/gastos/notificar
 * Notifica a todos los admins cuando un supervisor o asesor registra un gasto.
 * Envía notificación de sistema (campanita) + push (navegador).
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        // Verificar autenticación
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const body = await request.json()
        const { monto, descripcion, categoria_nombre } = body

        if (!monto) {
            return NextResponse.json({ error: 'Monto requerido' }, { status: 400 })
        }

        // Obtener datos del usuario que registró el gasto
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo, rol')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
        }

        const registradorNombre = perfil.nombre_completo || 'Usuario'
        const rolLabel = perfil.rol === 'supervisor' ? 'Supervisor' : perfil.rol === 'asesor' ? 'Asesor' : perfil.rol
        const montoStr = parseFloat(monto).toFixed(2)
        const categoriaStr = categoria_nombre ? ` (${categoria_nombre})` : ''
        const descripcionCorta = descripcion ? (descripcion.length > 40 ? descripcion.substring(0, 40) + '...' : descripcion) : ''

        // Obtener todos los administradores activos
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')
            .eq('activo', true)

        if (!admins || admins.length === 0) {
            console.warn('[Gasto Notif] No hay admins activos para notificar')
            return NextResponse.json({ success: true, message: 'Sin admins para notificar' })
        }

        // Enviar notificación a cada admin (sistema + push)
        const results = await Promise.allSettled(
            admins.map(admin =>
                createFullNotification(admin.id, {
                    titulo: `💸 Nuevo Gasto Registrado`,
                    mensaje: `${registradorNombre} (${rolLabel}) registró un gasto de S/ ${montoStr}${categoriaStr}. ${descripcionCorta}`,
                    link: '/dashboard/gastos',
                    tipo: 'warning'
                })
            )
        )

        const exitosos = results.filter(r => r.status === 'fulfilled').length
        console.info(`[Gasto Notif] Notificaciones enviadas: ${exitosos}/${admins.length} admins`)

        return NextResponse.json({ success: true, notificados: exitosos })

    } catch (error: any) {
        console.error('[Gasto Notif] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
