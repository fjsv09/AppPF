import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const adminClient = createAdminClient()
        
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const body = await request.json()
        const { 
            nombre_completo, 
            dni, 
            fecha_ingreso, 
            fecha_nacimiento, 
            direccion, 
            avatar_url,
            password
        } = body

        // 1. Obtener perfil actual
        const { data: perfil, error: perfilError } = await adminClient
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .single()

        if (perfilError || !perfil) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
        }

        const isAdmin = perfil.rol === 'admin'

        // 2. Validar permiso de edición (si no es admin)
        if (!isAdmin) {
            if (!perfil.can_edit_profile || perfil.has_edited_profile) {
                return NextResponse.json({ 
                    error: 'Tu perfil está bloqueado para edición. Contacta a un administrador.' 
                }, { status: 403 })
            }
        }

        // 3. Preparar actualizaciones de perfil
        const profileUpdates: any = {
            nombre_completo,
            dni,
            fecha_ingreso,
            fecha_nacimiento,
            direccion,
            avatar_url
        }

        // Si no es admin, marcamos como editado y bloqueamos
        if (!isAdmin) {
            profileUpdates.has_edited_profile = true
            profileUpdates.can_edit_profile = false
        }

        // 4. Actualizar tabla perfiles
        const { error: updateError } = await adminClient
            .from('perfiles')
            .update(profileUpdates)
            .eq('id', user.id)

        if (updateError) throw updateError

        // 5. Actualizar password si se proporcionó
        if (password) {
            const { error: passwordError } = await adminClient.auth.admin.updateUserById(user.id, {
                password: password
            })
            if (passwordError) throw passwordError
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error updating profile:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
