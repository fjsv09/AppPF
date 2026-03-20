import { createClient } from './utils/supabase/server'
import { createAdminClient } from './utils/supabase/admin'

async function checkProc() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_function_definition', { p_name: 'aprobar_cuadre_db' })
  if (error) {
    console.error('Error fetching RPC:', error)
    // Try raw SQL if RPC doesn't exist
    const { data: dataRaw, error: errorRaw } = await supabase.from('pg_proc').select('prosrc').eq('proname', 'aprobar_cuadre_db').single()
    if (errorRaw) {
        console.error('Error with raw SQL:', errorRaw)
    } else {
        console.log('--- aprobar_cuadre_db Source ---')
        console.log(dataRaw.prosrc)
    }
  } else {
    console.log('--- aprobar_cuadre_db Source (via RPC) ---')
    console.log(data)
  }
}

// Since I probably don't have get_function_definition RPC, I'll use raw SQL via a known RPC or just try to find it in the files again.
// Wait, I can use views like pg_proc if the user has a tool for it.
// Actually, I'll just check if there is any other .sql file that I missed.
checkProc()
