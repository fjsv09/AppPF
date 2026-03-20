import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'

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

        // --- VERIFICACIÓN DE HORARIO ---
        const { data: configs } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])

        const configMap = (configs || []).reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, {})

        const apertura = configMap['horario_apertura'] || '07:00'
        const cierre = configMap['horario_cierre'] || '20:00'
        const desbloqueoHasta = configMap['desbloqueo_hasta'] ? new Date(configMap['desbloqueo_hasta']) : null

        // --- DETECCIÓN ROBUSTA DE HORA LIMA ---
        const now = new Date()
        const formatter = new Intl.DateTimeFormat('es-PE', {
            timeZone: 'America/Lima',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        const currentTimeString = formatter.format(now)

        console.log(`[HORARIO CHECK] Hora actual (Lima): ${currentTimeString} | Rango: ${apertura} - ${cierre}`)

        const isWithinHours = currentTimeString >= apertura && currentTimeString <= cierre
        const isTemporaryUnlocked = desbloqueoHasta && now < desbloqueoHasta

        if (!isWithinHours && !isTemporaryUnlocked && perfil.rol !== 'admin') {
            console.warn(`[HORARIO BLOQUEO] Intento de pago bloqueado para rol: ${perfil.rol}. Fuera de horario.`)
            return NextResponse.json({ 
                error: `Registro de pagos fuera de horario. La jornada es de ${apertura} a ${cierre}.`,
                fuera_horario: true,
                horario: { apertura, cierre, actual: currentTimeString }
            }, { status: 403 })
        }
        // --- FIN VERIFICACIÓN DE HORARIO ---

        // --- VERIFICACIÓN DE BLOQUEO POR CUADRE (Solo Asesores) ---
        if (perfil.rol === 'asesor') {
            const blockStatus = await checkAdvisorBlocked(supabaseAdmin, user.id);
            if (blockStatus.isBlocked) {
                console.warn(`[CUADRE BLOQUEO] Intento de pago bloqueado para asesor: ${user.id}. Motivo: ${blockStatus.reason}`);
                return NextResponse.json({ 
                    error: blockStatus.reason,
                    bloqueado_por_cuadre: true 
                }, { status: 403 });
            }
        }
        // --- FIN VERIFICACIÓN DE BLOQUEO POR CUADRE ---

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

        revalidatePath('/dashboard/pagos')
        revalidatePath('/dashboard/prestamos', 'layout')

        return NextResponse.json(result)

    } catch (e: any) {
        console.error('Unexpected Error:', e)
        return NextResponse.json({ error: e.message || 'Error interno del servidor' }, { status: 500 })
    }
}
