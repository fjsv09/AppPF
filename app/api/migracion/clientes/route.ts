import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutos para migraciones grandes

const BATCH_SIZE = 100

/**
 * POST /api/migracion/clientes
 * Importación masiva de clientes del sistema anterior.
 * Optimizado: batch inserts, duplicate check en memoria, ~3 queries por lote vs 5 por fila.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

        // Precargar datos de referencia en paralelo (1 ronda de queries, no N)
        const [sectoresRes, perfilesRes, existentesRes] = await Promise.all([
            supabaseAdmin.from('sectores').select('id, nombre'),
            supabaseAdmin.from('perfiles').select('id, nombre_completo').eq('activo', true),
            supabaseAdmin.from('clientes').select('dni'),
        ])

        const sectorMap = new Map(sectoresRes.data?.map((s: any) => [s.nombre.toLowerCase().trim(), s.id]) || [])
        const perfilMap = new Map(perfilesRes.data?.map((p: any) => [p.nombre_completo.toLowerCase().trim(), p.id]) || [])
        const existingDnis = new Set(existentesRes.data?.map((c: any) => c.dni) || [])

        // Validar y preparar todos los registros en memoria
        type ClientePreparado = {
            raw: any
            dni: string
            nombres: string
            sectorId: string | null
            asesorId: string
        }
        const validos: ClientePreparado[] = []

        for (const c of clients) {
            const dni = (c.dni || c.DNI || '').toString().trim()
            const nombres = (c.nombres || c.NOMBRES || c.Nombre || '').toString().trim()

            if (!dni || !nombres) {
                results.errors.push(`Fila omitida: Datos insuficientes para "${nombres || 'sin nombre'}" (DNI: ${dni || 'vacío'})`)
                continue
            }

            if (existingDnis.has(dni)) {
                results.skipped++
                results.skippedData.push({ dni, nombres, motivo: 'El cliente ya existe en el sistema (DNI duplicado)' })
                continue
            }

            // Marcar como procesado para no duplicar si viene repetido en el mismo lote
            existingDnis.add(dni)

            const sectorName = (c.sector || c.Sector || '').toString().trim()
            const asesorName = (c.asesor_nombre || c.asesor || c.Asesor || '').toString().trim()

            validos.push({
                raw: c,
                dni,
                nombres,
                sectorId: sectorName ? (sectorMap.get(sectorName.toLowerCase().trim()) || null) : null,
                asesorId: asesorName ? (perfilMap.get(asesorName.toLowerCase().trim()) || user.id) : user.id,
            })
        }

        // Procesar en lotes para evitar límites de payload y timeouts
        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE)

            try {
                // 1. Insertar clientes en batch → obtener IDs
                const clientesPayload = lote.map(c => ({
                    dni: c.dni,
                    nombres: c.nombres,
                    telefono: (c.raw.telefono || c.raw.Telefono || '').toString().trim() || null,
                    direccion: (c.raw.direccion || c.raw.Direccion || '').toString().trim() || null,
                    referencia: (c.raw.referencia || c.raw.Referencia || '').toString().trim() || null,
                    sector_id: c.sectorId,
                    estado: 'activo',
                    asesor_id: c.asesorId,
                }))

                const { data: nuevosClientes, error: clienteError } = await supabaseAdmin
                    .from('clientes')
                    .insert(clientesPayload)
                    .select('id, dni')

                if (clienteError) {
                    results.errors.push(`Error en lote ${i}-${i + lote.length}: ${clienteError.message}`)
                    continue
                }

                // Mapa dni → cliente_id para vincular solicitudes
                const dniToClienteId = new Map(nuevosClientes!.map((nc: any) => [nc.dni, nc.id]))

                // 2. Insertar solicitudes en batch (con cliente_id ya incluido)
                const solicitudesPayload = lote.map(c => ({
                    asesor_id: c.asesorId,
                    admin_id: user.id,
                    cliente_id: dniToClienteId.get(c.dni),
                    estado_solicitud: 'aprobado',
                    fecha_aprobacion: new Date().toISOString(),
                    prospecto_nombres: c.nombres,
                    prospecto_dni: c.dni,
                    prospecto_telefono: (c.raw.telefono || c.raw.Telefono || '').toString().trim() || null,
                    prospecto_direccion: (c.raw.direccion || c.raw.Direccion || '').toString().trim() || null,
                    prospecto_referencia: (c.raw.referencia || c.raw.Referencia || '').toString().trim() || null,
                    monto_solicitado: 1,
                    interes: 0,
                    cuotas: 1,
                    modalidad: 'diario',
                    fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
                    giro_negocio: (c.raw.giro_negocio || c.raw.GiroNegocio || '').toString().trim() || null,
                    fuentes_ingresos: (c.raw.fuentes_ingresos || c.raw.FuentesIngresos || '').toString().trim() || null,
                    ingresos_mensuales: c.raw.ingresos_mensuales ? parseFloat(c.raw.ingresos_mensuales) : 0,
                    motivo_prestamo: 'Migración de datos - Sistema Anterior',
                    observacion_supervisor: 'Registro migrado del sistema anterior',
                    documentos_evaluacion: c.sectorId ? { prospecto_sector_id: c.sectorId } : null,
                }))

                const { error: solicitudError } = await supabaseAdmin
                    .from('solicitudes')
                    .insert(solicitudesPayload)

                if (solicitudError) {
                    results.errors.push(`Error solicitudes lote ${i}: ${solicitudError.message}`)
                }

                // 3. Auditoría en batch
                const auditsPayload = nuevosClientes!.map((nc: any) => {
                    const c = lote.find(l => l.dni === nc.dni)!
                    return {
                        usuario_id: user.id,
                        accion: 'migracion_cliente',
                        tabla_afectada: 'clientes',
                        detalle: { cliente_id: nc.id, dni: nc.dni, nombres: c.nombres, origen: 'migracion_sistema_anterior' },
                    }
                })

                await supabaseAdmin.from('auditoria').insert(auditsPayload)

                results.success += nuevosClientes!.length

            } catch (err: any) {
                console.error(`Error en lote ${i}:`, err.message)
                results.errors.push(`Error en lote ${i}-${i + lote.length}: ${err.message}`)
            }
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
