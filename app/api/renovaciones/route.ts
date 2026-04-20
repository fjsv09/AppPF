import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'
import { checkSystemAccess } from '@/utils/systemRestrictions'

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

        // --- VERIFICACIÓN DE ACCESO Y REGLAS DE NEGOCIO (Horarios, Turnos, Cuadres) ---
        const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'renovacion');
        if (!access.allowed) {
            return NextResponse.json({ 
                error: access.reason,
                tipo_error: access.code,
                config: access.config
            }, { status: 403 });
        }
        // --- FIN VERIFICACIÓN DE ACCESO ---

        const body = await request.json()
        const { 
            prestamo_id,
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            score_al_solicitar,
            monto_minimo_permitido,
            monto_maximo_permitido,
            razon_limite,
            health_score,
            reputation_score,
            detalles_score,
            reputation_data
        } = body

        // Validar campos requeridos
        if (!prestamo_id || !monto_solicitado || !interes || !cuotas || !modalidad || !fecha_inicio_propuesta) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
        }

        // NUEVA VALIDACIÓN: Verificar estado del préstamo para restricciones de rol
        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('cliente_id, estado, cliente:clientes(bloqueado_renovacion)')
            .eq('id', prestamo_id)
            .single()

        if (!prestamoInfo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }
        
        // VALIDACIÓN: Cliente bloqueado para renovación
        const clienteInfo = prestamoInfo.cliente as any
        if (clienteInfo && clienteInfo.bloqueado_renovacion) {
            return NextResponse.json({ 
                error: 'Este cliente ha sido bloqueado y no se le puede renovar.',
                tipo_error: 'cliente_bloqueado'
            }, { status: 403 })
        }
        
        // REGLA DE NEGOCIO: Solo el administrador puede renovar préstamos que ya fueron refinanciados por mora
        const { data: origen } = await supabaseAdmin
            .from('renovaciones')
            .select('prestamo_original:prestamo_original_id(estado)')
            .eq('prestamo_nuevo_id', prestamo_id)
            .maybeSingle()
        
        const esProductoDeRefinanciamiento = (origen?.prestamo_original as any)?.estado === 'refinanciado'

        if ((esProductoDeRefinanciamiento || prestamoInfo.estado === 'refinanciado') && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: 'Este préstamo es producto de una refinanciación por mora y solo puede ser renovado por el administrador.',
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

        // REGLA DE NEGOCIO: Solo asesor y admin pueden crear solicitudes de renovación. El SUPERVISOR no puede renovar.
        if (perfil.rol !== 'asesor' && perfil.rol !== 'admin') {
            return NextResponse.json({ 
                error: (perfil.rol === 'supervisor') 
                    ? 'Los supervisores no tienen permisos para realizar renovaciones de préstamo.' 
                    : 'Solo asesores y administradores pueden solicitar renovaciones',
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
            // EXCEPCIÓN ADMIN: Permitir renovar aunque sea paralelo
            if (perfil.rol === 'admin' && elegibilidad.razon_bloqueo?.toLowerCase().includes('paralelo')) {
                 console.log('✅ Admin bypass for paralelo loan renewal eligibility');
            } else {
                return NextResponse.json({ 
                    error: elegibilidad.razon_bloqueo || 'No elegible para renovación',
                    elegibilidad,
                    es_refinanciado: elegibilidad.es_refinanciado,
                    es_ultimo_prestamo: elegibilidad.es_ultimo_prestamo
                }, { status: 400 })
            }
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
            score_al_solicitar: score_al_solicitar || elegibilidad.score,
            reputation_score_al_solicitar: reputation_score || 0,
            resumen_comportamiento: {
                health_evaluation: detalles_score || elegibilidad.score_detalle || {},
                reputation_evaluation: reputation_data || {},
                health_score: health_score || elegibilidad.score,
                reputation_score: reputation_score || 0
            },
            monto_maximo_permitido: monto_maximo_permitido || elegibilidad.monto_maximo,
            monto_minimo_permitido: monto_minimo_permitido || elegibilidad.monto_minimo,
            razon_limite: razon_limite || `Score: ${elegibilidad.score}`,
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
                estado_solicitud: perfil.rol === 'admin' ? 'pre_aprobado' : 'pendiente_supervision',
                score_al_solicitar: score_al_solicitar || elegibilidad.score,
                monto_minimo_permitido: monto_minimo_permitido || elegibilidad.monto_minimo,
                monto_maximo_permitido: monto_maximo_permitido || elegibilidad.monto_maximo,
                razon_limite: razon_limite || `Score: ${elegibilidad.score}`,
                resumen_comportamiento: {
                    health_evaluation: detalles_score,
                    reputation_evaluation: reputation_data,
                    health_score: health_score || elegibilidad.score,
                    reputation_score: reputation_score || 0
                },
                requiere_excepcion: elegibilidad.requiere_excepcion,
                tipo_excepcion: elegibilidad.tipo_excepcion
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
