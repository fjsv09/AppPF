import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const body = await request.json()
        const { meta_id, monto, fecha, detalles_calculo } = body

        if (!meta_id || !monto || !fecha) {
            return NextResponse.json({ error: 'Faltan datos requeridos (meta_id, monto, fecha)' }, { status: 400 })
        }

        // --- VALIDACIÓN DE DÍA HÁBIL (SERVIDOR) ---
        const d = new Date(fecha + 'T12:00:00')
        const diaSemana = d.getDay()
        if (diaSemana === 0) {
            return NextResponse.json({ error: 'No se procesan bonos los Domingos.' }, { status: 400 })
        }

        const supabaseAdmin = createAdminClient()

        // Verificar si es feriado
        const { data: feriado } = await supabaseAdmin
            .from('feriados')
            .select('id')
            .eq('fecha', fecha)
            .single()
        
        if (feriado) {
            return NextResponse.json({ error: 'No se procesan bonos en días feriados.' }, { status: 400 })
        }

        // --- INSERCIÓN SEGURA (BYPASS RLS) ---
        const { data: bono, error: bonoError } = await supabaseAdmin
            .from('bonos_pagados')
            .insert({
                meta_id,
                asesor_id: user.id,
                monto,
                fecha,
                estado: 'pendiente',
                detalles_calculo: detalles_calculo || {}
            })
            .select()
            .single()

        if (bonoError) throw bonoError

        // --- NOTIFICAR A ADMINISTRADORES ---
        try {
            const { data: admins } = await supabaseAdmin.from('perfiles').select('id').eq('rol', 'admin')
            if (admins && admins.length > 0) {
                const notifications = admins.map(admin => ({
                    usuario_destino_id: admin.id,
                    titulo: 'NUEVO BONO PENDIENTE',
                    mensaje: `El asesor ha alcanzado un bono de S/ ${monto}. Requiere aprobación.`,
                    link_accion: '/dashboard/admin/metas?tab=liquidaciones',
                    leido: false
                }))
                await supabaseAdmin.from('notificaciones').insert(notifications)
            }
        } catch (notifErr) {
            console.error('[BONO_API] Error enviando notificaciones:', notifErr)
        }

        return NextResponse.json({ success: true, data: bono })

    } catch (e: any) {
        console.error('[BONO_API] Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
