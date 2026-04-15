import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: NextRequest) {
    try {
        const { id, email, password, role, nombre } = await request.json()

        // Validar que el ejecutor tenga rol Admin real comprobando contra DB
        const authCheck = await requireAdmin()
        if ('error' in authCheck) {
            return authCheck.error // Retorna el 401/403 construido
        }
        
        const supabaseAdmin = createAdminClient()

        if (!id) {
            return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 })
        }

        const updates: any = {}
        if (email) updates.email = email
        if (password) updates.password = password
        
        // Update user_metadata if role or name changed
        const metadata: any = {}
        if (role) metadata.rol = role
        if (nombre) metadata.nombre_completo = nombre
        
        if (Object.keys(metadata).length > 0) {
            updates.user_metadata = metadata
        }

        if (Object.keys(updates).length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, updates)
            if (authError) throw authError
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Update auth error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
