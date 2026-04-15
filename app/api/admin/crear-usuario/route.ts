import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin, createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const { email, password, nombre, rol, supervisor_id, sueldo_base, fecha_nacimiento, fecha_ingreso, frecuencia_pago, dni, direccion } = await request.json()

        // Validate inputs
        if (!email || !password || !nombre || !rol) {
            return NextResponse.json(
                { error: 'Todos los campos son requeridos' },
                { status: 400 }
            )
        }

        // Validate role
        if (!['admin', 'supervisor', 'asesor'].includes(rol)) {
            return NextResponse.json(
                { error: 'Rol inválido' },
                { status: 400 }
            )
        }

        // Validar que el ejecutor tenga rol Admin real comprobando contra DB
        const authCheck = await requireAdmin()
        if ('error' in authCheck) {
            return authCheck.error // Retorna el 401/403 construido
        }

        const supabaseAdmin = createAdminClient()

        // Check if user already exists by email
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(u => u.email === email)

        if (existingUser) {
            return NextResponse.json(
                { error: 'El correo electrónico ya está registrado en el sistema. Use uno diferente o edite el usuario existente.' },
                { status: 400 }
            )
        }

        // Create new user in Supabase Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                nombre_completo: nombre,
                rol: rol
            }
        })

        if (authError) {
            console.error('Auth error:', authError)
            return NextResponse.json(
                { error: authError.message },
                { status: 400 }
            )
        }

        if (!authData.user) {
            return NextResponse.json(
                { error: 'No se pudo crear el usuario' },
                { status: 500 }
            )
        }

        const userId = authData.user.id

        const { error: profileError } = await supabaseAdmin
            .from('perfiles')
            .upsert({
                id: userId,
                rol: rol,
                nombre_completo: nombre,
                supervisor_id: rol === 'asesor' ? supervisor_id || null : null,
                sueldo_base: sueldo_base || 0,
                fecha_nacimiento: fecha_nacimiento || null,
                fecha_ingreso: fecha_ingreso || null,
                frecuencia_pago: frecuencia_pago || 'mensual',
                dni: dni || null,
                direccion: direccion || null
            }, { onConflict: 'id' })

        if (profileError) {
            console.error('Profile error:', profileError)
            return NextResponse.json(
                { error: 'Error al crear perfil: ' + profileError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            user: {
                id: userId,
                email: email,
                nombre: nombre,
                rol: rol
            }
        })

    } catch (error: any) {
        console.error('Create user error:', error)
        return NextResponse.json(
            { error: error.message || 'Error interno del servidor' },
            { status: 500 }
        )
    }
}
