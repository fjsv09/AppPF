import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const adminAuthClient = createAdminClient() // Bypass RLS
        
        const { prestamo_id } = await request.json()

        if (!prestamo_id) {
            return NextResponse.json({ error: 'prestamo_id is required' }, { status: 400 })
        }

        // 1. Verify loan exists (User can read)
        const { data: prestamo, error: fetchError } = await supabase
            .from('prestamos')
            .select('bloqueo_cronograma, estado')
            .eq('id', prestamo_id)
            .single()

        if (fetchError || !prestamo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        if (prestamo.bloqueo_cronograma) {
            return NextResponse.json({ error: 'El cronograma ya está bloqueado' }, { status: 400 })
        }

        // 2. Lock the schedule using ADMIN client (Bypass RLS)
        const { error: updateError } = await adminAuthClient
            .from('prestamos')
            .update({ 
                bloqueo_cronograma: true,
                estado: prestamo.estado === 'pendiente' ? 'activo' : prestamo.estado 
            })
            .eq('id', prestamo_id)

        if (updateError) {
            console.error("Update Error:", updateError)
            throw updateError
        }

        // 3. Create Audit Log (User context matches)
        const { data: userData } = await supabase.auth.getUser()
        await supabase.from('auditoria').insert({
            usuario_id: userData.user?.id,
            accion: 'BLOQUEAR_CRONOGRAMA',
            detalles: { prestamo_id },
        })

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error("Error locking schedule:", e)
        return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
    }
}
