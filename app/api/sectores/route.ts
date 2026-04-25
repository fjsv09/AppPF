
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'

export async function GET() {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const adminClient = createAdminClient()
        const { data, error } = await adminClient
            .from('sectores')
            .select('id, nombre')
            .eq('activo', true)
            .order('orden', { ascending: true })

        if (error) {
            console.error('Error fetching sectores with admin client:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
