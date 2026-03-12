import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - Listar todos los sectores activos (accesible para select)
export async function GET() {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { data: sectores, error } = await supabase
            .from('sectores')
            .select('*')
            .order('orden', { ascending: true })

        if (error) throw error

        return NextResponse.json(sectores)
    } catch (e: any) {
        console.error('Error fetching sectores:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// POST - Crear sector (solo admin)
export async function POST(request: Request) {
    const supabaseAdmin = createAdminClient()
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden crear sectores' }, { status: 403 })
        }

        const body = await request.json()
        const { nombre, orden, de_baja } = body

        if (!nombre) {
            return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
        }

        const { data: sector, error: createError } = await supabaseAdmin
            .from('sectores')
            .insert({ nombre, orden: orden || 0, activo: de_baja === true ? false : true })
            .select()
            .single()

        if (createError) throw createError

        return NextResponse.json(sector, { status: 201 })
    } catch (e: any) {
        console.error('Error creating sector:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
