import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
    const { data, error } = await supabaseAdmin
        .from('solicitudes')
        .select(`
            id,
            estado_solicitud,
            cliente:cliente_id(id, nombres, dni),
            asesor:asesor_id(id, nombre_completo)
        `)
        .eq('estado_solicitud', 'pendiente_supervision')

    fs.writeFileSync('output.json', JSON.stringify({data, error}, null, 2))
}
test()
