
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kaxwuclrddyeetflneil.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheHd1Y2xyZGR5ZWV0ZmxuZWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU0OTQwNCwiZXhwIjoyMDg1MTI1NDA0fQ.JWYcCj--X78Hy8CQ2VGvFlDMB4CCLJjn9PjHf8ca0KI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function run() {
  console.log('🔎 Verificando estructura de salida del RPC registrar_pago_db...')

  // Necesitamos un ID de cuota válida para probar.
  // Buscamos una cuota pendiente aleatoria.
  const { data: cuota } = await supabase
    .from('cronograma_cuotas')
    .select('id, monto_cuota, prestamo_id')
    .eq('estado', 'pendiente')
    .limit(1)
    .single()

  if (!cuota) {
    console.log('⚠️ No hay cuotas pendientes para probar. Buscando cuota pagada para simular error controlado...')
    // No podemos probar el éxito real sin escribir, pero al menos podemos ver si la función existe y su firma.
    return
  }

  console.log(`🧪 Probando con cuota ID: ${cuota.id} (Monto: ${cuota.monto_cuota})`)
  
  // Llamamos al RPC con ROLLBACK automático (simulamos error intencional para no grabar datos reales si fuera posible, 
  // pero RPCs en Supabase commitean. 
  // MEJOR ESTRATEGIA: Vamos a inspeccionar la definición de la función en la tabla pg_proc.
  
  const { data: procDef, error } = await supabase
    .rpc('get_function_def', { func_name: 'registrar_pago_db' })
    
  // Si no tenemos una función para leer definiciones, intentamos inferir ejecutando un pago falso de 0.01 y luego borrándolo.
  // Pero eso es arriesgado.
  
  // Vamos a intentar hacer un pago minúsculo que luego revertiremos manualmente si es necesario,
  // O mejor, confiamos en lo que ve el usuario.
  
  // Plan B: Ejecutar la query SQL directamente para redefinir la función desde aquí si fuera posible, pero no con cliente JS.
  
  console.log('⚠️ No puedo ejecutar el RPC sin hacer un pago real.')
  console.log('RECOMENDACIÓN: Por favor vuelve a ejecutar el script SQL 20260131_voucher_metrics.sql en tu Supabase SQL Editor.')
  console.log('Asegurate de ver el mensaje "Success" o "Query executed successfully".')
}

run()
