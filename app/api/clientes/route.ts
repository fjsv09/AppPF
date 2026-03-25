import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { checkSystemAccess } from '@/utils/systemRestrictions'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  console.log('>>> [API CLIENTES] GET REQUEST START')
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    console.log(`>>> [API CLIENTES] Searching for: "${query}"`)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('>>> [API CLIENTES] Auth Error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = createAdminClient()
    let dbQuery = supabaseAdmin
      .from('clientes')
      .select('id, nombres, dni, telefono, direccion')
      .order('nombres', { ascending: true })

    if (query) {
      dbQuery = dbQuery.or(`nombres.ilike.%${query}%,dni.ilike.%${query}%`)
    }

    const { data: clientes, error } = await dbQuery.limit(20)

    if (error) {
      console.error('>>> [API CLIENTES] Database Error:', error)
      return NextResponse.json({ error: 'Database Error: ' + error.message }, { status: 500 })
    }

    console.log(`>>> [API CLIENTES] Found ${clientes?.length || 0} results`)
    return NextResponse.json(clientes)

  } catch (error: any) {
    console.error('>>> [API CLIENTES] Critical Error:', error)
    return NextResponse.json({ error: 'Critical Server Error: ' + error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = createAdminClient()
    const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil) return NextResponse.json({ error: 'No profile' }, { status: 403 })

    // VALIDACIÓN DE ACCESO Y HORARIO
    const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'solicitud')
    if (!access.allowed) {
        return NextResponse.json({ 
            error: access.reason, 
            tipo_error: access.code,
            config: access.config 
        }, { status: 403 })
    }

    const body = await request.json()
    const { dni, nombres, telefono, direccion, asesor_id } = body
    if (!dni || !nombres) return NextResponse.json({ error: 'DNI and Nombres are required' }, { status: 400 })

    const { data: existing } = await supabaseAdmin.from('clientes').select('id').eq('dni', dni).single()
    if (existing) return NextResponse.json({ error: 'Cliente ya existe' }, { status: 409 })

    const { data: newClient, error: insertError } = await supabaseAdmin
      .from('clientes')
      .insert({
        dni, nombres, telefono, direccion, 
        asesor_id: (perfil.rol === 'asesor' ? user.id : (asesor_id || null)),
        estado: 'activo'
      })
      .select().single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'crear_cliente',
        tabla_afectada: 'clientes',
        registro_id: newClient.id,
        detalle: { dni, nombres }
    })

    return NextResponse.json(newClient)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = createAdminClient()
    const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { id, ...updateData } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const { data: updated, error } = await supabaseAdmin
      .from('clientes')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
