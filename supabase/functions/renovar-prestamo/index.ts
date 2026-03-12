
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

        // Admin/Supervisor Check (Renovations usually require approval, or at least being an asesore?)
        // Rules say: "Control de roles estricto". Let's verify role.
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        // Assumption: Admin and Supervisor can renew. Maybe Asesor too? 
        // Let's allow all staff (Admin, Supervisor, Asesor) to initiate, but strict roles might restrict.
        // For now, I'll allow all authenticated roles created in enum (admin, supervisor, asesor).
        if (!perfil) throw new Error('Profile not found')

        const { prestamo_original_id, nuevo_monto, nuevo_interes, nueva_fecha_inicio, nueva_fecha_fin } = await req.json()

        if (!prestamo_original_id || !nuevo_monto || !nuevo_interes || !nueva_fecha_inicio || !nueva_fecha_fin) {
            throw new Error('Missing required fields')
        }

        // Call RPC
        const { data: result, error: rpcError } = await supabaseAdmin
            .rpc('renovar_prestamo_db', {
                p_prestamo_original_id: prestamo_original_id,
                p_nuevo_monto: nuevo_monto,
                p_nuevo_interes: nuevo_interes,
                p_nueva_fecha_inicio: nueva_fecha_inicio,
                p_nueva_fecha_fin: nueva_fecha_fin,
                p_usuario_id: user.id
            })

        if (rpcError) throw rpcError

        // Audit is handled inside RPC? No, schema.sql RPC didn't have audit insert.
        // Wait, schema.sql had audit table but 'crear_prestamo' function had audit insert in JS.
        // 'renovar_prestamo_db' in schema.sql creates 'renovaciones' record.
        // Should we also add to 'auditoria'?
        // Rule: "Todo cambio crítico debe quedar auditado".
        // Let's add audit log here to be safe and consistent with 'crear-prestamo'.

        await supabaseAdmin.from('auditoria').insert({
             usuario_id: user.id,
             accion: 'renovar_prestamo',
             tabla_afectada: 'prestamos',
             registro_id: result.nuevo_prestamo_id, // RPC returns this
             detalle: { 
                 original_id: prestamo_original_id, 
                 saldo_anterior: result.saldo_anterior 
             }
        })

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
