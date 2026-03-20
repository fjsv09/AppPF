
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function test() {
  const { data, error } = await supabase
    .from('carteras')
    .select(`
      *,
      perfiles (nombre_completo),
      cuentas_financieras (count)
    `)
  
  if (error) {
    console.error('Error fetching carteras:', error)
  } else {
    console.log('Carteras found:', data)
  }
}

test()
