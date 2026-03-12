// Script para aplicar la migración de arreglo de RLS
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixPerfilesRLS() {
    console.log('🔧 Arreglando políticas RLS de perfiles...')
    
    const sql = `
-- Eliminar políticas existentes que causan recursión
DROP POLICY IF EXISTS "Users can view own profile" ON public.perfiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.perfiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.perfiles;
DROP POLICY IF EXISTS "Supervisors can view their asesores" ON public.perfiles;

-- Crear políticas seguras sin recursión
CREATE POLICY "Ver propio perfil"
    ON public.perfiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Actualizar propio perfil"
    ON public.perfiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Crear propio perfil"
    ON public.perfiles FOR INSERT
    WITH CHECK (id = auth.uid());
`

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
    
    if (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
    
    console.log('✅ Políticas RLS actualizadas exitosamente')
}

fixPerfilesRLS()
