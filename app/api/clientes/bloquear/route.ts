import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = createAdminClient()
    const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
    if (!perfil) return NextResponse.json({ error: 'No profile' }, { status: 403 })

    const body = await request.json()
    const { cliente_id, action } = body

    if (!cliente_id || !action) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (action === 'block' && perfil.rol !== 'admin' && perfil.rol !== 'supervisor') {
         return NextResponse.json({ error: 'Solo supervisores y administradores pueden bloquear' }, { status: 403 })
    }
    
    if (action === 'unblock' && perfil.rol !== 'admin') {
         return NextResponse.json({ error: 'Solo administradores pueden desbloquear' }, { status: 403 })
    }

    const isBlocking = action === 'block'

    const { data: updated, error } = await supabaseAdmin
      .from('clientes')
      .update({ 
        bloqueado_renovacion: isBlocking, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', cliente_id)
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: isBlocking ? 'bloquear_cliente_renovacion' : 'desbloquear_cliente_renovacion',
        tabla_afectada: 'clientes',
        registro_id: cliente_id,
        detalle: { action, bloqueado_renovacion: isBlocking }
    })

    return NextResponse.json({ success: true, cliente: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
