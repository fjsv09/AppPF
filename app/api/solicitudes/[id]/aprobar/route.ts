import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createFullNotification } from '@/services/notification-service'
import { generarCronogramaNode } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

// PATCH - Aprobar solicitud final (solo Admin)
// Esto crea el préstamo y genera el cronograma
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const payload = await request.json().catch(() => ({}))
        const { cuentaOrigenId } = payload
        let cuentaSeleccionada: any = null;

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // Verificar que es admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('id, rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden aprobar solicitudes' }, { status: 403 })
        }

        // --- VALIDAR SALDO SI HAY CUENTA DE ORIGEN ---
        if (!cuentaOrigenId) {
            return NextResponse.json({ error: 'Debe seleccionar una cuenta de origen para el desembolso.' }, { status: 400 })
        }

        const { data: cuenta, error: cuentaError } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuentaOrigenId)
            .single()
        
        if (cuentaError || !cuenta) {
            return NextResponse.json({ error: 'Cuenta de origen no encontrada' }, { status: 404 })
        }
        
        cuentaSeleccionada = cuenta

        // Verificar solicitud
        const { data: solicitud } = await supabaseAdmin
            .from('solicitudes')
            .select('*, cliente:cliente_id(*), asesor:asesor_id(id, nombre_completo)')
            .eq('id', id)
            .single()

        if (!solicitud) {
            return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
        }

        if (solicitud.estado_solicitud !== 'pre_aprobado' && solicitud.estado_solicitud !== 'aprobado') {
            return NextResponse.json({ 
                error: `Solo se pueden aprobar solicitudes pre-aprobadas o aprobadas directamente. Estado actual: "${solicitud.estado_solicitud}"` 
            }, { status: 400 })
        }

        // Validar saldo después de saber el monto de la solicitud
        if (cuentaSeleccionada && cuentaSeleccionada.saldo < solicitud.monto_solicitado) {
            return NextResponse.json({ 
                error: `Saldo insuficiente en la cuenta "${cuentaSeleccionada.nombre}". Saldo actual: $${cuentaSeleccionada.saldo}. Requerido: $${solicitud.monto_solicitado}` 
            }, { status: 400 })
        }

        let clienteId = solicitud.cliente_id
        let clienteCreado: any = null

        if (!clienteId && solicitud.prospecto_nombres && solicitud.prospecto_dni) {
            // Extraer foto de perfil de los documentos si existe
            let fotoPerfil = null
            if (solicitud.documentos_evaluacion && typeof solicitud.documentos_evaluacion === 'object') {
                const docs = solicitud.documentos_evaluacion as Record<string, string>
                fotoPerfil = docs['foto_cliente'] || null
            }

            // Crear nuevo cliente desde datos de prospecto
            const { data: nuevoCliente, error: clienteError } = await supabaseAdmin
                .from('clientes')
                .insert({
                    nombres: solicitud.prospecto_nombres,
                    dni: solicitud.prospecto_dni,
                    telefono: solicitud.prospecto_telefono || null,
                    direccion: solicitud.prospecto_direccion || null,
                    referencia: solicitud.prospecto_referencia || null,
                    sector_id: (solicitud.documentos_evaluacion as any)?.prospecto_sector_id || null,
                    foto_perfil: fotoPerfil,
                    asesor_id: solicitud.asesor_id,
                    estado: 'activo'
                })
                .select()
                .single()

            if (clienteError) {
                console.error('Error creating cliente:', clienteError)
                return NextResponse.json({ error: 'Error creando cliente: ' + clienteError.message }, { status: 400 })
            }

            clienteId = nuevoCliente.id
            clienteCreado = nuevoCliente

            // Actualizar solicitud con el cliente_id del nuevo cliente
            await supabaseAdmin
                .from('solicitudes')
                .update({ cliente_id: clienteId })
                .eq('id', id)
        }

        // ===== CREAR EL PRÉSTAMO =====
        
        // Calcular fecha fin basado en cuotas y modalidad
        const fechaInicio = new Date(solicitud.fecha_inicio_propuesta)
        let fechaFin = new Date(fechaInicio)
        
        switch (solicitud.modalidad) {
            case 'diario':
                fechaFin.setDate(fechaFin.getDate() + solicitud.cuotas)
                break
            case 'semanal':
                fechaFin.setDate(fechaFin.getDate() + (solicitud.cuotas * 7))
                break
            case 'quincenal':
                fechaFin.setDate(fechaFin.getDate() + (solicitud.cuotas * 15))
                break
            case 'mensual':
                fechaFin.setMonth(fechaFin.getMonth() + solicitud.cuotas)
                break
        }

        // Crear préstamo con trazabilidad completa
        const { data: prestamo, error: prestamoError } = await supabaseAdmin
            .from('prestamos')
            .insert({
                cliente_id: clienteId,
                solicitud_id: id,
                monto: solicitud.monto_solicitado,
                interes: solicitud.interes,
                fecha_inicio: solicitud.fecha_inicio_propuesta,
                fecha_fin: fechaFin.toISOString().split('T')[0],
                frecuencia: solicitud.modalidad,
                cuotas: solicitud.cuotas,
                estado: 'activo',
                estado_mora: 'ok',
                bloqueo_cronograma: false,
                created_by: solicitud.asesor_id
            })
            .select()
            .single()

        if (prestamoError) {
            console.error('Error creating prestamo:', prestamoError)
            // Rollback: si creamos cliente, eliminarlo
            if (clienteCreado) {
                await supabaseAdmin.from('clientes').delete().eq('id', clienteCreado.id)
            }
            return NextResponse.json({ error: prestamoError.message }, { status: 400 })
        }

        // ===== DESEMBOLSAR PRÉSTAMO (Deducir de cartera global) =====
        if (cuentaOrigenId && cuentaSeleccionada) {
            // Actualizar saldo
            await supabaseAdmin
                .from('cuentas_financieras')
                .update({ saldo: cuentaSeleccionada.saldo - solicitud.monto_solicitado })
                .eq('id', cuentaOrigenId)
            
            // Registrar movimiento financiero
            const nombreCliente = solicitud.cliente?.nombres || solicitud.prospecto_nombres || 'Cliente'
            await supabaseAdmin
                .from('movimientos_financieros')
                .insert({
                    cartera_id: cuentaSeleccionada.cartera_id,
                    cuenta_origen_id: cuentaOrigenId,
                    monto: solicitud.monto_solicitado,
                    tipo: 'egreso',
                    descripcion: `Desembolso de préstamo #${prestamo.id.split('-')[0]} - Cliente: ${nombreCliente}`,
                    registrado_por: user.id
                })
        }

        // ===== GENERAR CRONOGRAMA (Centralizado en Node) =====
        const { error: cronogramaError } = await generarCronogramaNode(supabaseAdmin, prestamo.id)
            .then(() => ({ error: null }))
            .catch(err => ({ error: err }));

        if (cronogramaError) {
            console.error('Error generating cronograma:', cronogramaError)
            // Rollback: eliminar préstamo creado
            await supabaseAdmin.from('prestamos').delete().eq('id', prestamo.id)
            return NextResponse.json({ error: 'Error generando cronograma: ' + cronogramaError.message }, { status: 400 })
        }

        // ===== ACTUALIZAR SOLICITUD =====
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('solicitudes')
            .update({
                estado_solicitud: 'aprobado',
                admin_id: user.id,
                fecha_aprobacion: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Error updating solicitud:', updateError)
        }

        // ===== NOTIFICAR AL ASESOR =====
        const nombreClienteNotif = solicitud.cliente?.nombres || solicitud.prospecto_nombres || 'Cliente'
        await createFullNotification(solicitud.asesor_id, {
            titulo: '✅ Solicitud Aprobada',
            mensaje: `La solicitud de ${nombreClienteNotif} ha sido aprobada. Préstamo creado.`,
            link: `/dashboard/prestamos/${prestamo.id}`,
            tipo: 'success'
        })

        // ===== REGISTRAR EN HISTORIAL =====
        await supabaseAdmin.rpc('registrar_cambio_estado', {
            p_prestamo_id: prestamo.id,
            p_estado_anterior: 'nuevo',
            p_estado_nuevo: 'activo',
            p_dias_atraso: 0,
            p_motivo: 'Préstamo creado desde solicitud aprobada',
            p_responsable: user.id
        })

        // ===== AUDITORÍA =====
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'aprobar_solicitud',
            tabla_afectada: 'solicitudes',
            detalle: { 
                solicitud_id: id, 
                prestamo_id: prestamo.id,
                monto: solicitud.monto_solicitado 
            }
        })

        // ===== CREAR TAREA DE EVIDENCIA =====
        await supabaseAdmin.from('tareas_evidencia').insert({
            asesor_id: solicitud.asesor_id,
            prestamo_id: prestamo.id,
            tipo: 'nuevo_prestamo'
        })

        // Notificar sobre la evidencia pendiente (DB + PUSH)
        await createFullNotification(solicitud.asesor_id, {
            titulo: '📷 Evidencia Requerida',
            mensaje: `Se requiere foto de evidencia para el nuevo préstamo de ${nombreClienteNotif}.`,
            link: `/dashboard/tareas?tab=evidencia`,
            tipo: 'warning'
        })

        revalidatePath('/dashboard/solicitudes', 'page')
        revalidatePath('/dashboard/prestamos', 'page')
        revalidatePath('/dashboard', 'layout') // Actualizar contadores globales y notificaciones

        return NextResponse.json({
            solicitud: updated,
            prestamo: prestamo,
            message: 'Solicitud aprobada y préstamo creado exitosamente'
        })

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
