
import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'
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

export async function POST(request: Request) {
    try {
        const auth = await requireAdmin()
        if ('error' in auth) return auth.error

        const body = await request.json()
        const { nombre, orden, de_baja } = body

        if (!nombre) {
            return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
        }

        const adminClient = createAdminClient()
        const { data, error } = await adminClient
            .from('sectores')
            .insert([
                { 
                    nombre: nombre.trim(), 
                    orden: parseInt(orden) || 0, 
                    activo: !de_baja 
                }
            ])
            .select()

        if (error) {
            console.error('Error creating sector:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data?.[0] || { success: true })
    } catch (err: any) {
        console.error('Error in POST /api/sectores:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
