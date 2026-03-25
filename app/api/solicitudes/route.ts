import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'
import { checkSystemAccess } from '@/utils/systemRestrictions'

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
                supervisor:supervisor_id(id, nombre_completo),
                admin:admin_id(nombre_completo)
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

        // Verificar que es asesor o admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, supervisor_id')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

        // Permitir a asesores y administradores
        if (perfil.rol !== 'asesor' && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: 'Acceso denegado. Solo asesores y administradores pueden ingresar nuevas solicitudes.' 
            }, { status: 403 })
        }

        const body = await request.json()

        // VERIFICACIÓN CENTRALIZADA DE ACCESO Y HORARIO
        const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'solicitud');
        if (!access.allowed) {
            return NextResponse.json({ 
                error: access.reason,
                tipo_error: access.code,
                config: access.config
            }, { status: 403 });
        }
        const { 
            cliente_id, 
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            frecuencia,
            destino_prestamo,
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

        // Obtener el asesor del cliente si es admin el que crea
        let asesorFinalId = user.id
        if (perfil.rol === 'admin' && cliente_id) {
            const { data: clientInfo } = await supabaseAdmin
                .from('clientes')
                .select('asesor_id')
                .eq('id', cliente_id)
                .single()
            
            if (clientInfo?.asesor_id) {
                asesorFinalId = clientInfo.asesor_id
            }
        }

        // Crear solicitud
        const solicitudData: any = {
            asesor_id: asesorFinalId,
            monto_solicitado,
            interes,
            cuotas,
            modalidad,
            fecha_inicio_propuesta,
            // Si es admin, lo ponemos como pre-aprobado/aprobado directamente
            estado_solicitud: perfil.rol === 'admin' ? 'aprobado' : 'pendiente_supervision',
            supervisor_id: perfil.rol === 'admin' ? user.id : null,
            admin_id: perfil.rol === 'admin' ? user.id : null,
            fecha_preaprobacion: perfil.rol === 'admin' ? new Date().toISOString() : null,
            fecha_aprobacion: perfil.rol === 'admin' ? new Date().toISOString() : null,
            observacion_supervisor: perfil.rol === 'admin' ? 'Desembolso directo por Administración' : null,
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
