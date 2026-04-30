import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  try {
    const adminClient = createAdminClient()

    const { data: socios, error } = await adminClient
      .from('socios')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) throw error

    return NextResponse.json(socios)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error
  const { user } = guard

  try {
    const adminClient = createAdminClient()
    const { data: perfilFull } = await adminClient.from('perfiles').select('nombre_completo').eq('id', user.id).single()
    const body = await request.json()
    const { nombre, capital_aportado, porcentaje_participacion, cuenta_id } = body

    if (!nombre) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const { data: socio, error: socioError } = await adminClient
      .from('socios')
      .insert({
        nombre,
        capital_aportado: capital_aportado || 0,
        porcentaje_participacion: porcentaje_participacion || 0
      })
      .select()
      .single()

    if (socioError) throw socioError

    // Registrar aporte inicial si existe cuenta
    if (cuenta_id && capital_aportado > 0) {
        const { data: cuenta } = await adminClient.from('cuentas_financieras').select('saldo, cartera_id').eq('id', cuenta_id).single()
        
        if (cuenta) {
            await adminClient
                .from('cuentas_financieras')
                .update({ saldo: parseFloat(cuenta.saldo) + parseFloat(capital_aportado) })
                .eq('id', cuenta_id)

            await adminClient.from('transacciones_capital').insert({
                entidad_id: socio.id,
                entidad_tipo: 'socio',
                tipo: 'inyeccion',
                monto: capital_aportado,
                cuenta_id: cuenta_id,
                registrado_por: user.id,
                descripcion: `Aporte inicial de Socio: ${nombre}`
            })

            await adminClient.from('movimientos_financieros').insert({
                cartera_id: cuenta.cartera_id,
                cuenta_destino_id: cuenta_id,
                monto: capital_aportado,
                tipo: 'ingreso',
                descripcion: `Aporte de Capital Socio: ${nombre}`,
                registrado_por: user.id
            })
        }
    }

    // NOTIFICACIÓN A TODOS LOS ADMINS
    const { data: admins } = await adminClient.from('perfiles').select('id').eq('rol', 'admin')
    const notificationPromises = admins?.map(admin => 
        createFullNotification(admin.id, {
            titulo: 'Nuevo Socio Registrado',
            mensaje: `${perfilFull?.nombre_completo || 'Admin'} registró a ${nombre} con un ${porcentaje_participacion}% de participación.`,
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
