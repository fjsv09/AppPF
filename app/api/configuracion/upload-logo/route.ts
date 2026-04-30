import { createAdminClient, requireAdmin } from '@/utils/supabase/admin'
import { detectImageType } from '@/utils/supabase/image-validation'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const guard = await requireAdmin()
    if ('error' in guard) return guard.error

    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        if (!file) {
            return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
        }

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'El archivo es demasiado grande (máx 5MB)' }, { status: 400 })
        }

        // Validar magic bytes (no confiar en el Content-Type del cliente)
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const detectedType = detectImageType(buffer)
        if (!detectedType) {
            return NextResponse.json({ error: 'Tipo de archivo no permitido (solo JPG, PNG, WEBP)' }, { status: 400 })
        }

        const extByType: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        }
        const filePath = `logo_sistema.${extByType[detectedType]}`

        const supabaseAdmin = createAdminClient()
        const { error: uploadError } = await supabaseAdmin.storage
            .from('avatares')
            .upload(filePath, buffer, {
                cacheControl: '0',
                upsert: true,
                contentType: detectedType
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
