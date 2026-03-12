import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || `postgresql://postgres.kaxwuclrddyeetflneil:${encodeURIComponent(process.env.PASSSUPABASE || '')}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString);

async function main() {
    try {
        console.log("Añadiendo columna excepcion_voucher a clientes...");
        await sql`
        ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS excepcion_voucher BOOLEAN DEFAULT false;
        `;

        console.log("Verificando columnas...");
        const res = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'excepcion_voucher'
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
