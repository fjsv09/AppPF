import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'
import { revalidatePath } from 'next/cache'

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

        // 1. Obtener info del cuadre ANTES de rechazarlo para saber a quién notificar
        const { data: cuadre } = await supabaseAdmin
            .from('cuadres_diarios')
            .select('asesor_id')
            .eq('id', cuadreId)
            .single()

        if (!cuadre) throw new Error('Cuadre no encontrado')

        // 2. Actualizar estado a 'rechazado'
        const { error: updateError } = await supabaseAdmin
            .from('cuadres_diarios')
            .update({ estado: 'rechazado' })
            .eq('id', cuadreId)

        if (updateError) throw updateError

        // 3. Notificar al asesor (DB + Push de escritorio)
        await createFullNotification(cuadre.asesor_id, {
            titulo: '❌ Cuadre Rechazado',
            mensaje: 'Tu solicitud de cuadre ha sido rechazada. Por favor revisa y vuelve a enviarla.',
            link: '/dashboard/cuadre',
            tipo: 'error'
        })

        revalidatePath('/dashboard/admin/cuadres')
        
        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error('Error rechazando cuadre:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
