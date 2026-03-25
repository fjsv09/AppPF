import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { addDays, addWeeks, addMonths } from 'date-fns'
import { checkSystemAccess } from '@/utils/systemRestrictions'

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

    // 1. Verify Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Initialize Admin Client for Writes
    const supabaseAdmin = createAdminClient()

    // 2. Verify Role & Access
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()
    
    if (!perfil) {
        return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 })
    }

    const access = await checkSystemAccess(supabaseAdmin, user.id, perfil.rol, 'prestamo')
    if (!access.allowed) {
        return NextResponse.json({ 
            error: access.reason, 
            tipo_error: access.code,
            config: access.config 
        }, { status: 403 })
    }

    const body = await request.json()
    const { cliente_id, monto, interes, fecha_inicio, frecuencia, cuotas } = body

    if (!cliente_id || !monto || !interes || !fecha_inicio || !frecuencia || !cuotas) {
      return NextResponse.json({ error: 'Faltan campos requeridos (frecuencia, cuotas, etc)' }, { status: 400 })
    }

    // [NUEVA LÓGICA] Detectar automáticamente si es un préstamo paralelo
    const { data: prestamoActivo } = await supabaseAdmin
        .from('prestamos')
        .select('id')
        .eq('cliente_id', cliente_id)
        .eq('estado', 'activo')
        .limit(1)
        .maybeSingle()
    
    const esParalelo = !!prestamoActivo;


    const numCuotas = parseInt(cuotas)
    const principal = parseFloat(monto)
    const rate = parseFloat(interes)
    // Normalize frequency
    const freqNormal = frecuencia.toLowerCase().trim()
    
    // 3. Generate Schedule FIRST
    try {
        // Fetch Holidays
        const { data: holidaysData } = await supabaseAdmin
            .from('feriados')
            .select('fecha')
        
        const holidaysSet = new Set(holidaysData?.map((h: any) => h.fecha) || [])

        const schedule = []
        
        // Start from parsed UTC date
        let currentDate = parseUTCDate(fecha_inicio)
        
        // Sim Interest logic
        const totalToPay = principal * (1 + (rate / 100))
        const quotaAmount = Math.round((totalToPay / numCuotas) * 100) / 100

        // Grace Period Rule for Daily: Skip the first day completely ("Day Off")
        // If Start = 28. Grace means "28 is not payment, 29 is not payment (free day?), 30 is payment".
        // Wait, user said "Start 28... Day 29 should be 30".
        // This implies: 28 (Creation), 29 (Free), 30 (Payment).
        
        // Loop logic:
        // We start loop with `currentDate` = 28.
        // Loop 1: nextDate = currentDate + step.
        // If step is 1 day. nextDate = 29.
        // User wants 30.
        // So we need to shift `currentDate` forward by 1 day BEFORE the loop.
        
        if (freqNormal === 'diario') {
             currentDate.setUTCDate(currentDate.getUTCDate() + 1)
        }

        let quotasCount = 0
        let safetyCounter = 0
        const MAX_ITERATIONS = numCuotas * 10 

        while (quotasCount < numCuotas && safetyCounter < MAX_ITERATIONS) {
            safetyCounter++
            
            // Move to next potential date based on frequency
            let nextDate = new Date(currentDate)
            
            if (freqNormal === 'diario') {
                nextDate.setUTCDate(nextDate.getUTCDate() + 1)
            } else if (freqNormal === 'semanal') {
                nextDate.setUTCDate(nextDate.getUTCDate() + 7)
            } else if (freqNormal === 'quincenal') {
                nextDate.setUTCDate(nextDate.getUTCDate() + 14)
            } else if (freqNormal === 'mensual') {
                nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)
            }

            // Validation Logic (Skip Sundays/Holidays)
            let isValidDay = false
            let checkDate = new Date(nextDate)
            
            // Safety break 2
            let daySafety = 0
            while (!isValidDay && daySafety < 30) {
                daySafety++
                const dayOfWeek = checkDate.getUTCDay() // 0 = Sunday
                const dateStr = formatUTCDate(checkDate)
                const isHoliday = holidaysSet.has(dateStr)

                // Skip Sundays OR Holidays
                if (dayOfWeek === 0 || isHoliday) {
                    // For Daily: Add 1 day
                    // For others: usually move to next business day
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
            currentDate = checkDate // Update cursor to the actual payment date so next step is relative to this
        }

        const calculatedEndDate = currentDate
        const formattedEndDate = formatUTCDate(calculatedEndDate)

        // 4. Create Loan
        const { data: prestamo, error: loanError } = await supabaseAdmin
            .from('prestamos')
            .insert({
                cliente_id,
                monto,
                interes,
                fecha_inicio,
                fecha_fin: formattedEndDate, 
                estado: 'activo',
                created_by: user.id,
                es_paralelo: esParalelo
            })
            .select()
            .single()

        if (loanError) {
            return NextResponse.json({ error: loanError.message }, { status: 500 })
        }

        // 5. Insert Schedule
        const scheduleWithId = schedule.map(s => ({ ...s, prestamo_id: prestamo.id }))
        
        const { error: scheduleError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .insert(scheduleWithId)

        if (scheduleError) throw scheduleError

        // 6. Audit
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'crear_prestamo',
            tabla_afectada: 'prestamos',
            registro_id: prestamo.id,
            detalle: { monto, rate, frequency: frecuencia, quotas: numCuotas, generated_end: formattedEndDate }
        })

        return NextResponse.json(prestamo)

    } catch (calcError: any) {
        console.error(calcError)
        return NextResponse.json({ error: 'Calculation error: ' + calcError.message }, { status: 500 })
    }

  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

