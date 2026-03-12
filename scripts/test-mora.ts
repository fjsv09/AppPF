
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kaxwuclrddyeetflneil.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheHd1Y2xyZGR5ZWV0ZmxuZWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU0OTQwNCwiZXhwIjoyMDg1MTI1NDA0fQ.JWYcCj--X78Hy8CQ2VGvFlDMB4CCLJjn9PjHf8ca0KI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function run() {
  console.log('🤖 --- INICIANDO ROBOT DE MORA MANUAL --- 🤖')
  
  // 1. Ejecutar RPC
  console.log('1. Ejecutando actualización...')
  const { data: result, error } = await supabase.rpc('actualizar_estados_mora')
  
  if (error) {
    console.error('❌ Error RPC:', error)
  } else {
    console.log('✅ Resultado Robot:', result[0] || result)
  }

  // 2. Verificar Préstamos
  console.log('\n2. Verificando préstamos actualizados:')
  const { data: prestamos } = await supabase
    .from('prestamos')
    .select('id, estado, estado_mora, fecha_fin, cliente_id, clientes(nombres)')
    .eq('estado', 'activo')
    .limit(10)

  prestamos?.forEach((p: any) => {
    console.log(`   📝 ID: ${p.id.slice(0,6)}... | Mora: ${p.estado_mora?.toUpperCase()} | Fin: ${p.fecha_fin} | Cliente: ${p.clientes?.nombres}`)
  })
}

run()
