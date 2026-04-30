import { NextResponse } from 'next/server'
import { createAdminClient, requireRole } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
    const guard = await requireRole(['admin', 'supervisor', 'secretaria'])
    if ('error' in guard) return guard.error

    try {
        const supabase = createAdminClient()

        const { data: usuarios, error } = await supabase
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .order('nombre_completo')

        if (error) throw error

        return NextResponse.json(usuarios)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
