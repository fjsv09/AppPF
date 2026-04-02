
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: systemPagos, error } = await supabase
        .from('pagos')
        .select('*')
        .is('registrado_por', null)
        .limit(5);
    
    console.log('--- SYSTEM PAGOS (registrado_por is null) ---');
    console.log(JSON.stringify(systemPagos, null, 2));

    const { data: rolePagos } = await supabase
        .from('pagos')
        .select('*')
        .not('registrado_por', 'is', null)
        .limit(5);

    console.log('--- ROLE PAGOS (registrado_por is not null) ---');
    console.log(JSON.stringify(rolePagos, null, 2));
}

inspect();
