import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = createAdminClient()
    const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
    if (!perfil) return NextResponse.json({ error: 'No profile' }, { status: 403 })

    const body = await request.json()
    const { cliente_id, gps_coordenadas } = body

    if (!cliente_id || !gps_coordenadas) {
      return NextResponse.json({ error: 'Cliente ID y coordenadas requeridos' }, { status: 400 })
    }

    // Obtenemos datos previos del cliente
    const { data: oldClient } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('id', cliente_id)
      .single()

    if (!oldClient) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    // 1. Buscamos la solicitud más reciente
    const { data: latest } = await supabaseAdmin
        .from('solicitudes')
        .select('id')
        .eq('cliente_id', cliente_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        
    let updateResult;

    if (latest) {
         // Actualizamos solicitud existente
         const res = await supabaseAdmin
            .from('solicitudes')
            .update({ gps_coordenadas })
            .eq('id', latest.id)
            .select().single()
         updateResult = res.data
    } else {
        // Creamos nueva solicitud con los datos del cliente
        const res = await supabaseAdmin
            .from('solicitudes')
            .insert({
                cliente_id: cliente_id,
                asesor_id: oldClient.asesor_id,
                estado_solicitud: 'aprobado',
                prospecto_nombres: oldClient.nombres,
                prospecto_dni: oldClient.dni,
                prospecto_telefono: oldClient.telefono || null,
                prospecto_direccion: oldClient.direccion || null,
                monto_solicitado: 0,
                interes: 0,
                cuotas: 1,
                modalidad: 'diario',
                fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
                gps_coordenadas: gps_coordenadas
            }).select().single()
        updateResult = res.data
    }

    // 2. Registrar en auditoría
    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'agregar_gps_cliente',
        tabla_afectada: 'solicitudes',
        registro_id: cliente_id,
        detalle: { 
            antes: { gps_coordenadas: oldClient.gps_coordenadas || null }, 
            despues: { gps_coordenadas }
        }
    })

    // 3. Notificar a los administradores
    const { data: admins } = await supabaseAdmin
        .from('perfiles')
        .select('id')
        .eq('rol', 'admin')

    if (admins && admins.length > 0) {
        const docTitle = oldClient.nombres || 'Cliente'
        const actorName = perfil.nombre_completo || 'Un usuario'
        const actorRole = perfil.rol.charAt(0).toUpperCase() + perfil.rol.slice(1) // Ej: "Asesor"
        
        for (const admin of admins) {
            await createFullNotification(admin.id, {
                titulo: '📍 GPS Registrado',
                mensaje: `El ${actorRole} ${actorName} acaba de registrar las coordenadas de ${docTitle}.`,
                link: `/dashboard/clientes/${cliente_id}`,
                tipo: 'info'
            })
        }
    }

    return NextResponse.json({ success: true, ...updateResult })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
