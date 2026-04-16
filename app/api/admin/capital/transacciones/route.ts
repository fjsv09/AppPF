import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await adminClient.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

    const body = await request.json()
    const { entidad_id, entidad_tipo, tipo, monto, cuenta_id, descripcion } = body

    if (!entidad_id || !entidad_tipo || !tipo || !monto || !cuenta_id) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // 1. Obtener datos de la entidad para el nombre en la descripción
    let nombreEntidad = ''
    if (entidad_tipo === 'inversionista') {
        const { data } = await adminClient.from('inversionistas').select('nombre').eq('id', entidad_id).single()
        nombreEntidad = data?.nombre || ''
    } else {
        const { data } = await adminClient.from('socios').select('nombre').eq('id', entidad_id).single()
        nombreEntidad = data?.nombre || ''
    }

    // 2. Obtener cuenta y validar saldo si es egreso
    const { data: cuenta } = await adminClient.from('cuentas_financieras').select('saldo, cartera_id, nombre').eq('id', cuenta_id).single()
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

    const esEgreso = ['pago_interes', 'devolucion_capital', 'retiro_utilidad'].includes(tipo)
    const montoFloat = parseFloat(monto)

    if (esEgreso && parseFloat(cuenta.saldo) < montoFloat) {
        return NextResponse.json({ error: `Saldo insuficiente en ${cuenta.nombre}` }, { status: 400 })
    }

    // 3. Actualizar Saldo de Cuenta
    const nuevoSaldo = esEgreso 
        ? parseFloat(cuenta.saldo) - montoFloat 
        : parseFloat(cuenta.saldo) + montoFloat

    await adminClient
        .from('cuentas_financieras')
        .update({ saldo: nuevoSaldo })
        .eq('id', cuenta_id)

    // 4. Registrar en transacciones_capital
    const { data: trans, error: transError } = await adminClient.from('transacciones_capital').insert({
        entidad_id,
        entidad_tipo,
        tipo,
        monto: montoFloat,
        cuenta_id,
        registrado_por: user.id,
        descripcion: descripcion || `${tipo.replace('_', ' ')} - ${nombreEntidad}`
    }).select().single()

    if (transError) throw transError

    // 5. Registrar en movimientos_financieros (auditoría global)
    await adminClient.from('movimientos_financieros').insert({
        cartera_id: cuenta.cartera_id,
        [esEgreso ? 'cuenta_origen_id' : 'cuenta_destino_id']: cuenta_id,
        monto: montoFloat,
        tipo: esEgreso ? 'egreso' : 'ingreso',
        descripcion: `${tipo.toUpperCase()}: ${nombreEntidad} - ${descripcion || ''}`,
        registrado_por: user.id
    })

    // 6. Actualizar totales en la entidad
    if (entidad_tipo === 'inversionista' && tipo === 'devolucion_capital') {
        const { data: inv } = await adminClient.from('inversionistas').select('capital_total').eq('id', entidad_id).single()
        if (inv) {
            await adminClient.from('inversionistas').update({ 
                capital_total: Math.max(0, parseFloat(inv.capital_total) - montoFloat),
                estado: (parseFloat(inv.capital_total) - montoFloat) <= 0 ? 'finalizado' : 'activo'
            }).eq('id', entidad_id)
        }
    } else if (entidad_tipo === 'socio') {
        const { data: socio } = await adminClient.from('socios').select('capital_aportado').eq('id', entidad_id).single()
        if (socio) {
            if (tipo === 'inyeccion') {
                await adminClient.from('socios').update({ capital_aportado: parseFloat(socio.capital_aportado) + montoFloat }).eq('id', entidad_id)
            }
        }
    }

    // 7. NOTIFICACIÓN A TODOS LOS ADMINS
    const { data: admins } = await adminClient.from('perfiles').select('id').eq('rol', 'admin')
    const notificationPromises = admins?.map(admin => 
        createFullNotification(admin.id, {
            titulo: 'Nuevo Movimiento de Capital',
            mensaje: `${perfil?.nombre_completo} registró: ${tipo.replace('_', ' ')} por S/ ${montoFloat} para ${nombreEntidad}.`,
            link: '/dashboard/admin/capital',
            tipo: esEgreso ? 'warning' : 'success'
        })
    ) || []
    
    await Promise.allSettled(notificationPromises)

    return NextResponse.json(trans)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
