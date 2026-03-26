
import { createAdminClient } from './utils/supabase/admin';

async function checkCuadres() {
    const supabase = createAdminClient();
    const todayStr = '2026-03-24'
    const { data, error } = await supabase
        .from('cuadres_diarios')
        .select('id, asesor_id, fecha, tipo_cuadre, estado')
        .eq('fecha', todayStr)
        .eq('tipo_cuadre', 'parcial');
    
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

checkCuadres();
