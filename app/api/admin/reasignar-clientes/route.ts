import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: NextRequest) {
    try {
        const { clientIds, newAsesorId, motivo } = await request.json()

        if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0 || !newAsesorId) {
            return NextResponse.json(
                { error: 'Parámetros inválidos' },
                { status: 400 }
            )
        }

        // Validar que el ejecutor tenga rol Admin real comprobando contra DB
        const authCheck = await requireAdmin()
        if ('error' in authCheck) {
            return authCheck.error // Retorna el 401/403 construido
        }
        
        const { user } = authCheck
        const supabaseAdmin = createAdminClient()

        // 1. Obtener los asesores actuales antes de cambiar
        const { data: currentClients, error: fetchError } = await supabaseAdmin
            .from('clientes')
            .select('id, asesor_id')
            .in('id', clientIds)

        if (fetchError) {
            console.error('Error obteniendo clientes actuales:', fetchError)
            return NextResponse.json({ error: fetchError.message }, { status: 500 })
        }

        // 2. Preparar el historial
        const logs = currentClients.map(c => ({
            cliente_id: c.id,
            asesor_anterior_id: c.asesor_id,
            asesor_nuevo_id: newAsesorId,
            creado_por: user.id,
            motivo: motivo || 'Reasignación administrativa'
        }))

        // 3. Ejecutar la actualización masiva de asesores
        const { error: updateError } = await supabaseAdmin
            .from('clientes')
            .update({ asesor_id: newAsesorId })
            .in('id', clientIds)

        if (updateError) {
            console.error('Error en actualización de asesores:', updateError)
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        // 4. Insertar en el historial
        const { error: logError } = await supabaseAdmin
            .from('historial_reasignaciones_clientes')
            .insert(logs)

        if (logError) {
            console.error('Error insertando en historial:', logError)
            // No bloqueamos aquí, el mensaje principal es el éxito de la reasignación
        }

        // 5. Generar notificación para el asesor destino
        try {
            await supabaseAdmin.rpc('crear_notificacion', {
                p_titulo: 'Nuevos Clientes Asignados',
                p_mensaje: `Se te han asignado ${clientIds.length} nuevos clientes a tu cartera.`,
                p_usuario_id: newAsesorId,
                p_link: '/dashboard/clientes',
                p_tipo: 'info'
            })
        } catch (notifierr) {
            console.error('Error enviando notificación:', notifierr)
        }

        return NextResponse.json({ 
            success: true, 
            message: `Se han reasignado ${clientIds.length} clientes exitosamente.`
        })

    } catch (error: any) {
        console.error('Error crítico en reasignación:', error)
        return NextResponse.json(
            { error: error.message || 'Error interno del servidor' },
            { status: 500 }
        )
    }
}
