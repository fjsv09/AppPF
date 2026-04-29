'use server'

import { createAdminClient } from '@/utils/supabase/admin'

export async function fetchDocumentData(solicitudId: string, type: 'solicitud' | 'renovacion' = 'solicitud') {
    const supabaseAdmin = createAdminClient()

    let prestamoIdToFetch = null

    if (type === 'solicitud') {
        const { data: sol } = await supabaseAdmin.from('prestamos').select('id').eq('solicitud_id', solicitudId).maybeSingle()
        prestamoIdToFetch = sol?.id
    } else {
        const { data: sol } = await supabaseAdmin.from('solicitudes').select('prestamo_nuevo_id').eq('id', solicitudId).maybeSingle()
        prestamoIdToFetch = sol?.prestamo_nuevo_id
    }

    if (!prestamoIdToFetch) return null

    const { data: prestamo } = await supabaseAdmin
        .from('prestamos')
        .select(`*, clientes:cliente_id(*)`)
        .eq('id', prestamoIdToFetch)
        .single()
        
    const { data: cronograma } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('*')
        .eq('prestamo_id', prestamoIdToFetch)
        .order('numero_cuota', { ascending: true })

    return { prestamo, cronograma: cronograma || [] }
}
