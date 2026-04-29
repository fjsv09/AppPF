import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { addDays, addWeeks, addMonths } from 'date-fns'
import { checkSystemAccess } from '@/utils/systemRestrictions'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

// Helper for dates - STRICT UTC
function parseUTCDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)) // 00:00:00 UTC
}

function formatUTCDate(date: Date): string {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // 1. Verificar Autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // 2. Verificar Perfil y Rol
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol, nombre_completo')
        .eq('id', user.id)
        .single()
    
    if (!perfil) {
        return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
    }

    // 3. Verificación de Acceso Centralizada
    const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'prestamo')
    if (!access.allowed) {
        return NextResponse.json({ 
            error: access.reason, 
            tipo_error: access.code,
            config: access.config 
        }, { status: 403 })
    }

    const body = await request.json()
    const { cliente_id, monto, interes, fecha_inicio, frecuencia, cuotas, cuenta_id } = body

    if (!cliente_id || !monto || !interes || !fecha_inicio || !frecuencia || !cuotas) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const principal = parseFloat(monto)
    const rate = parseFloat(interes)
    const numCuotas = parseInt(cuotas)
    const freqNormal = frecuencia.toLowerCase().trim()

    // 3.5 Validar Límite de Préstamo del Cliente
    const { data: clientInfo } = await supabaseAdmin
        .from('clientes')
        .select('limite_prestamo')
        .eq('id', cliente_id)
        .single()
    
    const clientLimit = parseFloat(clientInfo?.limite_prestamo || 0)
    if (clientLimit > 0 && principal > clientLimit) {
        return NextResponse.json({ 
            error: `El monto solicitado (S/ ${principal}) excede el límite permitido para este cliente (S/ ${clientLimit}).` 
        }, { status: 400 })
    }

    // 4. Validar Cuenta y Saldo si es creación directa con desembolso
    let cuentaSeleccionada = null
    if (cuenta_id) {
        const { data: cuenta } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuenta_id)
            .single()
        
        if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
        if (cuenta.saldo < principal) {
            return NextResponse.json({ error: `Saldo insuficiente en la cuenta ${cuenta.nombre}` }, { status: 400 })
        }
        cuentaSeleccionada = cuenta
    }

    // 5. Detectar si es un préstamo paralelo
    const { data: prestamoActivo } = await supabaseAdmin
        .from('prestamos')
        .select('id')
        .eq('cliente_id', cliente_id)
        .eq('estado', 'activo')
        .maybeSingle()
    
    const esParalelo = !!prestamoActivo;

    // 6. Generar Cronograma en memoria para validación y cálculo de fecha fin
    const { data: holidaysData } = await supabaseAdmin.from('feriados').select('fecha')
    const holidaysSet = new Set(holidaysData?.map((h: any) => {
        if (typeof h.fecha === 'string') return h.fecha.split('T')[0]
        if (h.fecha instanceof Date) return h.fecha.toISOString().split('T')[0]
        return String(h.fecha)
    }) || [])

    const schedule = []
    let currentDate = parseUTCDate(fecha_inicio)

    // Regla de día libre para cobro diario
    if (freqNormal === 'diario') {
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
    }
    const totalToPay = principal * (1 + (rate / 100))
    const quotaAmount = Math.round((totalToPay / numCuotas) * 100) / 100

    let quotasCount = 0
    let safetyCounter = 0
    while (quotasCount < numCuotas && safetyCounter < 1000) {
        safetyCounter++
        let nextDate = new Date(currentDate)
        
        if (freqNormal === 'diario') nextDate.setUTCDate(nextDate.getUTCDate() + 1)
        else if (freqNormal === 'semanal') nextDate.setUTCDate(nextDate.getUTCDate() + 7)
        else if (freqNormal === 'quincenal') nextDate.setUTCDate(nextDate.getUTCDate() + 14)
        else if (freqNormal === 'mensual') nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)

        let isValidDay = false
        let checkDate = new Date(nextDate)
        let daySafety = 0
        while (!isValidDay && daySafety < 30) {
            daySafety++
            const dayOfWeek = checkDate.getUTCDay()
            const dateStr = formatUTCDate(checkDate)
            if (dayOfWeek === 0 || holidaysSet.has(dateStr)) {
                checkDate.setUTCDate(checkDate.getUTCDate() + 1)
            } else {
                isValidDay = true
            }
        }
        
        schedule.push({
            numero_cuota: quotasCount + 1,
            fecha_vencimiento: formatUTCDate(checkDate),
            monto_cuota: quotaAmount,
            estado: 'pendiente'
        })
        quotasCount++
        currentDate = checkDate
    }

    const formattedEndDate = formatUTCDate(currentDate)

    // 7. CREACIÓN DEL PRÉSTAMO (Sin solicitud_id si es directo)
    const { data: prestamo, error: loanError } = await supabaseAdmin
        .from('prestamos')
        .insert({
            cliente_id,
            monto: principal,
            interes: rate,
            fecha_inicio,
            fecha_fin: formattedEndDate, 
            frecuencia: freqNormal,
            cuotas: numCuotas,
            estado: 'activo',
            created_by: user.id,
            es_paralelo: esParalelo
        })
        .select()
        .single()

    if (loanError) return NextResponse.json({ error: loanError.message }, { status: 500 })

    // 8. Insertar Cronograma
    const scheduleWithId = schedule.map(s => ({ ...s, prestamo_id: prestamo.id }))
    const { error: scheduleError } = await supabaseAdmin.from('cronograma_cuotas').insert(scheduleWithId)
    if (scheduleError) throw scheduleError

    // 9. PROCESAMIENTO CONTABLE (Si se especificó cuenta)
    if (cuentaSeleccionada) {
        // Descontar saldo
        await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: cuentaSeleccionada.saldo - principal })
            .eq('id', cuentaSeleccionada.id)
        
        // Registrar movimiento
        const { data: clientObj } = await supabaseAdmin.from('clientes').select('nombres').eq('id', cliente_id).single()
        await supabaseAdmin
            .from('movimientos_financieros')
            .insert({
                cartera_id: cuentaSeleccionada.cartera_id,
                cuenta_origen_id: cuentaSeleccionada.id,
                monto: principal,
                tipo: 'egreso',
                descripcion: `Desembolso Directo Administrador #${prestamo.id.split('-')[0]} - Cliente: ${clientObj?.nombres || 'Cliente'}`,
                registrado_por: user.id
            })
    }

    // 10. Registrar Historial y Tarea de Evidencia
    await supabaseAdmin.rpc('registrar_cambio_estado', {
        p_prestamo_id: prestamo.id,
        p_estado_anterior: 'nuevo',
        p_estado_nuevo: 'activo',
        p_dias_atraso: 0,
        p_motivo: 'Préstamo creado directamente por Administrador',
        p_responsable: user.id
    })

    const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('nombres, asesor_id')
        .eq('id', cliente_id)
        .single()

    const targetAsesorId = cliente?.asesor_id || user.id

    await supabaseAdmin.from('tareas_evidencia').insert({
        asesor_id: targetAsesorId, 
        prestamo_id: prestamo.id,
        tipo: 'nuevo_prestamo'
    })

    // 11. Notificar al asesor responsable (DB + PUSH)
    if (targetAsesorId) {
        await createFullNotification(targetAsesorId, {
            titulo: '📷 Evidencia Requerida',
            mensaje: `Se requiere foto de evidencia para el nuevo préstamo de ${cliente?.nombres || 'Cliente'}.`,
            link: `/dashboard/tareas?tab=evidencia`,
            tipo: 'warning'
        }).catch(err => console.error('Error enviando notificación:', err))
    }

    // 12. Auditoría
    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'crear_prestamo_directo',
        tabla_afectada: 'prestamos',
        registro_id: prestamo.id,
        detalle: { monto: principal, interes: rate, frecuente: freqNormal, paralelo: esParalelo, cuenta_id }
    })

    return NextResponse.json(prestamo)

  } catch (error: any) {
    console.error('CRITICAL ERROR IN LOAN CREATION:', error)
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
  }
}
