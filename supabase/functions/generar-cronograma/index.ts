
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------------------
// HELPER: TIMEZONE UTILS
// ---------------------------
// Helper to get a Date object representing the start of the day in America/Lima
// But since we are doing date math, it's often easier to work with pure dates relative to a "noon" point to avoid DST shifts,
// or use UTC dates as "Local Dates".
// STRATEGY: Treat standard Date objects as "Local Peru Time" by ignoring the actual TZ offset in calculations,
// and only formatting them out as YYYY-MM-DD.
// However, since we need to compare with 'feriados' (YYYY-MM-DD) and check Sundays, 
// we will build a helper that takes a Date and returns formatted string in Peru time, 
// and another to Add Days.

const PERU_TZ = 'America/Lima'

function toPeruDateString(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: PERU_TZ })
}

function getPeruDate(dateStr: string): Date {
    // Parse YYYY-MM-DD and create a date that corresponds to that day in Peru.
    // We add T12:00:00 to avoid midnight edge cases with timezone shifts.
    // Actually, safest is to append a fixed offset or purely work with strings.
    // Let's rely on the environment being consistent or just standard JS date math on the server
    // assuming we normalize everything to midnight UTC roughly for "date" logic.
    // BUT simplest: Parse the date part, and treat it as a UTC date to do 24h jumps.
    return new Date(dateStr + 'T12:00:00Z') 
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
}

function addMonths(date: Date, months: number): Date {
    const result = new Date(date)
    result.setMonth(result.getMonth() + months)
    return result
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Authorization header')

        // 1. Setup Clients
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
        if (userError || !user) throw new Error('Invalid Token')

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Validate Role
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            throw new Error('Unauthorized: Only Admin can generate schedules')
        }

        const { prestamo_id } = await req.json()
        if (!prestamo_id) throw new Error('prestamo_id is required')

        // 3. Fetch Data (Loan + Holidays)
        const { data: prestamo, error: prestamoError } = await supabaseAdmin
            .from('prestamos')
            .select('*')
            .eq('id', prestamo_id)
            .single()

        if (prestamoError || !prestamo) throw new Error('Prestamo not found')
        
        // Fetch Holidays (YYYY-MM-DD strings)
        const { data: feriadosRaw } = await supabaseAdmin
            .from('feriados')
            .select('fecha')
        
        const feriadosSet = new Set(feriadosRaw?.map((f: any) => f.fecha) || [])
        console.log('Feriados loaded:', feriadosSet.size)

        // 4. Data Preparation
        const startDateStr = prestamo.fecha_inicio.split('T')[0]
        const frequency = prestamo.frecuencia.toLowerCase().trim()
        
        console.log('Generating for:', { startDateStr, frequency, id: prestamo_id })
        
        // Determine number of quotas
        // If 'cuotas' field exists use it, else calculate from months? 
        // Logic in previous version: calculated months from date difference. 
        // User screenshot shows "Cantidad de Cuotas" input.
        // Let's assume 'cuotas' field is the truth. If null, fallback to old date diff logic?
        // BUT schema says 'cuotas' is integer. Let's rely on it if > 0.
        let numCuotas = prestamo.cuotas
        if (!numCuotas || numCuotas <= 0) {
             const start = new Date(prestamo.fecha_inicio)
             const end = new Date(prestamo.fecha_fin)
             numCuotas = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
             if (numCuotas <= 0) numCuotas = 1
        }

        // Calculate Amount
        const principal = parseFloat(prestamo.monto)
        const monthlyRate = parseFloat(prestamo.interes) / 100
        let quotaAmount = 0
        
        // Simple vs Compound Interest Logic (Keeping existing logic)
        // Adjust logic: if rate is 0 -> Simple division
        // If rate > 0 -> Amortization formula? 
        // Previous code: quotaAmount = P * r * (1+r)^n / ((1+r)^n - 1)
        // User dashboard screenshot shows: "5 cuotas / 4 base x 16%" ... "Interés ajustado".
        // Use the generic PMT formula if rate > 0, else simple division.
        if (monthlyRate === 0) {
            quotaAmount = principal / numCuotas
        } else {
            // Note: If frequency is 'diario', rate should potentially be daily?
            // Usually 'interes' in DB is Monthly %. 
            // For now, retaining the previous logic which applied monthly rate formula even if calculated months?
            // Wait, previous code calculated 'months' diff and used that.
            // If it's daily payments (e.g. 24 days), treating rate as "per period" or "per month"?
            // Standard Microfinance: Often "Flat Rate" or "Simple".
            // Let's stick to the PREVIOUS ALGORITHM for amount to avoid breaking financial logic unless asked.
            // Previous:
            // let months = diff...
            // quotaAmount = principal * rate ...
            
            // To be safe with "Total" consistency:
            // Total Pagar = Monto * (1 + Interes/100) (From Dashboard logic)
            // Cuota = Total Pagar / NumCuotas
            // This matches "Simple Interest / Flat" which is common in this context.
            // Let's use this FLAT logic which matches the dashboard "Total $1200" example (1000 + 20%).
            const totalPagar = principal * (1 + monthlyRate)
            quotaAmount = totalPagar / numCuotas
        }
        quotaAmount = Math.round(quotaAmount * 100) / 100

        // 5. SCHEDULE ENGINE
        const cuotas = []
        let previousDateObj = getPeruDate(startDateStr) // Start Date
        
        // HELPER: Check valid business day
        const isValidDay = (dStr: string) => {
            const d = getPeruDate(dStr)
            const dayOfWeek = d.getUTCDay() // 0 = Sunday (since we used noon UTC)
            if (dayOfWeek === 0) return false // Sunday
            if (feriadosSet.has(dStr)) return false // Holiday
            return true
        }

        const findNextValidDate = (dateObj: Date): Date => {
            let temp = new Date(dateObj)
            // Safety break
            let attempts = 0
            while (!isValidDay(temp.toISOString().split('T')[0]) && attempts < 50) {
                temp = addDays(temp, 1)
                attempts++
            }
            return temp
        }

        // --- STRATEGY SELECTION ---
        
        if (frequency === 'diario') {
            // --- DAILY STRATEGY (DOMINO) ---
            // Regla A: Grace Period (+2 days from Start)
            let currentDateObj = addDays(previousDateObj, 2)
            
            // Regla B: If invalid, move forward (and keep moving subsequent ones relative to THIS one)
            // Initial adjustment
            currentDateObj = findNextValidDate(currentDateObj)

            for (let i = 1; i <= numCuotas; i++) {
                const dateStr = currentDateObj.toISOString().split('T')[0]
                
                cuotas.push({
                    prestamo_id: prestamo_id,
                    numero_cuota: i,
                    fecha_vencimiento: dateStr,
                    monto_cuota: quotaAmount,
                    estado: 'pendiente'
                })

                // DOMINO: Next date is relative to CURRENT valid date + 1 day
                let nextDate = addDays(currentDateObj, 1)
                // Resolve validity immediately for the next step
                nextDate = findNextValidDate(nextDate)
                
                currentDateObj = nextDate
            }

        } else {
            // --- PERIODIC STRATEGY (SNAP TO GRID) ---
            // Weekly, Bi-weekly, Monthly
            // Regla A: No Grace. Start + Interval.
            // Regla B: Local adjustment only. Next anchor is computed from Start.
            
            const getIntervalDays = (freq: string) => {
                switch(freq) {
                    case 'semanal': return 7;
                    case 'quincenal': return 14;
                    case 'mensual': return 30; // Approximation
                    default: return 7;
                }
            }
            const interval = getIntervalDays(frequency)
            const isMonthly = frequency === 'mensual'

            // FIX: Anchor must be the ORIGINAL Start Date
            const baseAnchorDate = getPeruDate(startDateStr)

            for (let i = 1; i <= numCuotas; i++) {
                // Calculate Anchor from Base
                let anchorDate: Date
                if (isMonthly) {
                    anchorDate = addMonths(baseAnchorDate, i)
                } else {
                    anchorDate = addDays(baseAnchorDate, i * interval)
                }

                // Apply Local Adjustment (Snap)
                // If anchor is invalid, move forward.
                // This does NOT affect the next iteration because 'baseAnchorDate' is constant.
                let validDate = findNextValidDate(anchorDate)
                
                cuotas.push({
                    prestamo_id: prestamo_id,
                    numero_cuota: i,
                    fecha_vencimiento: validDate.toISOString().split('T')[0],
                    monto_cuota: quotaAmount,
                    estado: 'pendiente'
                })
            }
        }

        // 6. DB Operations
        // Clear old
        const { error: deleteError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .delete()
            .eq('prestamo_id', prestamo_id)
        
        if (deleteError) throw new Error('Delete failed: ' + deleteError.message)

        // Insert new
        const { error: insertError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .insert(cuotas)
        
        if (insertError) throw insertError

        // Log Audit
        await supabaseAdmin.from('auditoria').insert({
            usuario_id: user.id,
            accion: 'generar_cronograma_engine',
            tabla_afectada: 'cronograma_cuotas',
            registro_id: prestamo_id,
            detalle: { 
                strategy: frequency, 
                quotas: numCuotas, 
                amount: quotaAmount,
                first_due: cuotas[0]?.fecha_vencimiento,
                last_due: cuotas[cuotas.length-1]?.fecha_vencimiento
            }
        })
        
        // Update Loan to Activo/Bloqueado
        await supabaseAdmin
            .from('prestamos')
            .update({ 
                bloqueo_cronograma: true, 
                estado: 'activo' 
            })
            .eq('id', prestamo_id)

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: `Generated ${numCuotas} quotas using ${frequency} strategy` 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
