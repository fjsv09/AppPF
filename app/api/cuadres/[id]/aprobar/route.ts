import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: cuadreId } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const body = await request.json()
        const { p_cuenta_caja_id, p_cuenta_digital_id } = body

        // 1. Obtener info del cuadre ANTES de aprobarlo para saber a quién notificar
        const { data: cuadre } = await supabaseAdmin
            .from('cuadres_diarios')
            .select('asesor_id')
            .eq('id', cuadreId)
            .single()

        if (!cuadre) throw new Error('Cuadre no encontrado')

        // 2. Ejecutar RPC para aprobar el cuadre en la DB
        const { data: result, error: rpcError } = await supabase.rpc('aprobar_cuadre_db', {
            p_cuadre_id: cuadreId,
            p_admin_id: user.id,
            p_cuenta_caja_id,
            p_cuenta_digital_id
        })

        if (rpcError) throw rpcError

        // 3. Notificar al asesor (DB + Push de escritorio)
        await createFullNotification(cuadre.asesor_id, {
            titulo: '✅ Cuadre Aprobado',
            mensaje: 'Tu cuadre cobrado ha sido validado exitosamente.',
            link: '/dashboard/cuadre',
            tipo: 'success'
        })

        revalidatePath('/dashboard/admin/cuadres')

        // [NUEVO] Broadcast real-time a todos los canales escuchando por actualizaciones
        const channel = supabaseAdmin.channel('cuadres-sync-global')
        await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.send({
                    type: 'broadcast',
                    event: 'cuadre_updated',
                    payload: { asesor_id: cuadre.asesor_id, action: 'approved' }
                })
                supabaseAdmin.removeChannel(channel)
            }
        })
        
        return NextResponse.json({ success: true, result })

    } catch (e: any) {
        console.error('Error aprobando cuadre:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
