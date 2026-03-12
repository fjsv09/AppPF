
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
            throw new Error('Unauthorized: Only Admin can lock schedules')
        }

        const { prestamo_id } = await req.json()

        if (!prestamo_id) throw new Error('prestamo_id is required')

        // Update Loan
        const { error: updateError } = await supabaseAdmin
            .from('prestamos')
            .update({ bloqueo_cronograma: true })
            .eq('id', prestamo_id)

        if (updateError) throw updateError

        // Audit
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'bloquear_cronograma',
            tabla_afectada: 'prestamos',
            registro_id: prestamo_id,
            detalle: { locked: true }
        })

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
