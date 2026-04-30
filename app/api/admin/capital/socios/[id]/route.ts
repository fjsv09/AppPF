import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { user } = guard

  try {
    const adminClient = createAdminClient()
    const id = params.id
    const { data: perfilFull } = await adminClient.from('perfiles').select('nombre_completo').eq('id', user.id).single()

    const body = await request.json()
    const { nombre, porcentaje_participacion } = body

    const { data: oldData } = await adminClient.from('socios').select('*').eq('id', id).single()
    if (!oldData) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })

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

    const { data: admins } = await adminClient.from('perfiles').select('id').eq('rol', 'admin').neq('id', user.id)
    const notificationPromises = admins?.map(admin =>
        createFullNotification(admin.id, {
            titulo: 'Socio Actualizado',
            mensaje: `${perfilFull?.nombre_completo || 'Admin'} actualizó los datos del socio ${oldData.nombre}.`,
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
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  try {
    const adminClient = createAdminClient()
    const id = params.id

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
