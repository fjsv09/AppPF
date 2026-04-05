import { createAdminClient } from './utils/supabase/admin'

async function checkMichel() {
    const supabase = createAdminClient()
    
    // Find Michel
    const { data: profile } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, sueldo_base')
        .ilike('nombre_completo', '%Michel Vargas%')
        .single()
    
    if (!profile) {
        console.log('No profile found')
        return
    }
    
    console.log(`User: ${profile.nombre_completo} (${profile.id})`)
    
    // Check Nomina for April 2026
    const { data: nomina } = await supabase
        .from('nomina_personal')
        .select('*')
        .eq('trabajador_id', profile.id)
        .eq('mes', 4)
        .eq('anio', 2026)
        .single()
    
    console.log('Nomina Active:', nomina)
    
    // Check Asistencia for April 2026
    const { data: asistencia } = await supabase
        .from('asistencia_personal')
        .select('fecha, minutos_tardanza, descuento_tardanza, estado')
        .eq('usuario_id', profile.id)
        .gte('fecha', '2026-04-01')
        .lte('fecha', '2026-04-30')
        .order('fecha', { ascending: true })
    
    console.log('Asistencias (April 2026):')
    console.table(asistencia)
    
    const sumDescuentos = asistencia?.reduce((acc, curr) => acc + (curr.descuento_tardanza || 0), 0)
    console.log(`Sum of discounts: ${sumDescuentos}`)
}

checkMichel()
