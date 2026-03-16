
import { createAdminClient } from './utils/supabase/admin'

async function checkData() {
    const supabase = createAdminClient()
    const { count: clientCount, error: cError } = await supabase.from('clientes').select('*', { count: 'exact', head: true })
    console.log('Total clients:', clientCount)
    if (cError) console.error('Error fetching clients:', cError)

    const { data: perfiles, error: pError } = await supabase.from('perfiles').select('*')
    console.log('Perfiles count:', perfiles?.length)
    if (perfiles) {
        console.log('Roles found:', [...new Set(perfiles.map(p => p.rol))])
        perfiles.forEach(p => {
            console.log(`- ${p.nombre_completo} (${p.rol}) ID: ${p.id}`)
        })
    }
    if (pError) console.error('Error fetching perfiles:', pError)

    const { data: firstClients, error: fcError } = await supabase.from('clientes').select('id, nombres, asesor_id').limit(5)
    console.log('Sample clients:', firstClients)
}

checkData()
