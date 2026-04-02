
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getExample() {
  const { data: prestamo, error: pError } = await supabase
    .from('prestamos')
    .select('id, cliente:cliente_id(nombres), monto, interes, estado_mora, fecha_fin')
    .neq('estado_mora', 'ok')
    .eq('estado', 'activo')
    .limit(1)
    .single()

  if (pError || !prestamo) {
    console.log('No se encontró un préstamo con mora activa.')
    return
  }

  const { data: cuotas, error: cError } = await supabase
    .from('cronograma_cuotas')
    .select('fecha_vencimiento, monto_cuota, monto_pagado, estado')
    .eq('prestamo_id', prestamo.id)
    .order('fecha_vencimiento', { ascending: true })

  if (cError) {
    console.error('Error al traer cuotas:', cError)
    return
  }

  const hoy = new Date()
  const cuotasVencidas = cuotas?.filter(c => 
    new Date(c.fecha_vencimiento) <= hoy && 
    (c.monto_pagado || 0) < (c.monto_cuota - 0.5)
  ) || []

  const capitalVencido = cuotasVencidas.reduce((acc, c) => {
    const pendiente = (c.monto_cuota - (c.monto_pagado || 0))
    const ratioCapital = 1 / (1 + (parseFloat(prestamo.interes as any) / 100))
    return acc + (pendiente * ratioCapital)
  }, 0)

  console.log(JSON.stringify({
    prestamo,
    cuotasTotal: cuotas?.length,
    cuotasVencidasCount: cuotasVencidas.length,
    capitalVencido,
    deudaTotal: cuotas?.reduce((acc, c) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0)
  }, null, 2))
}

getExample().catch(console.error)
