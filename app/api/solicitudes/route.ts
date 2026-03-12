import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// GET - Listar solicitudes (filtrado por rol)
export async function GET() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Obtener perfil del usuario
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, supervisor_id')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

        let query = supabaseAdmin
            .from('solicitudes')
            .select(`
                *,
                clientes:cliente_id(id, nombres, dni),
                asesor:asesor_id(id, nombre_completo),
                supervisor:supervisor_id(id, nombre_completo)
            `)
            .order('created_at', { ascending: false })

        // Filtrar según rol
        if (perfil.rol === 'asesor') {
            // Asesor ve solo sus solicitudes
            query = query.eq('asesor_id', user.id)
        } else if (perfil.rol === 'supervisor') {
            // Supervisor ve solicitudes de sus asesores (pendientes de supervisión)
            const { data: asesores } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('supervisor_id', user.id)
            
            const asesorIds = asesores?.map(a => a.id) || []
            asesorIds.push(user.id) // También las suyas propias
            query = query.in('asesor_id', asesorIds)
        }
        // Admin ve todas

        const { data: solicitudes, error } = await query

        if (error) {
            console.error('Error fetching solicitudes:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(solicitudes)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// POST - Crear nueva solicitud (solo Asesor)
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Verificar que es asesor
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, supervisor_id')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

        // Estricto: Solo asesores pueden crear solicitudes
        if (perfil.rol !== 'asesor') {
            return NextResponse.json({ 
                error: 'Acceso denegado. Solo los asesores pueden ingresar nuevas solicitudes o registrar prospectos.' 
            }, { status: 403 })
        }

        const body = await request.json()

        // VERIFICAR HORARIO DEL SISTEMA
        const { data: configs } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
        
        const configMap = (configs || []).reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, { horario_apertura: '07:00', horario_cierre: '20:00', desbloqueo_hasta: '1970-01-01' })

        const now = new Date()
        const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const currentTime = peruTime.getHours().toString().padStart(2, '0') + ':' + peruTime.getMinutes().toString().padStart(2, '0')
        const isUnlocked = new Date(configMap.desbloqueo_hasta) > now

        if (!isUnlocked && (currentTime < configMap.horario_apertura || currentTime > configMap.horario_cierre)) {
            return NextResponse.json({ 
                error: `Sistema cerrado. El horario de operación es de ${configMap.horario_apertura} a ${configMap.horario_cierre}.`,
                tipo_error: 'sistema_cerrado'
            }, { status: 403 })
        }
        const { 
            cliente_id, 
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            // Datos del prospecto (nuevo cliente)
            prospecto_nombres,
            prospecto_dni,
            prospecto_telefono,
            prospecto_direccion,
            prospecto_referencia,
            prospecto_sector_id,
            // Datos de evaluación financiera
            giro_negocio,
            fuentes_ingresos,
            ingresos_mensuales,
            motivo_prestamo,
            gps_coordenadas,
            documentos_evaluacion
        } = body

        // Validar datos del préstamo
        if (!monto_solicitado || !interes || !cuotas || !modalidad || !fecha_inicio_propuesta) {
            return NextResponse.json({ error: 'Faltan campos del préstamo' }, { status: 400 })
        }

        // Validar que tenga cliente_id O datos del prospecto
        if (!cliente_id && (!prospecto_nombres || !prospecto_dni || !prospecto_telefono)) {
            return NextResponse.json({ error: 'Debe seleccionar un cliente o proporcionar datos del prospecto (nombre, DNI, teléfono)' }, { status: 400 })
        }

        // Si es prospecto nuevo, verificar que el DNI no exista
        if (!cliente_id && prospecto_dni) {
            const { data: existingClient } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres')
                .eq('dni', prospecto_dni)
                .maybeSingle()

            if (existingClient) {
                return NextResponse.json({ 
                    error: `Ya existe un cliente con DNI ${prospecto_dni}: ${existingClient.nombres}. Selecciónelo de la lista.`
                }, { status: 400 })
            }
        }

        // Crear solicitud
        const solicitudData: any = {
            asesor_id: user.id,
            monto_solicitado,
            interes,
            cuotas,
            modalidad,
            fecha_inicio_propuesta,
            estado_solicitud: 'pendiente_supervision',
            // Datos de evaluación financiera
            giro_negocio: giro_negocio || null,
            fuentes_ingresos: fuentes_ingresos || null,
            ingresos_mensuales: ingresos_mensuales || null,
            motivo_prestamo: motivo_prestamo || null,
            gps_coordenadas: gps_coordenadas || null,
            documentos_evaluacion: documentos_evaluacion || null
        }

        // Agregar cliente_id o datos de prospecto
        if (cliente_id) {
            solicitudData.cliente_id = cliente_id
        } else {
            solicitudData.prospecto_nombres = prospecto_nombres
            solicitudData.prospecto_dni = prospecto_dni
            solicitudData.prospecto_telefono = prospecto_telefono
            solicitudData.prospecto_direccion = prospecto_direccion
            solicitudData.prospecto_referencia = prospecto_referencia
            
            // Store prospecto_sector_id inside documentos_evaluacion to bypass DB schema constraint
            if (prospecto_sector_id) {
                solicitudData.documentos_evaluacion = {
                    ...(solicitudData.documentos_evaluacion || {}),
                    prospecto_sector_id: prospecto_sector_id
                }
            }
        }

        const { data: solicitud, error: createError } = await supabaseAdmin
            .from('solicitudes')
            .insert(solicitudData)
            .select()
            .single()

        if (createError) {
            console.error('Error creating solicitud:', createError)
            return NextResponse.json({ error: createError.message }, { status: 400 })
        }

        // Obtener supervisor del asesor para notificar
        if (perfil.supervisor_id) {
            await createFullNotification(perfil.supervisor_id, {
                titulo: 'Nueva Solicitud de Crédito',
                mensaje: `${perfil.rol === 'asesor' ? 'Un asesor' : 'El usuario'} ha creado una solicitud por $${monto_solicitado}`,
                link: `/dashboard/solicitudes/${solicitud.id}`,
                tipo: 'info'
            })
        } else {
            // Si no tiene supervisor, notificar a todos los supervisores
            const { data: supervisores } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('rol', 'supervisor')
            
            for (const sup of supervisores || []) {
                await createFullNotification(sup.id, {
                    titulo: 'Nueva Solicitud de Crédito',
                    mensaje: `Nueva solicitud por $${monto_solicitado} pendiente de revisión`,
                    link: `/dashboard/solicitudes/${solicitud.id}`,
                    tipo: 'info'
                })
            }
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'crear_solicitud',
            tabla_afectada: 'solicitudes',
            detalle: { solicitud_id: solicitud.id, monto: monto_solicitado }
        })

        revalidatePath('/dashboard/solicitudes')

        return NextResponse.json(solicitud, { status: 201 })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
