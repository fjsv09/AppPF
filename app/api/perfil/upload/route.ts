import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const adminClient = createAdminClient()
        
        // 1. Verificar autenticación
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // 2. Obtener archivo del FormData
        const formData = await request.formData()
        const file = formData.get('file') as File
        
        if (!file) {
            return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 })
        }

        // 3. Validaciones básicas
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Tipo de archivo no permitido (solo JPG, PNG, WEBP)' }, { status: 400 })
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB
            return NextResponse.json({ error: 'El archivo es demasiado grande (máx 2MB)' }, { status: 400 })
        }

        // 4. Preparar subida
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}_${Date.now()}.${fileExt}`
        const filePath = `${fileName}`

        // Convertir File a Buffer para la subida
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 5. Subir usando Admin Client para bypass RLS
        const { error: uploadError } = await adminClient.storage
            .from('perfiles')
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: true
            })

        if (uploadError) {
            console.error('Storage error:', uploadError)
            throw uploadError
        }

        // 6. Obtener URL pública
        const { data: { publicUrl } } = adminClient.storage
            .from('perfiles')
            .getPublicUrl(filePath)

        return NextResponse.json({ 
            success: true, 
            publicUrl 
        })

    } catch (error: any) {
        console.error('Error in upload route:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
