
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: pagos, error } = await supabase.from('pagos').select('*').limit(3);
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('--- PAGOS SAMPLE ---');
    console.log(JSON.stringify(pagos, null, 2));
}

inspect();
