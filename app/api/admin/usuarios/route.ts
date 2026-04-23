import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createAdminClient() // Usamos admin para leer perfiles
        
        // 1. Obtener el ID del usuario actual para excluirlo
        const { data: { user } } = await supabase.auth.getUser()
        
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
