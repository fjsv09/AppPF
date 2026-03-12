import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: q1, error: e1 } = await supabase.rpc('execute_sql', {
        query: `
        CREATE TABLE IF NOT EXISTS public.sectores (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            nombre TEXT NOT NULL,
            orden INTEGER NOT NULL DEFAULT 0,
            activo BOOLEAN NOT NULL DEFAULT true,
            creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE public.sectores ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Lectura publica de sectores" ON public.sectores;
        CREATE POLICY "Lectura publica de sectores" ON public.sectores FOR SELECT USING (true);
        `
    });
    console.log("Creacion de tabla sectores", {q1, e1});

    const { data: q2, error: e2 } = await supabase.rpc('execute_sql', {
        query: `
        ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectores(id) ON DELETE SET NULL;
        `
    });
    console.log("Alta columna sector_id", {q2, e2});
    
    // Validar tabla sectores
    const { data, error } = await supabase.from('sectores').select('*');
    if (error) {
       console.log("Sectores validacion falló", error)
       
       // si fallo intentamos insert simple solo por no dejar (ya que seguro lo anterior fallo por rpc no permitido)
       
    } else {
        if (data.length === 0){
             await supabase.from('sectores').insert([
                {nombre: 'Olmos Centro', orden: 1, activo: true},
                {nombre: 'Cruce', orden: 2, activo: true}
            ]);
        }
        console.log("Sectores insertados/listos", data);
    }
}

check();
