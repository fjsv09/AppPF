import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') // 'pendiente' o 'historial'

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { data: profile } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!['admin', 'supervisor'].includes(profile?.rol || '')) {
            return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 })
        }

        const supabaseAdmin = createAdminClient()
        let query = supabaseAdmin
            .from('bonos_pagados')
            .select('*, perfiles:asesor_id(nombre_completo), metas_asesores:meta_id(*)')

        if (status === 'pendiente') {
            query = query.eq('estado', 'pendiente')
        } else if (status === 'historial') {
            query = query.neq('estado', 'pendiente')
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(status === 'historial' ? 100 : 500)

        if (error) throw error

        return NextResponse.json({ success: true, data })

    } catch (e: any) {
        console.error('[API BONOS LIST] Error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
