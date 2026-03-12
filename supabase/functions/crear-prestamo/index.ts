
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

        // Check Role
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            throw new Error('Unauthorized: Only Admin can create loans')
        }

        const { cliente_id, monto, interes, fecha_inicio, fecha_fin } = await req.json()

        if (!cliente_id || !monto || !interes || !fecha_inicio || !fecha_fin) {
            throw new Error('Missing required fields')
        }

        // Create Loan
        const { data: prestamo, error: insertError } = await supabaseAdmin
            .from('prestamos')
            .insert({
                cliente_id,
                monto,
                interes,
                fecha_inicio,
                fecha_fin,
                estado: 'activo',
                created_by: user.id
            })
            .select()
            .single()

        if (insertError) throw insertError

        // Audit
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'crear_prestamo',
            tabla_afectada: 'prestamos',
            registro_id: prestamo.id,
            detalle: { monto, interes, fecha_inicio, fecha_fin }
        })

        return new Response(
            JSON.stringify(prestamo),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
