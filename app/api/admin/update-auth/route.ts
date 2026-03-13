import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

export async function POST(request: NextRequest) {
    try {
        const { id, email, password, role } = await request.json()

        if (!id) {
            return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 })
        }

        const updates: any = {}
        if (email) updates.email = email
        if (password) updates.password = password
        if (role) updates.user_metadata = { rol: role }

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
