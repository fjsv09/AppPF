import { createAdminClient } from '../utils/supabase/admin';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    try {
        console.log("Asignando sector por defecto a clientes sin sector...");
        const supabaseAdmin = createAdminClient();

        // 1. Obtener sector por defecto
        const { data: sector, error: sectorErr } = await supabaseAdmin
            .from('sectores')
            .select('id')
            .order('orden', { ascending: true })
            .limit(1)
            .single();

        if (sectorErr) {
            console.error("No se encontró sector:", sectorErr);
            return;
        }

        console.log("Sector encontrado:", sector.id);

        // 2. Obtener clientes con sector_id = null
        const { data: clientesNulos } = await supabaseAdmin
            .from('clientes')
            .select('id')
            .is('sector_id', null);

        if (!clientesNulos || clientesNulos.length === 0) {
            console.log("No hay clientes que necesiten actualización.");
            return;
        }

        const clientesNulosIds = clientesNulos.map(c => c.id);

        // 3. Actualizarlos
        const { error: updateErr } = await supabaseAdmin
            .from('clientes')
            .update({ sector_id: sector.id })
            .in('id', clientesNulosIds);

        if (updateErr) {
            console.error("Error actualizando clientes:", updateErr);
        } else {
            console.log(`Clientes actualizados exitosamente: ${clientesNulosIds.length}`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
