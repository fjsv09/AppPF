import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const id = params.id

    // 1. Verificar Rol Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await adminClient.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

    const body = await request.json()
    const { nombre, porcentaje_participacion } = body

    // 2. Obtener datos actuales
    const { data: oldData } = await adminClient.from('socios').select('*').eq('id', id).single()
    if (!oldData) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })

    // 3. Actualizar
    const { data: socio, error } = await adminClient
      .from('socios')
      .update({
        nombre: nombre || oldData.nombre,
        porcentaje_participacion: porcentaje_participacion !== undefined ? porcentaje_participacion : oldData.porcentaje_participacion
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // 4. Notificar a otros admins
    const { data: admins } = await adminClient.from('perfiles').select('id').eq('rol', 'admin').neq('id', user.id)
    const notificationPromises = admins?.map(admin => 
        createFullNotification(admin.id, {
            titulo: 'Socio Actualizado',
            mensaje: `${perfil?.nombre_completo} actualizó los datos del socio ${oldData.nombre}.`,
            link: '/dashboard/admin/capital',
            tipo: 'info'
        })
    ) || []
    
    await Promise.allSettled(notificationPromises)

    return NextResponse.json(socio)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const id = params.id

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await adminClient.from('perfiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

    // Verificar transacciones
    const { count } = await adminClient.from('transacciones_capital').select('*', { count: 'exact', head: true }).eq('entidad_id', id)
    
    if (count && count > 0) {
        return NextResponse.json({ error: 'No se puede eliminar un socio con historial de movimientos financieros.' }, { status: 400 })
    }

    const { error } = await adminClient.from('socios').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
