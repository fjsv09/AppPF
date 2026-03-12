import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || `postgresql://postgres.kaxwuclrddyeetflneil:${encodeURIComponent(process.env.PASSSUPABASE || '')}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString);

async function main() {
    try {
        console.log("Añadiendo columna evidencia_url a solicitudes_renovacion...");
        await sql`
        ALTER TABLE public.solicitudes_renovacion ADD COLUMN IF NOT EXISTS evidencia_url TEXT;
        `;

        console.log("Verificando columnas...");
        const res = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'solicitudes_renovacion' AND column_name = 'evidencia_url'
        `;
        console.log("Columna actual:", res);
        
        console.log("Exitoso");
    } catch (e) {
        console.error("Error SQL:", e);
    } finally {
        await sql.end();
    }
}

main();
