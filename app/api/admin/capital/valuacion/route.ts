import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'
import { addMonths, isBefore, addDays, startOfDay, format } from 'date-fns'
import { createFullNotification } from '@/services/notification-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if ('error' in guard) return guard.error

  try {
    const adminClient = createAdminClient()

    // 2. Calcular Capital en Calle (con interés)
    const { data: cuotasPendientes } = await adminClient
      .from('cronograma_cuotas')
      .select('monto_cuota, monto_pagado, prestamos!inner(estado)')
      .in('prestamos.estado', ['activo', 'vencido', 'moroso', 'cpp'])
      .neq('estado', 'pagado')

    const capitalEnCalle = cuotasPendientes?.reduce((acc, c) => {
      const pendiente = parseFloat(c.monto_cuota) - (parseFloat(c.monto_pagado) || 0)
      return acc + (pendiente > 0 ? pendiente : 0)
    }, 0) || 0

    // 3. Obtener Saldo en Cuentas
    const { data: accounts } = await adminClient.from('cuentas_financieras').select('saldo')
    const saldoCuentas = accounts?.reduce((acc, a) => acc + parseFloat(a.saldo), 0) || 0

    // 4. Obtener Deuda a Inversionistas (Pasivo) y Alertas de Pago
    const { data: inversionistas } = await adminClient.from('inversionistas').select('*').eq('estado', 'activo')
    const pasivoInversionistas = inversionistas?.reduce((acc, inv) => acc + parseFloat(inv.capital_total), 0) || 0

    // 5. Alertas de Pago
    const alerts: any[] = []
    const today = startOfDay(new Date())
    const alertThreshold = addDays(today, 3)

    if (inversionistas) {
        for (const inv of inversionistas) {
            // Skip 0% interest loans - they have no interest payment obligations
            if (parseFloat(inv.tasa_interes_mensual) === 0 || inv.frecuencia_pago === 'no_aplica') continue

            // Buscar último pago de interés
            const { data: lastTx } = await adminClient
                .from('transacciones_capital')
                .select('created_at')
                .eq('entidad_id', inv.id)
                .eq('tipo', 'pago_interes')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            const monthsToAdd = inv.frecuencia_pago === 'trimestral' ? 3 : inv.frecuencia_pago === 'bimestral' ? 2 : 1
            const baseDate = lastTx ? new Date(lastTx.created_at) : new Date(inv.fecha_inicio)
            const nextPagoDate = startOfDay(addMonths(baseDate, monthsToAdd))

            if (isBefore(nextPagoDate, alertThreshold)) {
                const montoInteres = parseFloat(inv.capital_total) * (parseFloat(inv.tasa_interes_mensual) / 100) * monthsToAdd
                
                alerts.push({
                    inversionista_id: inv.id,
                    nombre: inv.nombre,
                    fecha_pago: nextPagoDate,
                    monto_estimado: montoInteres,
                    vencido: isBefore(nextPagoDate, today)
                })

                // Si es HOY y no hemos enviado notificación, podríamos dispararla aquí
                // Para evitar spam, esta lógica debería estar en un cron, 
                // pero como fallback podemos usar un flag en la DB 'ultima_notificacion_pago'.
            }
        }
    }

    // 6. Patrimonio Neto
    const patrimonioNeto = (capitalEnCalle + saldoCuentas) - pasivoInversionistas

    // 7. Participación de Socios
    const { data: socios } = await adminClient.from('socios').select('*')
    const participacionSocios = socios?.map(socio => ({
        ...socio,
        valor_actual: (patrimonioNeto * (parseFloat(socio.porcentaje_participacion) / 100))
    })) || []

    return NextResponse.json({
        metricas: {
            capital_en_calle: capitalEnCalle,
            saldo_cuentas: saldoCuentas,
            pasivo_inversionistas: pasivoInversionistas,
            patrimonio_neto: patrimonioNeto
        },
        socios: participacionSocios,
        alertas_pagos: alerts
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
