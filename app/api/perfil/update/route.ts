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
            password,
            current_password
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

        // 5. Actualizar password si se proporcionó (requiere re-autenticación con password actual)
        if (password) {
            if (typeof password !== 'string' || password.length < 8) {
                return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
            }
            if (!current_password || typeof current_password !== 'string') {
                return NextResponse.json({ error: 'Debes proporcionar tu contraseña actual' }, { status: 400 })
            }
            if (!user.email) {
                return NextResponse.json({ error: 'No se puede verificar la cuenta' }, { status: 400 })
            }

            // Verificar el password actual con un cliente fresco para no afectar la sesión actual
            const { createClient: createPlainClient } = await import('@supabase/supabase-js')
            const verifyClient = createPlainClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            )
            const { error: signInError } = await verifyClient.auth.signInWithPassword({
                email: user.email,
                password: current_password
            })
            if (signInError) {
                return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 403 })
            }

            const { error: passwordError } = await adminClient.auth.admin.updateUserById(user.id, {
                password: password
            })
            if (passwordError) throw passwordError

            await adminClient.from('auditoria').insert({
                tabla: 'auth.users',
                accion: 'password_change',
                registro_id: user.id,
                usuario_id: user.id,
                detalles: { source: 'perfil/update' }
            })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error updating profile:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
