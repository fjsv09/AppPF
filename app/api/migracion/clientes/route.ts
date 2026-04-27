import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/migracion/clientes
 * Importación masiva de clientes del sistema anterior.
 * Solo crea prospectos (solicitudes) y clientes. NO crea préstamos ni desembolsa.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // 1. Verificar rol admin
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo administradores pueden realizar migraciones' }, { status: 403 })
        }

        const { clients } = await request.json()
        if (!clients || !Array.isArray(clients) || clients.length === 0) {
            return NextResponse.json({ error: 'Datos incompletos: Se requiere lista de clientes' }, { status: 400 })
        }

        const results = {
            total: clients.length,
            success: 0,
            skipped: 0,
            skippedData: [] as any[],
            errors: [] as string[]
        }

        // Precargar datos de referencia
        const { data: sectores } = await supabaseAdmin.from('sectores').select('id, nombre')
        const sectorMap = new Map(sectores?.map((s: any) => [s.nombre.toLowerCase().trim(), s.id]) || [])

        const { data: perfilesData } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .eq('activo', true)
        const perfilMap = new Map(perfilesData?.map((p: any) => [p.nombre_completo.toLowerCase().trim(), p.id]) || [])

        // 3. Procesar cada fila
        for (const c of clients) {
            try {
                // a. Validar campos mínimos
                const dni = (c.dni || c.DNI || '').toString().trim()
                const nombres = (c.nombres || c.NOMBRES || c.Nombre || '').toString().trim()

                if (!dni || !nombres) {
                    results.errors.push(`Fila omitida: Datos insuficientes para "${nombres || 'sin nombre'}" (DNI: ${dni || 'vacío'})`)
                    continue
                }

                // b. Verificar duplicado
                const { data: existingClient } = await supabaseAdmin
                    .from('clientes')
                    .select('id')
                    .eq('dni', dni)
                    .maybeSingle()

                if (existingClient) {
                    results.skipped++
                    results.skippedData.push({
                        dni,
                        nombres,
                        motivo: 'El cliente ya existe en el sistema (DNI duplicado)'
                    })
                    continue
                }

                // c. Mapear sector
                const sectorName = (c.sector || c.Sector || '').toString().trim()
                let sectorId = null
                if (sectorName) {
                    sectorId = sectorMap.get(sectorName.toLowerCase().trim()) || null
                }

                // d. Mapear asesor
                const asesorName = (c.asesor_nombre || c.asesor || c.Asesor || '').toString().trim()
                let asesorId = user.id // Default: admin actual
                if (asesorName) {
                    const mappedId = perfilMap.get(asesorName.toLowerCase().trim())
                    if (mappedId) asesorId = mappedId
                }

                // E. Crear Solicitud (como registro prospecto migrado, sin datos de préstamo)
                const { data: solicitud, error: solicitudError } = await supabaseAdmin
                    .from('solicitudes')
                    .insert({
                        asesor_id: asesorId,
                        admin_id: user.id,
                        estado_solicitud: 'aprobado',
                        fecha_aprobacion: new Date().toISOString(),
                        // Datos del prospecto
                        prospecto_nombres: nombres,
                        prospecto_dni: dni,
                        prospecto_telefono: (c.telefono || c.Telefono || '').toString().trim() || null,
                        prospecto_direccion: (c.direccion || c.Direccion || '').toString().trim() || null,
                        prospecto_referencia: (c.referencia || c.Referencia || '').toString().trim() || null,
                        // Valores mínimos válidos para pasar check constraints de la BD
                        // (No se crea préstamo, son solo placeholders)
                        monto_solicitado: 1,
                        interes: 0,
                        cuotas: 1,
                        modalidad: 'diario',
                        fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
                        // Datos negocio
                        giro_negocio: (c.giro_negocio || c.GiroNegocio || '').toString().trim() || null,
                        fuentes_ingresos: (c.fuentes_ingresos || c.FuentesIngresos || '').toString().trim() || null,
                        ingresos_mensuales: c.ingresos_mensuales ? parseFloat(c.ingresos_mensuales) : 0,
                        motivo_prestamo: 'Migración de datos - Sistema Anterior',
                        observacion_supervisor: 'Registro migrado del sistema anterior',
                        documentos_evaluacion: sectorId ? { prospecto_sector_id: sectorId } : null
                    })
                    .select()
                    .single()

                if (solicitudError) throw new Error(`Error creando solicitud: ${solicitudError.message}`)

                // F. Crear Cliente
                const { data: newClient, error: clientError } = await supabaseAdmin
                    .from('clientes')
                    .insert({
                        dni,
                        nombres,
                        telefono: (c.telefono || c.Telefono || '').toString().trim() || null,
                        direccion: (c.direccion || c.Direccion || '').toString().trim() || null,
                        referencia: (c.referencia || c.Referencia || '').toString().trim() || null,
                        sector_id: sectorId,
                        estado: 'activo',
                        asesor_id: asesorId
                    })
                    .select()
                    .single()

                if (clientError) throw new Error(`Error creando cliente: ${clientError.message}`)

                // G. Vincular solicitud con cliente
                await supabaseAdmin
                    .from('solicitudes')
                    .update({ cliente_id: newClient.id })
                    .eq('id', solicitud.id)

                // H. Auditoría
                await supabaseAdmin.from('auditoria').insert({
                    usuario_id: user.id,
                    accion: 'migracion_cliente',
                    tabla_afectada: 'clientes',
                    detalle: { cliente_id: newClient.id, dni, nombres, origen: 'migracion_sistema_anterior' }
                })

                results.success++

            } catch (err: any) {
                console.error('Row Import Error:', err.message)
                results.errors.push(`Error en "${c.nombres || 'sin nombre'}": ${err.message}`)
            }
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
