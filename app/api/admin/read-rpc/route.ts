import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        const { data, error } = await supabaseAdmin.rpc('get_function_definition', {
            function_name: 'registrar_pago_db'
        })
        
        // Si no existe la función auxiliar, probamos con una consulta directa
        if (error) {
            const { data: rawData, error: rawError } = await supabaseAdmin
                .from('pg_proc')
                .select('prosrc')
                .eq('proname', 'registrar_pago_db')
                .single()
            
            return NextResponse.json({ definition: rawData?.prosrc || rawError })
        }

        return NextResponse.json({ definition: data })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
