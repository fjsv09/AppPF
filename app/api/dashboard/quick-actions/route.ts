import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol, id')
            .eq('id', user.id)
            .single()

        if (!perfil) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })

        let asesorIds: string[] = [user.id]

        if (perfil.rol === 'supervisor') {
            const { data: team } = await supabaseAdmin
                .from('perfiles')
                .select('id')
                .eq('supervisor_id', user.id)
            asesorIds = [...asesorIds, ...(team?.map(t => t.id) || [])]
        } else if (perfil.rol === 'admin') {
            // Admin doesn't need to filter by asesorIds, they see all
        }

        // 1. SOLICITUDES PENDIENTES
        let solQuery = supabaseAdmin
            .from('solicitudes')
            .select('id, monto_solicitado, created_at, estado_solicitud, cliente:cliente_id(nombres), prospecto_nombres')
            .eq('estado_solicitud', 'pendiente_supervision')
            .order('created_at', { ascending: false })
            .limit(5)

        if (perfil.rol !== 'admin') {
            solQuery = solQuery.in('asesor_id', asesorIds)
        }

        const { data: solicitudes } = await solQuery

        // 2. RENOVACIONES PENDIENTES
        let renQuery = supabaseAdmin
            .from('renovaciones')
            .select('id, monto_nuevo, created_at, cliente:cliente_id(nombres)')
            .eq('estado', 'pendiente')
            .order('created_at', { ascending: false })
            .limit(5)

        if (perfil.rol !== 'admin') {
            renQuery = renQuery.in('asesor_id', asesorIds)
        }

        const { data: renovaciones } = await renQuery
        
        // 3. CUADRES PENDIENTES (SOLO PARA EL ADMIN)
        let cuadres: any[] = []
        if (perfil.rol === 'admin') {
            const { data: qData } = await supabaseAdmin
                .from('cuadres_diarios')
                .select(`
                    id,
                    saldo_entregado,
                    created_at,
                    estado,
                    perfiles:asesor_id(nombre_completo)
                `)
                .eq('estado', 'pendiente')
                .order('created_at', { ascending: false })
                .limit(5)
            cuadres = qData || []
        }

        // 4. RESUMEN NÓMINA (PARA ASESOR)
        let nomina = null
        if (perfil.rol === 'asesor') {
            const today = new Date()
            const { data: nData } = await supabaseAdmin
                .from('nomina_personal')
                .select('*')
                .eq('trabajador_id', user.id)
                .eq('mes', today.getMonth() + 1)
                .eq('anio', today.getFullYear())
                .single()
            nomina = nData
        }

        return NextResponse.json({
            solicitudes: solicitudes || [],
            renovaciones: renovaciones || [],
            cuadres: cuadres,
            nomina: nomina
        })

    } catch (e: any) {
        console.error('Error fetching quick actions data:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
