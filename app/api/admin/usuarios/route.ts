import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const { createClient: createServerClient } = await import('@/utils/supabase/server')
        const serverClient = await createServerClient()
        const { data: { user } } = await serverClient.auth.getUser()
        
        const supabase = createAdminClient() 

        
        // 2. Obtener perfiles excluyendo al usuario actual
        let query = supabase
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .order('nombre_completo')
            
        if (user) {
            query = query.neq('id', user.id)
        }
        
        const { data: usuarios, error } = await query
        
        if (error) throw error
        
        return NextResponse.json(usuarios)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
