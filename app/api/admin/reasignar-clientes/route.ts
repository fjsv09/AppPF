import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Mismo patrón que crear-usuario para usar service role
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

export async function POST(request: NextRequest) {
    try {
        const { clientIds, newAsesorId } = await request.json()

        if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0 || !newAsesorId) {
            return NextResponse.json(
                { error: 'Parámetros inválidos' },
                { status: 400 }
            )
        }

        // Actualización usando el cliente Admin (bypass RLS y políticas de restricción de frontend)
        const { data, error, count } = await supabaseAdmin
            .from('clientes')
            .update({ asesor_id: newAsesorId })
            .in('id', clientIds)
            .select()

        if (error) {
            console.error('Error en reasignación Supabase:', error)
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ 
            success: true, 
            message: `Se han reasignado ${clientIds.length} clientes.`,
            count: clientIds.length 
        })

    } catch (error: any) {
        console.error('Error crítico en API de reasignación:', error)
        return NextResponse.json(
            { error: error.message || 'Error interno' },
            { status: 500 }
        )
    }
}
