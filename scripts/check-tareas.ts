import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
    const { data: tareas, error } = await supabase.from('tareas_evidencia').select('*')
    console.log("Tareas creadas:", tareas)
    if (error) console.error("Error:", error)
}

check()
