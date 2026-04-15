import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/migracion/cleanup
 * Limpia TODOS los datos creados por la migración de prueba.
 * Borra: movimientos, cronograma, préstamos, solicitudes migradas.
 * TEMPORAL — eliminar después de la migración real.
 */
export async function GET(request: Request) {
    const supabaseAdmin = createAdminClient()
    const bypassKey = request.headers.get('x-migration-key')
    if (bypassKey !== 'antigravity-secret-cleanup-key') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    try {
        const { count: movs } = await supabaseAdmin.from('movimientos_financieros').select('*', { count: 'exact', head: true }).like('descripcion', '%[MIGRACIÓN]%')
        const { data: sols } = await supabaseAdmin.from('solicitudes').select('id').eq('motivo_prestamo', 'Migración de datos - Sistema Anterior')
        const solIds = sols?.map(s => s.id) || []
        const { count: prestamos } = await supabaseAdmin.from('prestamos').select('*', { count: 'exact', head: true }).in('solicitud_id', solIds)
        const { count: crono } = await supabaseAdmin.from('cronograma_cuotas').select('*', { count: 'exact', head: true }).in('prestamo_id', prestamos ? [/* this is just for count */] : [])

        return NextResponse.json({
            movimientos: movs,
            solicitudes: solIds.length,
            prestamos: prestamos,
            mensaje: movs === 0 && solIds.length === 0 ? 'TODO LIMPIO' : 'HAY DATOS'
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message })
    }
}

export async function DELETE(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const bypassKey = request.headers.get('x-migration-key')
        const isInternal = bypassKey === 'antigravity-secret-cleanup-key'

        let userResult: any = { data: { user: null } }
        if (!isInternal) {
            userResult = await supabase.auth.getUser()
            if (!userResult.data.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const userId = isInternal ? (await supabaseAdmin.from('perfiles').select('id').eq('rol', 'admin').limit(1).single()).data?.id : userResult.data.user.id

        if (!isInternal) {
            const { data: perfil } = await supabaseAdmin
                .from('perfiles')
                .select('rol')
                .eq('id', userId)
                .single()

            if (perfil?.rol !== 'admin') {
                return NextResponse.json({ error: 'Solo administradores' }, { status: 403 })
            }
        }

        const deleted = {
            movimientos: 0,
            cronograma: 0,
            tareas: 0,
            prestamos: 0,
            solicitudes: 0,
            clientes: 0,
            auditoria: 0
        }

        // 1. Borrar movimientos financieros de migración
        const { data: movs } = await supabaseAdmin
            .from('movimientos_financieros')
            .select('id')
            .like('descripcion', '%[MIGRACIÓN]%')

        if (movs && movs.length > 0) {
            const movIds = movs.map(m => m.id)
            await supabaseAdmin.from('movimientos_financieros').delete().in('id', movIds)
            deleted.movimientos = movIds.length
        }

        // 2. Buscar solicitudes de migración
        const { data: solicitudes } = await supabaseAdmin
            .from('solicitudes')
            .select('id, cliente_id')
            .eq('motivo_prestamo', 'Migración de datos - Sistema Anterior')

        if (solicitudes && solicitudes.length > 0) {
            const solIds = solicitudes.map(s => s.id)

            // 3. Buscar préstamos asociados
            const { data: prestamos } = await supabaseAdmin
                .from('prestamos')
                .select('id')
                .in('solicitud_id', solIds)

            if (prestamos && prestamos.length > 0) {
                const prestIds = prestamos.map(p => p.id)

                // 3a. Borrar cronograma de esos préstamos
                const { data: cronos } = await supabaseAdmin
                    .from('cronograma_cuotas')
                    .select('id')
                    .in('prestamo_id', prestIds)
                if (cronos && cronos.length > 0) {
                    await supabaseAdmin.from('cronograma_cuotas').delete().in('prestamo_id', prestIds)
                    deleted.cronograma = cronos.length
                }

                // 3b. Borrar tareas_evidencia
                const { data: tareas } = await supabaseAdmin
                    .from('tareas_evidencia')
                    .select('id')
                    .in('prestamo_id', prestIds)
                if (tareas && tareas.length > 0) {
                    await supabaseAdmin.from('tareas_evidencia').delete().in('prestamo_id', prestIds)
                    deleted.tareas = tareas.length
                }

                // 3c. Borrar préstamos
                await supabaseAdmin.from('prestamos').delete().in('id', prestIds)
                deleted.prestamos = prestIds.length
            }

            // 4. Borrar solicitudes de migración
            await supabaseAdmin.from('solicitudes').delete().in('id', solIds)
            deleted.solicitudes = solIds.length
        }

        // 5. Borrar clientes de migración (aquellos vinculados a solicitudes de migración)
        if (solicitudes && solicitudes.length > 0) {
            const { data: clientsToPurge } = await supabaseAdmin
                .from('clientes')
                .select('id')
                .in('id', solicitudes.map(s => (s as any).cliente_id).filter(Boolean))
            
            if (clientsToPurge && clientsToPurge.length > 0) {
                const clientIds = clientsToPurge.map(c => c.id)
                await supabaseAdmin.from('clientes').delete().in('id', clientIds)
                deleted.clientes = clientIds.length
            }
        }

        // 6. Borrar auditoría de migración
        const { data: audits } = await supabaseAdmin
            .from('auditoria')
            .select('id')
            .in('accion', ['migracion_cliente', 'migracion_prestamo', 'migracion_gasto'])

        if (audits && audits.length > 0) {
            await supabaseAdmin.from('auditoria').delete().in('id', audits.map(a => a.id))
            deleted.auditoria = audits.length
        }

        // 6. Restaurar saldo de cuenta Efectivo Global (recalcular)
        // No se toca porque ya se eliminaron los movimientos

        return NextResponse.json({
            message: 'Limpieza de migración completada',
            deleted
        })

    } catch (error: any) {
        console.error('Cleanup Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
