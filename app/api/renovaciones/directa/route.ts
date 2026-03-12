import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

// POST - Crear y aprobar instantaneamente refinanciacion admin
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Verificar perfil Admin Estrictamente
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden realizar esta acción' }, { status: 403 })
        }

        const body = await request.json()

        // VERIFICAR HORARIO DEL SISTEMA
        const { data: configs } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')
            .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
        
        const configMap = (configs || []).reduce((acc: any, curr) => {
            acc[curr.clave] = curr.valor
            return acc
        }, { horario_apertura: '07:00', horario_cierre: '20:00', desbloqueo_hasta: '1970-01-01' })

        const now = new Date()
        const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
        const currentTime = peruTime.getHours().toString().padStart(2, '0') + ':' + peruTime.getMinutes().toString().padStart(2, '0')
        const isUnlocked = new Date(configMap.desbloqueo_hasta) > now

        if (!isUnlocked && (currentTime < configMap.horario_apertura || currentTime > configMap.horario_cierre)) {
            return NextResponse.json({ 
                error: `Sistema cerrado. El horario de operación es de ${configMap.horario_apertura} a ${configMap.horario_cierre}.`,
                tipo_error: 'sistema_cerrado'
            }, { status: 403 })
        }
        const { 
            prestamo_id,
            monto_solicitado, 
            interes, 
            cuotas, 
            modalidad, 
            fecha_inicio_propuesta,
            score_al_solicitar,
            detalles_score
        } = body

        if (!prestamo_id || !monto_solicitado || !interes || !cuotas || !modalidad || !fecha_inicio_propuesta) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
        }

        const { data: prestamoInfo } = await supabaseAdmin
            .from('prestamos')
            .select('cliente_id, created_by')
            .eq('id', prestamo_id)
            .single()

        if (!prestamoInfo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        // 1. Crear solicitud preaprobada automáticamente
        const solicitudData = {
            prestamo_id,
            cliente_id: prestamoInfo.cliente_id,
            asesor_id: user.id, // Admin como asesor en este caso
            monto_solicitado,
            interes,
            cuotas,
            modalidad,
            fecha_inicio_propuesta,
            estado_solicitud: 'pre_aprobado',
            requiere_excepcion: true,
            tipo_excepcion: 'mora_critica_admin',
            score_al_solicitar,
            resumen_comportamiento: detalles_score
        }

        const { data: solicitud, error: createError } = await supabaseAdmin
            .from('solicitudes_renovacion')
            .insert(solicitudData)
            .select()
            .single()

        if (createError) {
            console.error('Error creating direct solicitud:', createError)
            return NextResponse.json({ error: createError.message }, { status: 400 })
        }

        // 2. Procesar renovación (cierra anterior, crea nuevo)
        const { data: resultado, error: rpcError } = await supabaseAdmin
            .rpc('procesar_renovacion_aprobada', {
                p_solicitud_id: solicitud.id,
                p_aprobado_por: user.id
            })

        if (rpcError || !resultado.success) {
            console.error('Error processing direct renovation:', rpcError)
            return NextResponse.json({ error: rpcError?.message || 'Error al procesar' }, { status: 400 })
        }

        // 2.5 Corregir el estado en la base de datos a 'refinanciado' (el RPC por defecto pone 'renovado')
        await supabaseAdmin
            .from('prestamos')
            .update({ 
                estado: 'refinanciado',
                updated_at: new Date().toISOString()
            })
            .eq('id', prestamo_id)

        // Corregir también el historial_prestamos (RPC crea uno con estado_nuevo='renovado')
        await supabaseAdmin
            .from('historial_prestamos')
            .update({ 
                estado_nuevo: 'refinanciado',
                motivo: 'Refinanciación administrativa directa - Nuevo préstamo: ' + resultado.prestamo_nuevo_id
            })
            .eq('prestamo_id', prestamo_id)
            .eq('estado_nuevo', 'renovado')

        // 3. Liquidar cuotas pendientes del préstamo antiguo
        const { data: cuotasPendientes } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('id, monto_cuota')
            .eq('prestamo_id', prestamo_id)
            .neq('estado', 'pagado')

        if (cuotasPendientes && cuotasPendientes.length > 0) {
            const updatePromises = cuotasPendientes.map(cuota => 
                supabaseAdmin
                    .from('cronograma_cuotas')
                    .update({ 
                        estado: 'pagado', 
                        fecha_pago: new Date().toISOString(),
                        monto_pagado: cuota.monto_cuota
                    })
                    .eq('id', cuota.id)
            )
            await Promise.all(updatePromises)
        }

        // 4. Generar cronograma nuevo
        const { error: cronogramaError } = await supabaseAdmin.rpc('generar_cronograma_db', {
            p_prestamo_id: resultado.prestamo_nuevo_id
        })

        if (cronogramaError) {
             console.error('Error generating new cronograma:', cronogramaError)
        }

        // 5. Auditoría
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'refinanciar_directo_admin',
            tabla_afectada: 'prestamos',
            registro_id: resultado.prestamo_nuevo_id,
            detalle: { prestamo_original: prestamo_id, monto: monto_solicitado }
        })

        // 6. ====== CREAR TAREA DE EVIDENCIA ======
        const { error: tareaError } = await supabaseAdmin.from('tareas_evidencia').insert({
            asesor_id: prestamoInfo.created_by || user.id, // we might not have asesor_id in prestamoInfo, let me check
            prestamo_id: resultado.prestamo_nuevo_id,
            tipo: 'refinanciacion'
        })
        
        if (tareaError) {
            console.error('[DIRECT REFINANCE] Error creating tarea_evidencia:', tareaError)
        }

        revalidatePath('/dashboard/prestamos')
        revalidatePath('/dashboard/renovaciones')

        return NextResponse.json({ 
            success: true,
            prestamo_nuevo_id: resultado.prestamo_nuevo_id,
            message: 'Refinanciación administrativa completada' 
        }, { status: 200 })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
