import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // 1. Verificar Rol Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await adminClient.from('perfiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

    // 2. Fetch Inversionistas
    const { data: inversionistas, error } = await adminClient
      .from('inversionistas')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(inversionistas)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // 1. Verificar Rol Admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await adminClient.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

    const body = await request.json()
    const { nombre, capital_inicial, fecha_inicio, duracion_meses, frecuencia_pago, tasa_interes_mensual, cuenta_id } = body

    if (!nombre || !capital_inicial || !fecha_inicio || !duracion_meses || !frecuencia_pago || !tasa_interes_mensual) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // 2. Crear Inversionista
    const { data: inv, error: invError } = await adminClient
      .from('inversionistas')
      .insert({
        nombre,
        capital_total: capital_inicial,
        fecha_inicio,
        duracion_meses,
        frecuencia_pago,
        tasa_interes_mensual,
        estado: 'activo'
      })
      .select()
      .single()

    if (invError) throw invError

    // 3. Registrar Transacción Inicial e incrementar saldo de cuenta
    if (cuenta_id) {
        // Obtener saldo actual
        const { data: cuenta } = await adminClient.from('cuentas_financieras').select('saldo, cartera_id').eq('id', cuenta_id).single()
        
        if (cuenta) {
            // Incrementar saldo
            await adminClient
                .from('cuentas_financieras')
                .update({ saldo: parseFloat(cuenta.saldo) + parseFloat(capital_inicial) })
                .eq('id', cuenta_id)

            // Registrar movimiento en transacciones_capital
            await adminClient.from('transacciones_capital').insert({
                entidad_id: inv.id,
                entidad_tipo: 'inversionista',
                tipo: 'inyeccion',
                monto: capital_inicial,
                cuenta_id: cuenta_id,
                registrado_por: user.id,
                descripcion: `Inyección inicial de capital - Inversionista: ${nombre}`
            })

            // Registrar en movimientos_financieros (auditoría global)
            await adminClient.from('movimientos_financieros').insert({
                cartera_id: cuenta.cartera_id,
                cuenta_destino_id: cuenta_id,
                monto: capital_inicial,
                tipo: 'ingreso',
                descripcion: `Inyección de Capital Inversionista: ${nombre}`,
                registrado_por: user.id
            })
        }
    }

    // 4. NOTIFICACIÓN A TODOS LOS ADMINS
    const { data: admins } = await adminClient.from('perfiles').select('id').eq('rol', 'admin')
    const notificationPromises = admins?.map(admin => 
        createFullNotification(admin.id, {
            titulo: 'Nuevo Inversionista',
            mensaje: `${perfil?.nombre_completo} registró a ${nombre} con un capital de S/ ${capital_inicial}.`,
            link: '/dashboard/admin/capital',
            tipo: 'info'
        })
    ) || []
    
    await Promise.allSettled(notificationPromises)

    return NextResponse.json(inv)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
