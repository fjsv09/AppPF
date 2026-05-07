import { unstable_cache, revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

const CONFIG_TAG = 'configuracion_sistema'
const CONFIG_REVALIDATE_SECONDS = 120 // 2 minutos

/**
 * Cliente admin local — evita importar @/utils/supabase/admin (que arrastra
 * next/headers vía server.ts y rompe componentes cliente que dependen
 * indirectamente de este caché).
 */
function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

/**
 * Cargar TODA la configuración del sistema una sola vez y cachearla.
 * El caché se invalida con invalidateConfigCache() cuando se actualiza la config.
 */
export const getSystemConfig = unstable_cache(
    async (): Promise<Record<string, string>> => {
        const supabaseAdmin = getAdminClient()
        const { data } = await supabaseAdmin
            .from('configuracion_sistema')
            .select('clave, valor')

        return (data || []).reduce((acc: Record<string, string>, row: any) => {
            acc[row.clave] = row.valor
            return acc
        }, {})
    },
    ['system-config-all'],
    {
        tags: [CONFIG_TAG],
        revalidate: CONFIG_REVALIDATE_SECONDS,
    }
)

/**
 * Helper para obtener un subset de claves específicas del caché
 */
export async function getConfigKeys(keys: string[]): Promise<Record<string, string>> {
    const all = await getSystemConfig()
    return keys.reduce((acc, key) => {
        if (all[key] !== undefined) acc[key] = all[key]
        return acc
    }, {} as Record<string, string>)
}

/**
 * Invalidar caché cuando se actualice la configuración (PATCH /api/configuracion)
 */
export function invalidateConfigCache() {
    revalidateTag(CONFIG_TAG)
}
