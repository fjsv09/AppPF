import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/admin/fix-auditoria — Configurar permisos RLS de auditoría
 * Ejecutar UNA VEZ para asegurar que la tabla permite INSERT y SELECT
 */
export async function GET() {
    const supabaseAdmin = createAdminClient()

    // Test: intentar insertar un registro de prueba con service_role
    const { data, error } = await supabaseAdmin.from('auditoria').insert({
        tabla_afectada: 'test_permisos',
        accion: 'test_rls',
        usuario_id: null,
        registro_id: null,
        detalle: { test: true, timestamp: new Date().toISOString() }
    }).select()

    if (error) {
        return NextResponse.json({ 
            status: 'ERROR', 
            message: 'No se pudo insertar en auditoría',
            error: error.message,
            hint: error.hint,
            code: error.code,
            details: error.details
        }, { status: 500 })
    }

    // Leer para confirmar
    const { data: rows, error: readError } = await supabaseAdmin
        .from('auditoria')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

    return NextResponse.json({
        status: 'OK',
        message: 'Auditoría funciona correctamente',
        insertado: data,
        ultimos_registros: rows,
        lectura_error: readError?.message || null
    })
}
