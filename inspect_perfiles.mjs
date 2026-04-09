import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data: perfiles, error } = await supabase.from('perfiles').select('*').limit(1);
    if (error) {
        console.error('Error fetching perfiles:', error);
        return;
    }
    console.log('--- PERFILES ---');
    console.log(JSON.stringify(perfiles?.[0] || 'No records', null, 2));
}

inspect();
