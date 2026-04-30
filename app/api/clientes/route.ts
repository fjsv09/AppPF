import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { checkSystemAccess } from '@/utils/systemRestrictions'
import { createFullNotification } from '@/services/notification-service'

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
      // Sanitizar: solo letras, números, espacios y vocales acentuadas (evita inyección de filtro PostgREST)
      const safeQuery = query.replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ]/g, '').slice(0, 100)
      if (safeQuery) {
        dbQuery = dbQuery.or(`nombres.ilike.%${safeQuery}%,dni.ilike.%${safeQuery}%`)
      }
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
    const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
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
    const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol, nombre_completo').eq('id', user.id).single()
    
    if (perfil?.rol !== 'admin' && perfil?.rol !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...updateData } = body
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Split fields into Client and Solicitation tables
    const clientFields = ['nombres', 'dni', 'telefono', 'direccion', 'referencia', 'sector_id', 'estado', 'excepcion_voucher', 'foto_perfil', 'limite_prestamo']
    const solicitationFields = ['giro_negocio', 'fuentes_ingresos', 'ingresos_mensuales', 'motivo_prestamo', 'gps_coordenadas', 'documentos']
    
    // Obtenemos datos previos para validación de permisos y auditoría
    const { data: oldClient } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single()

    if (!oldClient) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const clientPayload: any = {}
    const solicitationPayload: any = {}
    
    Object.keys(updateData).forEach(key => {
        if (clientFields.includes(key)) {
            // REGLA: Solo Admin puede editar limite_prestamo si ya existe. 
            // Supervisor solo puede asignarlo si es 0.
            if (key === 'limite_prestamo') {
                const newLimit = parseFloat(updateData[key])
                const oldLimit = parseFloat(oldClient.limite_prestamo || 0)
                
                if (perfil.rol === 'supervisor' && oldLimit > 0 && newLimit !== oldLimit) {
                    // Ignorar el cambio si el supervisor intenta editar un límite ya establecido
                    return 
                }
                clientPayload[key] = newLimit
            } else {
                clientPayload[key] = updateData[key]
            }
        }
        if (solicitationFields.includes(key)) {
            if (key === 'documentos') solicitationPayload['documentos_evaluacion'] = updateData[key]
            else solicitationPayload[key] = updateData[key]
        }
    })

    // 1. Update Cliente table
    const { data: updated, error: clientError } = await supabaseAdmin
      .from('clientes')
      .update({ ...clientPayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single()

    if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 })

    // 2. Update Latest Solicitation if needed
    if (Object.keys(solicitationPayload).length > 0) {
        const { data: latest } = await supabaseAdmin
            .from('solicitudes')
            .select('id')
            .eq('cliente_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
            
        if (latest) {
             await supabaseAdmin
                .from('solicitudes')
                .update(solicitationPayload)
                .eq('id', latest.id)
        }
    }

    // Detectar exactamente qué campos cambiaron
    const changes = Object.keys(updateData).filter(key => 
        String(updateData[key]) !== String(oldClient[key])
    )

    if (changes.length > 0) {
        // Registrar en tabla de auditoría para todos los cambios
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'editar_cliente',
            tabla_afectada: 'clientes',
            registro_id: id,
            detalle: { 
                antes: oldClient, 
                despues: updated,
                campos_cambiados: changes
            }
        })

        // Notificaciones especiales
        if (perfil.rol === 'supervisor') {
            const { data: admins } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('rol', 'admin')

            if (admins && admins.length > 0) {
                const docTitle = updated.nombres || 'Cliente'
                const supervisorName = perfil.nombre_completo || 'Supervisor'
                
                // Caso A: Supervisor cambia el límite por primera vez (de 0 a >0)
                const oldLimit = parseFloat(oldClient.limite_prestamo || 0)
                const newLimit = parseFloat(updated.limite_prestamo || 0)
                
                if (oldLimit === 0 && newLimit > 0) {
                    for (const admin of admins) {
                        await createFullNotification(admin.id, {
                            titulo: '🎯 Nuevo Límite Asignado',
                            mensaje: `${supervisorName} asignó un límite de S/ ${newLimit} a ${docTitle}.`,
                            link: `/dashboard/clientes/${id}`,
                            tipo: 'info'
                        })
                    }
                } else {
                    // Caso B: Edición normal de supervisor
                    for (const admin of admins) {
                        await createFullNotification(admin.id, {
                            titulo: '🛡️ Edición de Supervisor',
                            mensaje: `${supervisorName} modificó los datos de ${docTitle}: ${changes.join(', ')}`,
                            link: `/dashboard/clientes/${id}`,
                            tipo: 'warning'
                        })
                    }
                }
            }
        }
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
