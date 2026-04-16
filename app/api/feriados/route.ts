
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        // Allow authenticated users to see holidays to simulate
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Get future holidays or all
        const { data, error } = await supabase
            .from('feriados')
            .select('*')
            .order('fecha', { ascending: true })
        
        if (error) throw error
        return NextResponse.json(data)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Check Admin/Supervisor using Admin Client to bypass RLS issues
        const supabaseAdmin = createAdminClient()
        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
        
        if (!perfil || !['admin', 'supervisor'].includes(perfil.rol)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()
        const { fecha, descripcion } = body
        if (!fecha) return NextResponse.json({ error: 'Fecha required' }, { status: 400 })

        // Use same admin client for insert
        const { data, error } = await supabaseAdmin.from('feriados').insert({ fecha, descripcion }).select().single()

        if (error) throw error
        return NextResponse.json(data)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
