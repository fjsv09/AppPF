'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const PrestamoSchema = z.object({
    cliente_id: z.string().uuid(),
    monto: z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
    interes: z.coerce.number().min(0, 'El interés no puede ser negativo'),
    fecha_inicio: z.string(), // Date string YYYY-MM-DD
    fecha_fin: z.string(),
})

export async function createPrestamo(formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'No autorizado' }
    }

    // Validate fields
    const validatedFields = PrestamoSchema.safeParse({
        cliente_id: formData.get('cliente_id'),
        monto: formData.get('monto'),
        interes: formData.get('interes'),
        fecha_inicio: formData.get('fecha_inicio'),
        fecha_fin: formData.get('fecha_fin'),
    })

    if (!validatedFields.success) {
        return { error: 'Datos inválidos', issues: validatedFields.error.issues }
    }

    const { cliente_id, monto, interes, fecha_inicio, fecha_fin } = validatedFields.data

    const { data, error } = await supabase
        .from('prestamos')
        .insert({
            cliente_id,
            monto,
            interes,
            fecha_inicio,
            fecha_fin,
            estado: 'activo', // Or 'pendiente' if flow requires approval. Req says "Al iniciar... bloqueo=true". Assuming creation = active for now unless "draft" state needed.
            // Rule 207: "Al iniciar un préstamo: bloqueo_cronograma = true".
            // Rule 211: "Solo Admin puede generar cronograma ANTES del inicio". 
            // This implies "Inicio" is a separate step from Creation.
            // So initial state should be 'borrador' or valid 'activo' but unlocked? 
            // Schema has 'activo', 'finalizado', 'renovado', 'anulado'. 
            // Maybe 'activo' starts unlocked?
            // "Solo Admin puede generar cronograma ANTES del inicio". This phrasing suggests "Inicio" matches "Active".
            // So we might need a 'borrador' status in enum if strict?
            // Or simply 'activo' + 'bloqueo_cronograma = false' means "Created but not finalized schedule".
            // Once schedule is generated and confirmed, we set 'bloqueo_cronograma = true'.
            bloqueo_cronograma: false,
            created_by: user.id
        })
        .select()
        .single()

    if (error) {
        return { error: 'Error al crear préstamo: ' + error.message }
    }

    revalidatePath('/dashboard/prestamos')
    return { success: true, id: data.id }
}
