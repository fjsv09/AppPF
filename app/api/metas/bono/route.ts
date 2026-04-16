import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

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

        if (bonoError) {
            if (bonoError.code === '23505' || bonoError.message?.includes('duplicate key')) {
                console.log(`[BONO_API] Bono ya existe para meta ${meta_id} en fecha ${fecha}. Ignorando.`);
                return NextResponse.json({ error: 'El bono ya está registrado.', code: 'DUPLICATE_BONUS' }, { status: 409 })
            }
            throw bonoError
        }

        // --- NOTIFICAR A ADMINISTRADORES ---
        try {
            // Conseguir nombre del asesor
            const { data: perfil } = await supabaseAdmin.from('perfiles').select('nombre_completo').eq('id', user.id).single()
            const asesorNombre = perfil?.nombre_completo || 'Un asesor'

            const { data: admins } = await supabaseAdmin.from('perfiles').select('id').eq('rol', 'admin')
            if (admins && admins.length > 0) {
                await Promise.all(admins.map(admin => 
                    createFullNotification(admin.id, {
                        titulo: '🏆 Bono Pendiente de Aprobación',
                        mensaje: `${asesorNombre} ha alcanzado un bono de S/ ${monto}. Requiere revisión en liquidaciones.`,
                        link: '/dashboard/admin/metas?tab=liquidaciones',
                        tipo: 'success'
                    })
                ))
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
