import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'

export const dynamic = 'force-dynamic'

// GET - Listar solicitudes de renovación (filtrado por rol)
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
            .from('solicitudes_renovacion')
            .select(`
                *,
                cliente:cliente_id(id, nombres, dni),
                prestamo:prestamo_id(id, monto, estado, estado_mora),
                asesor:asesor_id(id, nombre_completo),
                supervisor:supervisor_id(id, nombre_completo)
            `)
            .order('created_at', { ascending: false })

        // Filtrar según rol
        if (perfil.rol === 'asesor') {
            query = query.eq('asesor_id', user.id)
        } else if (perfil.rol === 'supervisor') {
            const { data: asesores } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('supervisor_id', user.id)
            
            const asesorIds = asesores?.map(a => a.id) || []
            asesorIds.push(user.id)
            query = query.in('asesor_id', asesorIds)
        }
        // Admin ve todas

        const { data: solicitudes, error } = await query

        if (error) {
            console.error('Error fetching solicitudes renovacion:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(solicitudes)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// POST - Crear nueva solicitud de renovación (Asesor)
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Verificar perfil
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol, supervisor_id')
            .eq('id', user.id)
            .single()

        if (!perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }

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

        // VERIFICAR BLOQUEO POR CUADRE
        if (perfil.rol === 'asesor') {
            const blockStatus = await checkAdvisorBlocked(supabaseAdmin, user.id);
            if (blockStatus.isBlocked) {
                return NextResponse.json({ 
                    error: blockStatus.reason,
                    tipo_error: 'bloqueado_por_cuadre'
                }, { status: 403 });
            }
        }

        const body = await request.json()
        const { 
            prestamo_id,
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta
        } = body

        // Validar campos requeridos
        if (!prestamo_id || !monto_solicitado || !interes || !cuotas || !modalidad || !fecha_inicio_propuesta) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
        }

        // NUEVA VALIDACIÓN: Verificar estado del préstamo para restricciones de rol
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('cliente_id, estado')
            .eq('id', prestamo_id)
            .single()

        if (!prestamoInfo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        // REGLA DE NEGOCIO: Solo admin puede solicitar renovación de préstamos refinanciados
        if (prestamoInfo.estado === 'refinanciado' && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: 'Solo el administrador puede solicitar renovación de préstamos refinanciados',
                tipo_error: 'rol_insuficiente'
            }, { status: 403 })
        }

        // REGLA DE NEGOCIO: No permitir múltiples solicitudes pendientes para el mismo préstamo
        const { data: solicitudExistente } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .select('id, estado_solicitud')
            .eq('prestamo_id', prestamo_id)
            .in('estado_solicitud', ['pendiente_supervision', 'en_correccion', 'pre_aprobado'])
            .maybeSingle()

        if (solicitudExistente) {
            return NextResponse.json({ 
                error: `Ya existe una solicitud de renovación en estado "${solicitudExistente.estado_solicitud}". No se pueden crear solicitudes duplicadas.`,
                tipo_error: 'solicitud_duplicada',
                solicitud_existente_id: solicitudExistente.id
            }, { status: 409 })
        }

        // REGLA DE NEGOCIO: Solo asesor y admin pueden crear solicitudes de renovación
        if (perfil.rol !== 'asesor' && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: 'Solo asesores y administradores pueden solicitar renovaciones',
                tipo_error: 'rol_insuficiente'
            }, { status: 403 })
        }

        // Evaluar elegibilidad
        const { data: elegibilidad, error: elegError } = await supabaseAdmin
            .rpc('evaluar_elegibilidad_renovacion', { p_prestamo_id: prestamo_id })

        if (elegError) {
            console.error('Error evaluando elegibilidad:', elegError)
            return NextResponse.json({ error: elegError.message }, { status: 400 })
        }

        if (!elegibilidad.elegible) {
            return NextResponse.json({ 
                error: elegibilidad.razon_bloqueo || 'No elegible para renovación',
                elegibilidad,
                es_refinanciado: elegibilidad.es_refinanciado,
                es_ultimo_prestamo: elegibilidad.es_ultimo_prestamo
            }, { status: 400 })
        }

        // VALIDACIÓN ADICIONAL: Advertir si requiere excepción de admin
        if (elegibilidad.requiere_admin_excepcion && perfil.rol !== 'admin') {
            // Permitir que asesores creen la solicitud, pero será marcada para revisión admin
            console.log('⚠️ Solicitud requiere excepción de admin - será escalada')
        }

        // Validar monto dentro de límites
        if (monto_solicitado > elegibilidad.monto_maximo) {
            return NextResponse.json({ 
                error: `El monto solicitado ($${monto_solicitado}) excede el máximo permitido ($${elegibilidad.monto_maximo})` 
            }, { status: 400 })
        }

        if (monto_solicitado < elegibilidad.monto_minimo) {
            return NextResponse.json({ 
                error: `El monto solicitado ($${monto_solicitado}) es menor al mínimo permitido ($${elegibilidad.monto_minimo})` 
            }, { status: 400 })
        }

        // Crear solicitud
        const solicitudData = {
            prestamo_id,
            cliente_id: prestamoInfo.cliente_id,
            asesor_id: user.id,
            monto_solicitado,
            interes,
            cuotas,
            modalidad,
            fecha_inicio_propuesta,
            score_al_solicitar: elegibilidad.score,
            resumen_comportamiento: elegibilidad.score_detalle,
            monto_maximo_permitido: elegibilidad.monto_maximo,
            monto_minimo_permitido: elegibilidad.monto_minimo,
            razon_limite: `Score: ${elegibilidad.score}`,
            requiere_excepcion: elegibilidad.requiere_excepcion || false,
            tipo_excepcion: elegibilidad.tipo_excepcion || null,
            estado_solicitud: perfil.rol === 'admin' ? 'pre_aprobado' : 'pendiente_supervision'
        }

        const { data: solicitud, error: createError } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .insert(solicitudData)
            .select()
            .single()

        if (createError) {
            console.error('Error creating solicitud renovacion:', createError)
            return NextResponse.json({ error: createError.message }, { status: 400 })
        }

        // Notificar a supervisores (Si es admin, se auto-pre-aprueba sin notificar)
        if (perfil.rol !== 'admin') {
            if (perfil.supervisor_id) {
                await createFullNotification(perfil.supervisor_id, {
                    titulo: '🔄 Nueva Solicitud de Renovación',
                    mensaje: `Solicitud de renovación por $${monto_solicitado} - Score: ${elegibilidad.score}${elegibilidad.requiere_excepcion ? ' (Requiere Excepción)' : ''}`,
                    link: `/dashboard/renovaciones/${solicitud.id}`,
                    tipo: elegibilidad.requiere_excepcion ? 'warning' : 'info'
                })
            } else {
                // Notificar a todos los supervisores
                const { data: supervisores } = await supabaseAdmin
                    .from('perfiles')
                    .select('id')
                    .eq('rol', 'supervisor')
                
                for (const sup of supervisores || []) {
                    await createFullNotification(sup.id, {
                        titulo: '🔄 Nueva Solicitud de Renovación',
                        mensaje: `Solicitud de renovación por $${monto_solicitado}${elegibilidad.requiere_excepcion ? ' (Requiere Excepción)' : ''}`,
                        link: `/dashboard/renovaciones/${solicitud.id}`,
                        tipo: elegibilidad.requiere_excepcion ? 'warning' : 'info'
                    })
                }
            }
        }

        // Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'crear_solicitud_renovacion',
            tabla_afectada: 'solicitudes_renovacion',
            registro_id: solicitud.id,
            detalle: { 
                prestamo_id, 
                monto: monto_solicitado, 
                score: elegibilidad.score,
                requiere_excepcion: elegibilidad.requiere_excepcion
            }
        })

        revalidatePath('/dashboard/renovaciones')

        return NextResponse.json({ 
            solicitud, 
            elegibilidad,
            message: 'Solicitud de renovación creada exitosamente' 
        }, { status: 201 })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
