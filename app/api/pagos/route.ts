import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'
import { checkSystemAccess } from '@/utils/systemRestrictions'

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
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfilError || !perfil) {
            console.error('Perfil Error:', perfilError)
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
        }
 
        // --- BLOQUEAR SUPERVISORES ---
        if (perfil.rol === 'supervisor') {
             return NextResponse.json({ 
                 error: 'Los supervisores no tienen permisos para registrar pagos directamente.' 
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
        const { cuota_id, monto, metodo_pago = 'Efectivo' } = body

        if (!cuota_id || !monto) {
            return NextResponse.json({ error: 'Faltan campos requeridos (cuota_id, monto)' }, { status: 400 })
        }

        // Call RPC using Admin Client
        const { data, error } = await supabaseAdmin.rpc('registrar_pago_db', {
            p_cuota_id: cuota_id,
            p_monto: monto,
            p_usuario_id: user.id,
            p_metodo_pago: metodo_pago
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

        // Audit Log (using Admin)
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'registrar_pago',
            tabla_afectada: 'pagos',
            detalle: { cuota_id, monto, result }
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
