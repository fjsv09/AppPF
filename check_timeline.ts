import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://kaxwuclrddyeetflneil.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheHd1Y2xyZGR5ZWV0ZmxuZWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU0OTQwNCwiZXhwIjoyMDg1MTI1NDA0fQ.JWYcCj--X78Hy8CQ2VGvFlDMB4CCLJjn9PjHf8ca0KI'
)

async function test() {
  const { data: user } = await supabase.from('perfiles').select('id, nombre_completo').eq('rol', 'asesor').limit(1).single()
  console.log(`Timeline for: ${user.nombre_completo}`)

  const { data: cuadres } = await supabase.from('cuadres_diarios').select('created_at, tipo_cuadre, saldo_entregado, estado').eq('asesor_id', user.id).order('created_at', { ascending: false }).limit(5)
  console.log('\n-- Recent Cuadres --')
  console.log(cuadres?.map(c => `${new Date(c.created_at).toLocaleTimeString()} - ${c.tipo_cuadre} - ${c.saldo_entregado} - ${c.estado}`).join('\n'))

  const { data: pagos } = await supabase.from('pagos').select('created_at, monto_pagado').eq('registrado_por', user.id).order('created_at', { ascending: false }).limit(10)
  console.log('\n-- Recent Pagos --')
  console.log(pagos?.map(p => `${new Date(p.created_at).toLocaleTimeString()} - ${p.monto_pagado}`).join('\n'))

  const { data: carteras } = await supabase.from('carteras').select('id').eq('asesor_id', user.id);
  const carteraIds = carteras?.map(c => c.id) || [];
  const { data: cuentas } = await supabase.from('cuentas_financieras').select('saldo').in('cartera_id', carteraIds).eq('tipo', 'cobranzas');
  console.log('\n-- Cuentas (Cobranzas) Saldo --')
  console.log(cuentas)
}
test()
