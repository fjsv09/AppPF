import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function test() {
  const { data, error } = await supabase.from('perfiles').select('*').limit(1)
  console.log('perfiles:', data ? Object.keys(data[0]) : error)

  const { data: configData, error: configError } = await supabase.from('configuracion_sistema').select('*')
  console.log('configuracion_sistema keys:', configData ? configData.map(c => c.clave) : configError)
}

test()
