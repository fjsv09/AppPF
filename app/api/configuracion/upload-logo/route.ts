import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        // Verificar que sea admin
        const { data: perfil } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File
        if (!file) {
            return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
        }

        // 2. Subir el nuevo logo con un nombre fijo en la raíz del bucket con el CLIENTE ADMIN
        const supabaseAdmin = createAdminClient()
        const filePath = `logo_sistema.png`

        // El admin client se salta las políticas de RLS
        const { data, error: uploadError } = await supabaseAdmin.storage
            .from('avatares')
            .upload(filePath, file, {
                cacheControl: '0',
                upsert: true
            })

        if (uploadError) {
            console.error('Error uploading logo via Admin:', uploadError)
            return NextResponse.json({ error: uploadError.message }, { status: 500 })
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('avatares')
            .getPublicUrl(filePath)

        return NextResponse.json({ 
            success: true, 
            publicUrl: `${publicUrl}?t=${Date.now()}` 
        })
    } catch (error: any) {
        console.error('Error in /api/configuracion/upload-logo:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
