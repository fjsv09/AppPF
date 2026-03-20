import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://kaxwuclrddyeetflneil.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheHd1Y2xyZGR5ZWV0ZmxuZWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU0OTQwNCwiZXhwIjoyMDg1MTI1NDA0fQ.JWYcCj--X78Hy8CQ2VGvFlDMB4CCLJjn9PjHf8ca0KI'
)

async function test() {
  const { data: user } = await supabase.from('perfiles').select('id, nombre_completo').eq('rol', 'asesor').limit(1).single()
  
  if (!user) return console.log('No asesor found')
  console.log(`Testing for asesor: ${user.nombre_completo} (${user.id})`)

  const { data: lastFinal } = await supabase
    .from('cuadres_diarios')
    .select('created_at, saldo_entregado, tipo_cuadre, id, estado, monto_cobrado_efectivo, monto_cobrado_digital')
    .eq('asesor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('Last Cuadres:', lastFinal)

  if (lastFinal && lastFinal.length > 0) {
      const finalCuadre = lastFinal.find(c => c.tipo_cuadre === 'final')
      if (finalCuadre) {
          const tLastFinal = finalCuadre.created_at;
          console.log(`Last final created at: ${tLastFinal}`)

          const { data: carteras } = await supabase.from('carteras').select('id').eq('asesor_id', user.id);
          const carteraIds = carteras?.map(c => c.id) || [];

          const { data: cuentas } = await supabase.from('cuentas_financieras').select('saldo').in('cartera_id', carteraIds).eq('tipo', 'cobranzas');
          const saldoActual = cuentas?.reduce((acc, c) => acc + parseFloat(c.saldo), 0) || 0;
          console.log(`Current Saldo: ${saldoActual}`)

          const { data: pagosPost } = await supabase.from('pagos').select('monto_pagado, created_at').eq('registrado_por', user.id).gte('created_at', tLastFinal);
          const ingresosSince = pagosPost?.reduce((acc, p) => acc + parseFloat(p.monto_pagado), 0) || 0;
          console.log(`Pagos since ${tLastFinal}:`, pagosPost?.length, 'Total:', ingresosSince)

          const { data: gastosPost } = await supabase.from('movimientos_financieros').select('monto').in('cartera_id', carteraIds).eq('tipo', 'egreso').gte('created_at', tLastFinal);
          const gastosSince = gastosPost?.reduce((acc, g) => acc + parseFloat(g.monto), 0) || 0;

          const leftover = saldoActual - ingresosSince + gastosSince;
          console.log(`Leftover: ${leftover}`)
      }
  }

}
test()
