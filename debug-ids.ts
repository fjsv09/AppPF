
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function run() {
  const { data: p, error } = await supabase.from('perfiles').select('*').limit(1)
  if (error) console.error(error)
  else console.log('PERFIL COLUMNS:', Object.keys(p[0]))
}

run()
