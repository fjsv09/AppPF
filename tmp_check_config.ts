
import { createAdminClient } from './utils/supabase/admin';

async function checkConfig() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('configuracion_sistema')
        .select('clave, valor');
    
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

checkConfig();
