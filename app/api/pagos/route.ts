import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'
import { checkSystemAccess } from '@/utils/systemRestrictions'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()

    try {
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Initialize Admin Client for DB Operations to bypass RLS
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Verify User Profile & Role (using Admin)
        const { data: perfil, error: perfilError } = await supabaseAdmin
            .from('perfiles')
            .select('rol, supervisor_id')
            .eq('id', user.id)
            .single()

        if (perfilError || !perfil) {
            console.error('Perfil Error:', perfilError)
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }
 
        // --- ROLES PERMITIDOS: admin, supervisor, asesor ---
        if (!['admin', 'supervisor', 'asesor'].includes(perfil.rol)) {
            return NextResponse.json({ 
                error: 'No tiene permisos para registrar pagos.' 
            }, { status: 403 })
        }

        // --- VERIFICACIÓN DE ACCESO Y REGLAS DE NEGOCIO (Horarios, Cuadres, Feriados) ---
        const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'pago');
        if (!access.allowed) {
            console.warn(`[ACCESO BLOQUEADO] Pago rechazado: ${access.reason} para id: ${user.id}`);
            return NextResponse.json({ 
                error: access.reason,
                tipo_error: access.code,
                config: access.config,
                bloqueado: true
            }, { status: 403 });
        }
        // --- FIN VERIFICACIÓN DE ACCESO ---

        const body = await request.json()
        const { cuota_id, monto, metodo_pago = 'Efectivo', latitud, longitud } = body

        if (!cuota_id || !monto) {
            return NextResponse.json({ error: 'Faltan campos requeridos (cuota_id, monto)' }, { status: 400 })
        }

        // --- VERIFICACIÓN DE SCOPE (Supervisor solo puede pagar préstamos de sus asesores) ---
        if (perfil.rol === 'supervisor') {
            // Obtener el asesor_id del préstamo via la cuota
            const { data: cuotaData, error: cuotaError } = await supabaseAdmin
                .from('cronograma_cuotas')
                .select('prestamo_id, prestamos!inner(clientes!inner(asesor_id))')
                .eq('id', cuota_id)
                .single()

            if (cuotaError || !cuotaData) {
                return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
            }

            const asesorDelPrestamo = (cuotaData as any).prestamos?.clientes?.asesor_id

            // Verificar que el asesor del préstamo está bajo la supervisión del supervisor
            if (asesorDelPrestamo) {
                const { data: asesorPerfil } = await supabaseAdmin
                    .from('perfiles')
                    .select('supervisor_id')
                    .eq('id', asesorDelPrestamo)
                    .single()
                
                if (asesorPerfil?.supervisor_id !== user.id) {
                    return NextResponse.json({ 
                        error: 'Solo puede registrar pagos de asesores bajo su supervisión.' 
                    }, { status: 403 })
                }
            }
        }
        // --- FIN VERIFICACIÓN DE SCOPE ---

        // --- VERIFICACIÓN DE BLOQUEO DE PAGOS POR ADMIN ---
        if (perfil.rol !== 'admin') {
            // Obtener el asesor_id del préstamo
            const { data: cuotaInfo } = await supabaseAdmin
                .from('cronograma_cuotas')
                .select('prestamos!inner(clientes!inner(asesor_id))')
                .eq('id', cuota_id)
                .single()

            const asesorId = (cuotaInfo as any)?.prestamos?.clientes?.asesor_id

            if (asesorId) {
                const { data: asesorData } = await supabaseAdmin
                    .from('perfiles')
                    .select('pagos_bloqueados')
                    .eq('id', asesorId)
                    .single()
                
                if (asesorData?.pagos_bloqueados) {
                    return NextResponse.json({ 
                        error: 'Los pagos para este asesor están bloqueados por el administrador.' 
                    }, { status: 403 })
                }
            }
        }
        // --- FIN VERIFICACIÓN DE BLOQUEO ---

        // Call RPC using Admin Client
        const { data, error } = await supabaseAdmin.rpc('registrar_pago_db', {
            p_cuota_id: cuota_id,
            p_monto: monto,
            p_usuario_id: user.id,
            p_metodo_pago: metodo_pago,
            p_latitud: latitud,
            p_longitud: longitud
        })

        if (error) {
            console.error('RPC Error:', error)
            return NextResponse.json({ error: error.message }, { status: 400 })
        }

        // Log para depuración
        console.log('RPC Response:', JSON.stringify(data, null, 2))

        // Parse result - RPC puede devolver string o objeto
        let result = data
        if (typeof data === 'string') {
            try {
                result = JSON.parse(data)
            } catch (e) {
                console.error('Error parsing RPC response:', e)
            }
        }

        // Audit Log (using Admin) - Incluye el rol del usuario que hizo el pago
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'registrar_pago',
            tabla_afectada: 'pagos',
            detalle: { cuota_id, monto, result, rol_cobrador: perfil.rol, latitud, longitud }
        })

        // Iniciar notificación asíncrona (no bloquea la respuesta del pago)
        if (result.pago_id) {
            import('@/utils/notifications').then(mod => {
                mod.notificarPagoCliente(result.pago_id)
            }).catch(err => {
                console.error('Error al iniciar notificación:', err)
            })
        }

        revalidatePath('/dashboard/pagos')
        revalidatePath('/dashboard/prestamos', 'layout')

        return NextResponse.json(result)

    } catch (e: any) {
        console.error('Unexpected Error:', e)
        return NextResponse.json({ error: e.message || 'Error interno del servidor' }, { status: 500 })
    }
}
