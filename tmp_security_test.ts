
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrlValue = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKeyValue = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const criticalTables = [
    'clientes', 
    'prestamos', 
    'pagos', 
    'perfiles', 
    'cuadres_diarios', 
    'movimientos_financieros', 
    'configuracion_sistema'
];

async function checkRLS() {
    console.log('\n--- 🛡️ RE-AUDITORÍA DE SEGURIDAD (POST-SCRIPT) ---');
    console.log('Validando protección de datos anónimos...\n');
    
    const anonClient = createClient(supabaseUrlValue, anonKeyValue);

    for (const table of criticalTables) {
        try {
            const { data, error } = await anonClient.from(table).select('*').limit(3);
            
            if (error) {
                if (error.code === '42501') {
                    console.log(`✅ ${table.padEnd(25)}: [PROTEGIDA] RLS Bloqueando Acceso Anónimo`);
                } else {
                    console.log(`⚠️ ${table.padEnd(25)}: [WARNING] Error de consulta: ${error.message} (${error.code})`);
                }
            } else if (data && data.length > 0) {
                if (table === 'configuracion_sistema') {
                    console.log(`ℹ️ ${table.padEnd(25)}: [PERMISIVA POR DISEÑO] Visible públicamente para el Login.`);
                } else {
                    console.error(`❌ ${table.padEnd(25)}: [VULNERABLE] ¡PUEDO LEER ${data.length} REGISTROS SIN LOGIN!`);
                }
            } else {
                console.log(`✅ ${table.padEnd(25)}: [PROTEGIDA] RLS Activa (No se ven datos anónimos)`);
            }
        } catch (e: any) {
            console.error(`💥 ${table.padEnd(25)}: [EXCEPCIÓN] ${e.message}`);
        }
    }
    console.log('\n--- 🔌 FIN DE AUDITORÍA ---');
}

checkRLS();
