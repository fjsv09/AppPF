
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  console.log('--- BUSCANDO ASESORES ---')
  const { data: perfiles } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, rol')
    .in('nombre_completo', ['Franklin Ferre', 'Michel Vargas'])
  
  console.log('Perfiles encontrados:', perfiles)

  for (const p of perfiles || []) {
    console.log(`\n--- CUADRES DE ${p.nombre_completo} ---`)
    const { data: cuadres } = await supabase
      .from('cuadres_diarios')
      .select('id, fecha, tipo_cuadre, estado, created_at')
      .eq('asesor_id', p.id)
      .order('created_at', { ascending: false })
      .limit(5)
    
    console.log('Cuadres:', cuadres)
  }
}

check().catch(console.error)
