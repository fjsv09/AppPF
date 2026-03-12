import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = createAdminClient()

    try {
        // 1. Obtener préstamos activos con info de cliente y asesor
        const { data: prestamos, error: pError } = await supabase
            .from('prestamos')
            .select(`
                id,
                created_by,
                cliente:clientes(id, nombres, dni, excepcion_voucher)
            `)
            .eq('estado', 'activo')

        if (pError) throw pError

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const newTasks = []

        // Obtener historial de tareas de este mes para evitar duplicados
        const { data: existingTasks } = await supabase
            .from('tareas_evidencia')
            .select('prestamo_id')
            .filter('tipo', 'ilike', 'auditoria_dirigida%')
            .gte('created_at', startOfMonth)

        const existingLoanIds = new Set(existingTasks?.map(t => t.prestamo_id) || [])

        for (const p of (prestamos as any[])) {
             if (existingLoanIds.has(p.id)) continue

             let priority = 0
             let detail = ''

             const cliente = Array.isArray(p.cliente) ? p.cliente[0] : p.cliente;

             // REGLA 1: Sin Notificaciones (Modo Excepción)
             if (cliente?.excepcion_voucher) {
                 // Solo auditamos si hay al menos un pago registrado para este préstamo
                 const { count: pagosExistentes } = await supabase
                    .from('pagos')
                    .select('*', { count: 'exact', head: true })
                    .eq('prestamo_id', p.id)

                 if (pagosExistentes && pagosExistentes > 0) {
                    priority = 1
                    detail = 'P1: Cliente bajo excepción de voucher. Auditoría obligatoria.'
                 }
             } 
             
             // REGLA 2: Sin Evidencia (Si no es P1, evaluar tasa de voucher)
             if (priority === 0) {
                 const { data: lastPagos } = await supabase
                    .from('pagos')
                    .select('voucher_compartido')
                    .eq('prestamo_id', p.id)
                    .order('fecha_pago', { ascending: false })
                    .limit(5)

                 if (lastPagos && lastPagos.length >= 3) {
                     const sharedCount = lastPagos.filter(pg => pg.voucher_compartido).length
                     if (sharedCount / lastPagos.length <= 0.5) {
                         priority = 2
                         detail = 'P2: Baja tasa de vouchers compartidos en pagos recientes.'
                     }
                 }
             }

             // REGLA 3: Aleatorio al 5%
             if (priority === 0 && Math.random() < 0.05) {
                 // Verificar que tenga al menos un pago registrado
                 const { count: countTotal } = await supabase
                    .from('pagos')
                    .select('*', { count: 'exact', head: true })
                    .eq('prestamo_id', p.id)

                 if (countTotal && countTotal > 0) {
                     priority = 3
                     detail = 'P3: Selección aleatoria de control (5%).'
                 }
             }

             if (priority > 0) {
                 // Buscar quién debe realizar la tarea (Supervisor del asesor del préstamo)
                 const { data: creatorProfile } = await supabase
                    .from('perfiles')
                    .select('supervisor_id, rol')
                    .eq('id', p.created_by)
                    .single()
                 
                 let assignTo = p.created_by // Por defecto: al creador

                 if (creatorProfile?.supervisor_id) {
                     // El creador tiene supervisor → asignamos al supervisor
                     assignTo = creatorProfile.supervisor_id
                 } else if (creatorProfile?.rol === 'admin') {
                     // El creador es admin (sin supervisor) → buscar al asesor real del préstamo
                     // via tareas de evidencia anteriores del mismo préstamo
                     const { data: tareaAnterior } = await supabase
                         .from('tareas_evidencia')
                         .select('asesor_id, asesor:perfiles!asesor_id(supervisor_id)')
                         .eq('prestamo_id', p.id)
                         .neq('tipo', 'auditoria_dirigida')
                         .order('created_at', { ascending: false })
                         .limit(1)
                         .single()
                     
                     if (tareaAnterior) {
                         const asesor = Array.isArray(tareaAnterior.asesor) ? tareaAnterior.asesor[0] : tareaAnterior.asesor
                         // Si el asesor tiene supervisor, asignar al supervisor
                         assignTo = asesor?.supervisor_id || tareaAnterior.asesor_id
                     }
                 }

                 newTasks.push({
                     asesor_id: assignTo, // El supervisor que debe realizar la auditoría
                     prestamo_id: p.id,
                     tipo: `auditoria_dirigida`,
                     estado: 'pendiente',
                 })
             }
        }

        if (newTasks.length > 0) {
            const { error: insError } = await supabase
                .from('tareas_evidencia')
                .insert(newTasks)
            
            if (insError) throw insError

            // NOTIFICAR A LOS ASIGNADOS
            for (const task of newTasks) {
                const { data: prestamoInfo } = await supabase
                    .from('prestamos')
                    .select('id, clientes(nombres)')
                    .eq('id', task.prestamo_id)
                    .single()

                const clienteNombres = (prestamoInfo?.clientes as any)?.nombres || 'Cliente'

                await createFullNotification(task.asesor_id, {
                    titulo: '⚖️ Auditoría Dirigida',
                    mensaje: `Se ha generado una auditoría obligatoria para el préstamo de ${clienteNombres}.`,
                    link: `/dashboard/tareas?tab=auditoria`,
                    tipo: 'warning'
                })
            }
        }

        return NextResponse.json({
            success: true,
            totalCreated: newTasks.length,
            message: `Se han generado ${newTasks.length} nuevas tareas de auditoría dirigida.`
        })

    } catch (e: any) {
        console.error('CRON_AUDITORIA_ERROR:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
