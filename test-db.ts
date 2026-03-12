import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('pagos')
        .select(`
            id,
            registrado_por,
            perfiles (nombres)
        `)
        .limit(5);

    console.log(JSON.stringify({ data, error }, null, 2));
}

check();
