import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        const { data, error } = await supabaseAdmin
            .from('perfiles')
            .select('*')
            .limit(1)
        
        if (error) throw error
        
        const columns = Object.keys(data[0] || {})
        const exists = columns.includes('exigir_gps_cobranza')
        
        return NextResponse.json({ columns, exists })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
