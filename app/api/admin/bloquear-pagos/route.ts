import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const guard = await requireAdmin()
    if ('error' in guard) return guard.error
    const { user } = guard

    try {
        const supabaseAdmin = createAdminClient()

        const body = await request.json()
        const { asesor_id, bloqueado } = body

        if (!asesor_id || typeof bloqueado !== 'boolean') {
            return NextResponse.json({ error: 'Faltan campos requeridos (asesor_id, bloqueado)' }, { status: 400 })
        }

        // Verificar que el asesor existe
        const { data: asesor, error: asesorError } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .eq('id', asesor_id)
            .single()

        if (asesorError || !asesor) {
            return NextResponse.json({ error: 'Asesor no encontrado' }, { status: 404 })
        }

        // Actualizar el campo pagos_bloqueados
        const { error: updateError } = await supabaseAdmin
            .from('perfiles')
            .update({ pagos_bloqueados: bloqueado })
            .eq('id', asesor_id)

        if (updateError) {
            console.error('Error updating bloqueo:', updateError)
            return NextResponse.json({ error: 'Error al actualizar bloqueo de pagos' }, { status: 500 })
        }

        // Audit Log
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: bloqueado ? 'bloquear_pagos_asesor' : 'desbloquear_pagos_asesor',
            tabla_afectada: 'perfiles',
            detalle: { 
                asesor_id, 
                asesor_nombre: asesor.nombre_completo,
                bloqueado,
                accion_admin: `Admin ${bloqueado ? 'bloqueó' : 'desbloqueó'} pagos para ${asesor.nombre_completo}`
            }
        })

        revalidatePath('/dashboard/prestamos', 'layout')

        return NextResponse.json({ 
            success: true, 
            message: bloqueado 
                ? `Pagos bloqueados para ${asesor.nombre_completo}` 
                : `Pagos desbloqueados para ${asesor.nombre_completo}` 
        })

    } catch (e: any) {
        console.error('Error en bloquear-pagos:', e)
        return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
    }
}
