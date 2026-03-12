import postgres from 'postgres';

// Cadena estatica hardcodeada de la ultima salida .env
const connectionString = 'postgresql://postgres.kaxwuclrddyeetflneil:LEfjsv@1/letra@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require';

const sql = postgres(connectionString, {
    max: 1, // Conexion unica
    idle_timeout: 0,
    connect_timeout: 10,
    transform: {
        undefined: null
    }
});

async function main() {
    try {
        console.log("Creando tabla sectores...");
        await sql`
        CREATE TABLE IF NOT EXISTS public.sectores (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nombre TEXT NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0,
            activo BOOLEAN NOT NULL DEFAULT true,
            creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        `;

        await sql`ALTER TABLE public.sectores ENABLE ROW LEVEL SECURITY;`;
        
        console.log("Creando politicas RLS...");
        await sql`DROP POLICY IF EXISTS "Lectura publica de sectores" ON public.sectores;`;
        await sql`CREATE POLICY "Lectura publica de sectores" ON public.sectores FOR SELECT USING (true);`;
        await sql`DROP POLICY IF EXISTS "Admin puede gestionar sectores" ON public.sectores;`;
        await sql`
        CREATE POLICY "Admin puede gestionar sectores" ON public.sectores FOR ALL USING (
            EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin')
        );`;
        
        console.log("Insertando sectores iniciales...");
        await sql`
        INSERT INTO public.sectores (nombre, orden, activo) VALUES
        ('Olmos Centro', 1, true),
        ('Cruce', 2, true)
        ON CONFLICT DO NOTHING;
        `;

        console.log("Añadiendo foranea sector_id a clientes...");
        await sql`
        ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectores(id) ON DELETE SET NULL;
        `;

        console.log("Consultando sectores creados...");
        const res = await sql`SELECT * FROM public.sectores`;
        console.log("Sectores en DB:", res);
        
        console.log("Exitoso");
    } catch (e) {
        console.error("Error SQL:", e);
    } finally {
        await sql.end();
    }
}

main();
