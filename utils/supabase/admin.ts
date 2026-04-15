import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export function createAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}

/**
 * Verifica si el usuario actual que invoca la API tiene un rol válido.
 * Utiliza SSR de lectura para asegurar que la cookie corresponde genuinamente.
 */
export async function requireRole(allowedRoles: string[]): Promise<{ error: NextResponse } | { user: any; perfil: any }> {
    const supabase = await createServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { error: NextResponse.json({ error: 'No autorizado / No autenticado' }, { status: 401 }) }
    }

    // Leemos la DB con el admin client temporalmente SOLO para consultar su perfil de forma blindada
    const adminClient = createAdminClient()
    const { data: perfil, error: perfilError } = await adminClient
        .from('perfiles')
        .select('rol, supervisor_id')
        .eq('id', user.id)
        .single()

    if (perfilError || !perfil) {
        return { error: NextResponse.json({ error: 'No se pudo verificar la identidad y rol del usuario.' }, { status: 403 }) }
    }

    if (!allowedRoles.includes(perfil.rol)) {
        return { error: NextResponse.json({ error: `Acceso Denegado. Se requiere ser: ${allowedRoles.join(' o ')}.` }, { status: 403 }) }
    }

    return { user, perfil }
}

/**
 * Exclusivo para administradores
 */
export async function requireAdmin(): Promise<{ error: NextResponse } | { user: any; perfil: any }> {
    return await requireRole(['admin'])
}
