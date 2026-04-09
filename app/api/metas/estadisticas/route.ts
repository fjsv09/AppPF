import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { calculateMetasForUser } from '@/lib/metas-logic'

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        // Opcional para vista de supervisor
        const supervisorTargetUser = searchParams.get('userId') 
        const targetUserId = supervisorTargetUser || user.id

        const supabaseAdmin = createAdminClient()

        // Evaluamos pero no forzamos bonos
        const { stats, bonusesToPay } = await calculateMetasForUser(supabaseAdmin, targetUserId, true)

        if (!stats) {
             return NextResponse.json({ success: true, warning: 'No metas active', data: null })
        }

        return NextResponse.json({ 
            success: true, 
            data: {
                realTimeStats: stats,
                pendingOrProjectedBonuses: bonusesToPay
            }
        })

    } catch (e: any) {
        console.error('[API METAS STATS] Error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
