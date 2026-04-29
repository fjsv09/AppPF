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
            .select('rol, supervisor_id, exigir_gps_cobranza')
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
        const { cuota_id, monto, metodo_pago = 'Efectivo', latitud, longitud, voucher_url } = body

        if (!cuota_id || !monto) {
            return NextResponse.json({ error: 'Faltan campos requeridos (cuota_id, monto)' }, { status: 400 })
        }

        // --- VERIFICACIÓN DE GPS OBLIGATORIO ---
        // Se permite el bypass para roles administrativos (admin/supervisor) para facilitar operación desde PC
        const isStrictRole = perfil.rol === 'asesor';
        const missingGps = latitud === undefined || latitud === null || longitud === undefined || longitud === null;
        
        if (!!perfil.exigir_gps_cobranza && isStrictRole && missingGps) {
            console.warn(`[GPS RECHAZADO] Intento de pago sin coordenadas para asesor: ${user.id}`);
            return NextResponse.json({ 
                error: 'Restricción de Seguridad: Se requiere ubicación GPS activa para procesar cobranzas.' 
            }, { status: 403 })
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

        const isDigital = ['Yape', 'Plin', 'Transferencia'].includes(metodo_pago)
        let result: any = null

        // --- DETERMINAR TARGET USER ID (Para atribución de dinero/comisiones) ---
        // [NUEVO] Si quien registra es un Supervisor, el dinero debe atribuirse al Asesor del préstamo
        let targetUserId = user.id
        if (perfil?.rol === 'supervisor') {
            const { data: qData } = await supabaseAdmin
                .from('cronograma_cuotas')
                .select('prestamos(clientes(asesor_id))')
                .eq('id', cuota_id)
                .single()
            
            const loanAdvisorId = (qData?.prestamos as any)?.clientes?.asesor_id
            if (loanAdvisorId) {
                targetUserId = loanAdvisorId
                console.log(`[PAGOS] Rol Supervisor (${user.id}) registrando cobro para Asesor ${targetUserId}`)
            }
        }

        if (isDigital) {
            // --- NUEVO FLUJO SILENCIOSO PARA PAGOS DIGITALES ---
            // 1. Obtener datos de la cuota y del préstamo para el desglose
            const { data: cuotaRaw, error: cErr } = await supabaseAdmin
                .from('cronograma_cuotas')
                .select('monto_cuota, monto_pagado, prestamos(interes)')
                .eq('id', cuota_id)
                .single()
            
            if (cErr) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
            const cuota = cuotaRaw as any
            const tasaInteres = parseFloat(cuota.prestamos?.interes || '0')
            
            // Cálculo del desglose (Interés Simple / Flat)
            // ratio = tasa / (100 + tasa)
            const montoFloat = parseFloat(monto)
            const interesCobrado = Math.round((montoFloat * (tasaInteres / (100 + tasaInteres))) * 100) / 100
            const capitalCobrado = Math.round((montoFloat - interesCobrado) * 100) / 100

            const nuevoMontoPagado = (parseFloat(cuota.monto_pagado) || 0) + montoFloat
            const nuevoEstado = nuevoMontoPagado >= parseFloat(cuota.monto_cuota) ? 'pagado' : 'pendiente'

            // 2. Actualizar Cuota
            await supabaseAdmin
                .from('cronograma_cuotas')
                .update({ 
                    monto_pagado: nuevoMontoPagado, 
                    estado: nuevoEstado,
                    fecha_pago: new Date().toISOString()
                })
                .eq('id', cuota_id)

            // 3. Crear Registro de Pago (estado pendiente)
            const { data: newPago, error: pErr } = await supabaseAdmin
                .from('pagos')
                .insert({
                    cuota_id,
                    monto_pagado: monto,
                    capital_cobrado: capitalCobrado,
                    interes_cobrado: interesCobrado,
                    registrado_por: user.id,
                    metodo_pago,
                    latitud,
                    longitud,
                    voucher_url,
                    estado_verificacion: 'pendiente'
                })
                .select('id')
                .single()

            if (pErr) return NextResponse.json({ error: 'Error al registrar pago: ' + pErr.message }, { status: 500 })

            result = { 
                success: true, 
                message: 'Pago digital registrado. Pendiente de validación por administración.',
                pago_id: newPago.id 
            }
        } else {
            // --- FLUJO TRADICIONAL PARA EFECTIVO ---
            
            const { data, error } = await supabaseAdmin.rpc('registrar_pago_db', {
                p_cuota_id: cuota_id,
                p_monto: monto,
                p_usuario_id: targetUserId, // Atribuimos el dinero al Asesor si es supervisor
                p_metodo_pago: metodo_pago,
                p_latitud: latitud,
                p_longitud: longitud,
                p_voucher_url: voucher_url
            })

            if (error) {
                console.error('RPC Error:', error)
                return NextResponse.json({ error: error.message }, { status: 400 })
            }

            result = typeof data === 'string' ? JSON.parse(data) : data
        }

        // Audit Log (using Admin) - Incluye el ID real de quien hizo el pago para auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'registro_pago',
            tabla_afectada: 'pagos',
            registro_id: result.pago_id || null,
            detalle: { 
                metodo_pago, 
                monto, 
                cuota_id, 
                rol_ejecutor: perfil?.rol,
                atribuido_a: targetUserId !== user.id 
                    ? 'asesor_prestamo' 
                    : 'cuenta_propia',
                target_user_id: targetUserId
            }
        })

        // Notificaciones y revalidación en segundo plano (sin bloquear respuesta)
        if (result.pago_id) {
            import('@/utils/notifications').then(mod => {
                mod.notificarPagoCliente(result.pago_id)
                if (['Yape', 'Plin', 'Transferencia'].includes(metodo_pago)) {
                    mod.notificarATodos(['admin', 'secretaria'], 'Nuevo Pago Digital', `S/ ${monto} por validar.`, 'warning')
                }
            }).catch(e => console.error('Notify Error:', e))
        }

        revalidatePath('/dashboard/pagos')
        revalidatePath('/dashboard/prestamos') // Eliminamos 'layout' para mayor rapidez
        revalidatePath('/dashboard/clientes')

        return NextResponse.json(result)

    } catch (e: any) {
        console.error('Unexpected Error:', e)
        return NextResponse.json({ error: e.message || 'Error interno del servidor' }, { status: 500 })
    }
}
