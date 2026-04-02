
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: pagos, error } = await supabase.from('pagos').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
        return;
    }
    if (pagos && pagos.length > 0) {
        console.log('--- COLUMNS ---');
        console.log(Object.keys(pagos[0]));
        console.log('--- METODO PAGO VALUES ---');
        const { data: metodos } = await supabase.from('pagos').select('metodo_pago').limit(100);
        const uniqueMetodos = [...new Set(metodos.map(m => m.metodo_pago))];
        console.log(uniqueMetodos);
    }
}

inspect();
