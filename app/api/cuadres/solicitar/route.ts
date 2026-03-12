import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const body = await request.json()
        const { p_monto_efectivo, p_monto_digital, p_total_gastos, p_tipo_cuadre } = body

        const totalEntregar = (parseFloat(p_monto_efectivo) || 0) + (parseFloat(p_monto_digital) || 0)

        // 1. Validación: No permitir cuadres en 0
        if (totalEntregar <= 0) {
            return NextResponse.json({ error: 'No se puede enviar un cuadre con monto total de 0.00' }, { status: 400 })
        }

        // 2. Validación: No permitir múltiples cuadres pendientes
        const { data: pending, error: pendingError } = await supabaseAdmin
            .from('cuadres_diarios')
            .select('id')
            .eq('asesor_id', user.id)
            .eq('estado', 'pendiente')
            .limit(1)

        if (pendingError) throw pendingError
        if (pending && pending.length > 0) {
            return NextResponse.json({ error: 'Ya tienes una solicitud de cuadre pendiente de aprobación.' }, { status: 400 })
        }

        // 3. Ejecutar RPC para crear el cuadre en la DB
        const { data: cuadreId, error: rpcError } = await supabase.rpc('solicitar_cuadre_db', {
            p_asesor_id: user.id,
            p_monto_efectivo,
            p_monto_digital,
            p_total_gastos,
            p_tipo_cuadre
        })

        if (rpcError) throw rpcError

        // 2. Notificar a los administradores (DB + Push de escritorio)
        const { data: admins } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('rol', 'admin')
            .eq('activo', true)

        const totalEntregado = (parseFloat(p_monto_efectivo) || 0) + (parseFloat(p_monto_digital) || 0)
        
        // Obtenemos el nombre del asesor para el mensaje
        const { data: perfilAsesor } = await supabaseAdmin
            .from('perfiles')
            .select('nombre_completo')
            .eq('id', user.id)
            .single()

        const nombreAsesor = perfilAsesor?.nombre_completo || 'Un asesor'

        if (admins) {
            for (const admin of admins) {
                await createFullNotification(admin.id, {
                    titulo: '📅 Nuevo Cuadre Solicitado',
                    mensaje: `${nombreAsesor} ha solicitado un cuadre por S/ ${totalEntregado.toFixed(2)}.`,
                    link: '/dashboard/admin/cuadres',
                    tipo: 'warning'
                })
            }
        }

        return NextResponse.json({ success: true, id: cuadreId })

    } catch (e: any) {
        console.error('Error solicitando cuadre:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
