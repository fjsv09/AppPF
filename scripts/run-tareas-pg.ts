import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || `postgresql://postgres.kaxwuclrddyeetflneil:${encodeURIComponent(process.env.PASSSUPABASE || '')}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const sql = postgres(connectionString);

async function main() {
    try {
        console.log("Creando tabla tareas_evidencia...");
        await sql`
        CREATE TABLE IF NOT EXISTS public.tareas_evidencia (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            asesor_id UUID REFERENCES perfiles(id) NOT NULL,
            prestamo_id UUID REFERENCES prestamos(id) NOT NULL,
            tipo TEXT NOT NULL CHECK (tipo IN ('nuevo_prestamo', 'renovacion', 'refinanciacion')),
            estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completada')),
            evidencia_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
            completada_en TIMESTAMP WITH TIME ZONE
        );
        `;

        await sql`ALTER TABLE public.tareas_evidencia ENABLE ROW LEVEL SECURITY;`;

        // Policy for Admin: ALL
        await sql`
            DO $$ BEGIN
                CREATE POLICY "Admins can view all tasks" ON public.tareas_evidencia
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM perfiles WHERE perfiles.id = auth.uid() AND perfiles.rol = 'admin'
                    )
                );
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `;
        
        // Policy for Supervisor: Select their asesores tasks
        await sql`
            DO $$ BEGIN
                CREATE POLICY "Supervisors can view their asesores tasks" ON public.tareas_evidencia
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM perfiles 
                        WHERE perfiles.id = tareas_evidencia.asesor_id 
                        AND perfiles.supervisor_id = auth.uid()
                    )
                );
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `;

        // Policy for Asesor: Own tasks
        await sql`
            DO $$ BEGIN
                CREATE POLICY "Users can manage their own tasks" ON public.tareas_evidencia
                FOR ALL USING (
                    asesor_id = auth.uid()
                ) WITH CHECK (
                    asesor_id = auth.uid()
                );
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `;

        console.log("Verificando tabla...");
        const res = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'tareas_evidencia'
        `;
        console.log("Columnas creadas:", res);
        
        console.log("Tabla tareas_evidencia creada exitosamente.");
    } catch (e) {
        console.error("Error SQL:", e);
    } finally {
        await sql.end();
    }
}

main();
