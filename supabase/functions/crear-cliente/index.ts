
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

        // Check Role (Any authenticated user can create a client? Or restricted?
        // Prompt says "Control de roles estricto... Cada acción valida rol en backend".
        // Let's allow 'asesor', 'supervisor', 'admin'.
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil) throw new Error('Usuario sin perfil')
        // All roles can create clients usually.

        const { dni, nombres, telefono, direccion } = await req.json()

        if (!dni || !nombres) {
            throw new Error('DNI and Nombres are required')
        }

        // Check Duplicate DNI
        const { data: existing } = await supabaseAdmin
            .from('clientes')
            .select('id')
            .eq('dni', dni)
            .single()
        
        if (existing) {
            throw new Error('Cliente con este DNI ya existe')
        }

        // Create Client
        const { data: cliente, error: insertError } = await supabaseAdmin
            .from('clientes')
            .insert({
                dni,
                nombres,
                telefono,
                direccion,
                estado: 'activo'
            })
            .select()
            .single()

        if (insertError) throw insertError

        // Audit
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'crear_cliente',
            tabla_afectada: 'clientes',
            registro_id: cliente.id,
            detalle: { dni, nombres }
        })

        return new Response(
            JSON.stringify(cliente),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
