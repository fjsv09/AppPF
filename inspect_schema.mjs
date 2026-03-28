import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: carteras } = await supabase.from('carteras').select('*').limit(1);
    console.log('--- CARTERAS ---');
    console.log(carteras?.[0] || 'No records');

    const { data: perfiles } = await supabase.from('perfiles').select('*').limit(1);
    console.log('--- PERFILES ---');
    console.log(perfiles?.[0] || 'No records');
}

inspect();
