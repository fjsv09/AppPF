
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Authorization header')

        // Verify User
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
        if (userError || !user) throw new Error('Invalid Token')

        // Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Check Role & GPS Requirement
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol, exigir_gps_cobranza')
            .eq('id', user.id)
            .single()

        if (!perfil) throw new Error('Profile not found')

        const { cuota_id, monto, latitud, longitud } = await req.json()

        if (!cuota_id || !monto) {
            throw new Error('Missing required fields')
        }

        // GPS Enforcement
        if (!!perfil.exigir_gps_cobranza && (latitud === undefined || latitud === null || longitud === undefined || longitud === null)) {
            throw new Error('Restricción de Seguridad: Se requiere ubicación GPS activa.')
        }

        // Call RPC
        const { data, error } = await supabaseAdmin.rpc('registrar_pago_db', {
            p_cuota_id: cuota_id,
            p_monto: monto,
            p_usuario_id: user.id,
            p_latitud: latitud,
            p_longitud: longitud
        })


        if (error) throw error

        // Audit
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'registrar_pago',
            tabla_afectada: 'pagos',
            detalle: { cuota_id, monto, result: data }
        })

        return new Response(
            JSON.stringify(data),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
