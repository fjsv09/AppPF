import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') // 'background' o 'manual'

    try {
        console.log(`[AUDITORIA] Iniciando generación de tareas (${mode || 'manual'})...`)

        // --- LÓGICA DE FONDO (AUTO-THROTTLE) ---
        if (mode === 'background') {
            const { data: config } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('clave', 'last_audit_gen')
                .single()
            
            const lastRun = config?.valor ? new Date(config.valor) : new Date(0)
            const nowTime = new Date()
            
            if (lastRun.toDateString() === nowTime.toDateString()) {
                return NextResponse.json({ success: true, message: 'Ya ejecutado hoy.' })
            }
        }

        // 1. Obtener préstamos activos con su info de cliente
        const { data: prestamos, error: pError } = await supabase
            .from('prestamos')
            .select(`
                id,
                created_by,
                observacion_supervisor,
                clientes:cliente_id(id, nombres, dni, excepcion_voucher)
            `)
            .eq('estado', 'activo')

        if (pError) throw pError

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const newTasks = []

        // 2. Tareas ya existentes este mes (para no duplicar sobre el mismo préstamo)
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

             const isMigrado = (p.observacion_supervisor || '').includes('Préstamo migrado del sistema anterior')
             if (isMigrado) continue // [AISLAMIENTO] Los migrados no generan tareas de auditoría

             // Manejo de la relación con el cliente (puede venir como objeto o array de 1 elemento)
             const cliente = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes;
             if (!cliente) continue

             // --- REGLA 1: EXCEPCIÓN DE VOUCHER (AUDITORÍA 100% OBLIGATORIA) ---
             if (cliente.excepcion_voucher) {
                 const { count: cuotasPagadas } = await supabase
                    .from('cronograma_cuotas')
                    .select('*', { count: 'exact', head: true })
                    .eq('prestamo_id', p.id)
                    .gt('monto_pagado', 0.01)

                 if (cuotasPagadas && cuotasPagadas > 0) {
                    priority = 1
                    detail = `P1: Cliente bajo excepción (${cuotasPagadas} cobros sin voucher obligatorio).`
                 }
             } 
             
             // --- REGLA 2: BAJA TASA DE ENTREGA / ALTO VOLUMEN DE FALTAS ---
             if (priority === 0) {
                 // Obtener todas las cuotas pagadas de este préstamo
                 const { data: cuotasPagadas, error: cpError } = await supabase
                    .from('cronograma_cuotas')
                    .select('id')
                    .eq('prestamo_id', p.id)
                    .gt('monto_pagado', 0.01)
                 
                 if (cuotasPagadas && cuotasPagadas.length > 0) {
                     const totalCobros = cuotasPagadas.length
                     const idsCuotas = cuotasPagadas.map(c => c.id)

                     // Contar cuántos de esos cobros tienen voucher compartido real
                     const { data: pagos, error: pgError } = await supabase
                        .from('pagos')
                        .select('id, voucher_compartido')
                        .in('cuota_id', idsCuotas)
                        .or('es_autopago_renovacion.is.null,es_autopago_renovacion.eq.false')

                     const compartidos = pagos?.filter(pg => pg.voucher_compartido).length || 0
                     const faltantes = totalCobros - compartidos
                     const cumplimiento = compartidos / totalCobros

                     // DISPARADORES:
                     // A) Si faltan más de 3 vouchers en total
                     // B) Si el cumplimiento es menor al 70% (con al menos 3 cobros)
                     if (faltantes >= 3 || (totalCobros >= 3 && cumplimiento < 0.7)) {
                         priority = 2
                         detail = `P2: Baja entrega detectada (${faltantes} vouchers faltantes de ${totalCobros} cobros realizados).`
                     }
                 }
             }

             // --- REGLA 3: CONTROL ALEATORIO DE SEGURIDAD (5%) ---
             if (priority === 0 && Math.random() < 0.05) {
                 const { count: pagosOk } = await supabase
                    .from('cronograma_cuotas')
                    .select('*', { count: 'exact', head: true })
                    .eq('prestamo_id', p.id)
                    .gt('monto_pagado', 0.01)

                 if (pagosOk && pagosOk > 0) {
                    priority = 3
                    detail = 'P3: Control aleatorio preventivo (5%).'
                 }
             }

             // --- ASIGNACIÓN DE LA TAREA ---
             if (priority > 0) {
                 const { data: creatorProfile } = await supabase
                    .from('perfiles')
                    .select('supervisor_id, rol')
                    .eq('id', p.created_by)
                    .single()
                 
                 let assignTo = p.created_by
                 if (creatorProfile?.supervisor_id) {
                     assignTo = creatorProfile.supervisor_id
                 } else if (creatorProfile?.rol === 'admin') {
                     // Si el crédito fue creado por un admin, buscamos al asesor asignado al cliente
                     const { data: cData } = await supabase
                        .from('clientes')
                        .select('asesor:asesor_id(id, supervisor_id)')
                        .eq('id', cliente.id)
                        .single()
                     const asesor = Array.isArray(cData?.asesor) ? cData.asesor[0] : cData?.asesor
                     assignTo = asesor?.supervisor_id || asesor?.id || p.created_by
                 }

                 newTasks.push({
                     asesor_id: assignTo,
                     prestamo_id: p.id,
                     tipo: `auditoria_dirigida`,
                     estado: 'pendiente'
                 })
             }
        }

        // 3. Inserción de tareas y notificaciones
        if (newTasks.length > 0) {
            const { error: insError } = await supabase.from('tareas_evidencia').insert(newTasks)
            if (insError) throw insError

            for (const task of newTasks) {
                const { data: pInfo } = await supabase.from('prestamos').select('clientes:cliente_id(nombres)').eq('id', task.prestamo_id).single()
                const clienteNombre = (Array.isArray(pInfo?.clientes) ? pInfo?.clientes[0] : pInfo?.clientes)?.nombres || 'Cliente'
                
                await createFullNotification(task.asesor_id, {
                    titulo: '⚖️ Auditoría Dirigida',
                    mensaje: `Revisión obligatoria: ${clienteNombre}. Bajos niveles de vouchers detectados.`,
                    link: `/dashboard/tareas?tab=auditoria`,
                    tipo: 'warning'
                })
            }
        }

        // Actualizar marca de tiempo
        await supabase
            .from('configuracion_sistema')
            .update({ valor: new Date().toISOString() })
            .eq('clave', 'last_audit_gen')

        return NextResponse.json({
            success: true,
            totalCreated: newTasks.length,
            message: `Generación finalizada. ${newTasks.length} alertas detectadas.`
        })

    } catch (e: any) {
        console.error('CRON_AUDITORIA_ERROR:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
