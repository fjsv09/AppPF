import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

function timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
}

function isWithinWindow(currentTime: string, targetTime: string, windowMinutes: number = 10): boolean {
    const current = timeToMinutes(currentTime)
    const target = timeToMinutes(targetTime)
    return Math.abs(current - target) <= windowMinutes
}

/**
 * GET /api/cron/asistencia-recordatorio
 * Este endpoint debe ser llamado periódicamente (ej. cada minuto o cada 5 minutos)
 */
export async function GET(request: Request) {
    // Validar secreto de cron — el middleware excluye /api/cron, esta es la única protección
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
        console.error('[CRON ERROR] CRON_SECRET no configurado')
        return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabaseAdmin = createAdminClient()

    try {
        // 1. Obtener fecha y hora actual en Lima
        const now = new Date()
        const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const todayStr = `${limaDate.getFullYear()}-${String(limaDate.getMonth() + 1).padStart(2, '0')}-${String(limaDate.getDate()).padStart(2, '0')}`
        const currentHHmm = `${String(limaDate.getHours()).padStart(2, '0')}:${String(limaDate.getMinutes()).padStart(2, '0')}`
        const isSunday = limaDate.getDay() === 0

        console.info(`[CRON REMINDER] Ejecución: ${todayStr} ${currentHHmm}`)

        // 2. Verificar si es domingo
        if (isSunday) {
            return NextResponse.json({ message: 'Hoy es domingo, no hay recordatorios.' })
        }

        // 3. Verificar si hoy es feriado
        const { data: holiday } = await supabaseAdmin
            .from('feriados')
            .select('id')
            .eq('fecha', todayStr)
            .maybeSingle()

        if (holiday) {
            return NextResponse.json({ message: 'Hoy es feriado, no hay recordatorios.' })
        }

        // 4. Obtener configuración de horarios
        const { data: configRows } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', [
                'horario_apertura',
                'horario_fin_turno_1',
                'horario_cierre',
                'NEXT_PUBLIC_VAPID_PUBLIC_KEY'
            ])

        // También necesitamos la llave privada de Vercel/Env
        const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY

        if (!vapidPublic || !vapidPrivate) {
            console.error('[CRON ERROR] VAPID keys missing')
            return NextResponse.json({ error: 'Configuración de Push incompleta' }, { status: 500 })
        }

        const config = configRows?.reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        const hApertura = config?.horario_apertura || '08:00'
        const hTurnoTarde = config?.horario_fin_turno_1 || '13:30'
        const hCierre = config?.horario_cierre || '19:00'

        // 5. Determinar si estamos dentro de la ventana de alguno de los 3 horarios
        // Ventana de ±10 minutos alrededor de cada horario configurado
        let eventLabel = ''
        let eventField = ''

        if (isWithinWindow(currentHHmm, hApertura, 10)) {
            eventLabel = 'Entrada'
            eventField = 'hora_entrada'
        } else if (isWithinWindow(currentHHmm, hTurnoTarde, 10)) {
            eventLabel = 'Turno Tarde'
            eventField = 'hora_turno_tarde'
        } else if (isWithinWindow(currentHHmm, hCierre, 10)) {
            eventLabel = 'Cierre Final'
            eventField = 'hora_cierre'
        }

        if (!eventLabel) {
            return NextResponse.json({
                message: 'No hay recordatorios pendientes en esta ventana horaria.',
                current: currentHHmm,
                schedules: { hApertura, hTurnoTarde, hCierre }
            })
        }

        console.info(`[CRON REMINDER] Identificado evento: ${eventLabel}`)

        // 6. Configurar Web Push
        webpush.setVapidDetails(
            'mailto:operaciones@profesional-pf.com',
            vapidPublic,
            vapidPrivate
        )

        // 7. Buscar usuarios que NO han marcado este evento hoy
        // Obtenemos todos los perfiles activos exceptuando quizás administradores si no marcan
        const { data: perfiles, error: perfilesError } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .eq('activo', true)
            // .neq('rol', 'admin') // Opcional: ¿admin marca asistencia? Generalmente sí en este sistema

        if (perfilesError || !perfiles) {
            throw new Error(`Error cargando perfiles: ${perfilesError?.message}`)
        }

        // 8. Buscar registros de asistencia de hoy
        const { data: asistencias } = await supabaseAdmin
            .from('asistencia_personal')
            .select(`usuario_id, ${eventField}`)
            .eq('fecha', todayStr)

        const yaMarcadosIds = new Set(asistencias?.filter((a: any) => a[eventField] !== null).map((a: any) => a.usuario_id) || [])

        // Filtrar los que faltan marcar
        const faltanMarcar = perfiles.filter(p => !yaMarcadosIds.has(p.id))

        if (faltanMarcar.length === 0) {
            return NextResponse.json({ message: `Todos han marcado ${eventLabel} hoy.` })
        }

        console.info(`[CRON REMINDER] ${faltanMarcar.length} personas faltan marcar ${eventLabel}`)

        // 9. Obtener suscripciones de push para estos usuarios
        const faltanIds = faltanMarcar.map(p => p.id)
        const { data: subscriptions, error: subsError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .in('usuario_id', faltanIds)

        if (subsError) throw new Error(`Error cargando suscripciones: ${subsError.message}`)

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ 
                message: `Recordatorio cancelado: Ninguno de los ${faltanMarcar.length} usuarios tiene suscripción push activa.` 
            })
        }

        // 10. Enviar notificaciones (Push y Sistema)
        const results = {
            push_success: 0,
            push_failure: 0,
            system_success: 0,
            details: [] as any[]
        }

        const payload = JSON.stringify({
            title: '⏰ Recordatorio de Asistencia',
            body: `Es hora de marcar tu ${eventLabel}. ¡No olvides registrarte!`,
            url: '/dashboard'
        })

        // Notificaciones por SISTEMA (para ver en el dashboard / campanita)
        // Insertar para cada persona que falta marcar
        for (const p of faltanMarcar) {
            try {
                await supabaseAdmin.from('notificaciones').insert({
                    usuario_destino_id: p.id,
                    titulo: '⏰ Recordatorio de Asistencia',
                    mensaje: `Es hora de registrar tu ${eventLabel}. Por favor hazlo pronto.`,
                    link_accion: '/dashboard',
                    tipo: 'warning',
                    leido: false
                })
                results.system_success++
            } catch (err: any) {
                console.error(`[CRON] Error insertando notif sistema para ${p.id}:`, err.message)
            }
        }

        // Notificaciones por PUSH (Chrome)
        // Nota: Un usuario puede tener múltiples suscripciones o ninguna
        await Promise.all(subscriptions.map(async (subRow) => {
            try {
                const sub = typeof subRow.subscription === 'string' 
                    ? JSON.parse(subRow.subscription) 
                    : subRow.subscription
                
                await webpush.sendNotification(sub, payload)
                results.push_success++
            } catch (err: any) {
                results.push_failure++
                // Si la suscripción ya no es válida (410 Gone), eliminarla
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await supabaseAdmin.from('push_subscriptions').delete().eq('id', subRow.id)
                }
                results.details.push({ user_id: subRow.usuario_id, status: err.statusCode, error: err.message })
            }
        }))

        // 11. Registrar en auditoría general de sistema
        await supabaseAdmin.from('auditoria').insert({
            tabla: 'sistema',
            accion: 'cron_reminder',
            detalles: {
                evento: eventLabel,
                fecha: todayStr,
                notif_push_enviadas: results.push_success,
                notif_sistema_enviadas: results.system_success,
                fallidos_push: results.push_failure,
                usuarios_evaluados: faltanMarcar.length
            }
        })

        return NextResponse.json({
            message: `Recordatorios de ${eventLabel} procesados.`,
            stats: results
        })

    } catch (error: any) {
        console.error('[CRON REMINDER ERROR]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
