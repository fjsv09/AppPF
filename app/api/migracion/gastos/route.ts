import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutos para migraciones grandes

const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'
const BATCH_SIZE = 200

/**
 * POST /api/migracion/gastos
 * Importación masiva de gastos históricos del sistema anterior.
 * Optimizado: batch inserts, 1 sola actualización de saldo al final.
 */

function normalizeDate(dateStr: any): string {
    if (!dateStr) return new Date().toISOString()
    if (dateStr instanceof Date) return dateStr.toISOString()

    const str = String(dateStr).trim()

    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (dmyMatch) {
        const [_, day, month, year] = dmyMatch
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00Z`
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.includes('T') ? str : `${str.split(' ')[0]}T12:00:00Z`
    }

    try {
        const d = new Date(str)
        if (!isNaN(d.getTime())) return d.toISOString()
    } catch (e) {}

    return new Date().toISOString()
}

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

        const { expenses, cuenta_id } = await request.json()
        if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
            return NextResponse.json({ error: 'Datos incompletos: Se requiere lista de gastos' }, { status: 400 })
        }

        // Precargar datos de referencia en paralelo
        const [cuentaRes, perfilesRes, categoriasRes] = await Promise.all([
            cuenta_id
                ? supabaseAdmin.from('cuentas_financieras').select('*').eq('id', cuenta_id).single()
                : supabaseAdmin.from('cuentas_financieras').select('*').eq('cartera_id', GLOBAL_CARTERA_ID).order('nombre'),
            supabaseAdmin.from('perfiles').select('id, nombre_completo').eq('activo', true),
            supabaseAdmin.from('categorias_gastos').select('id, nombre'),
        ])

        let cuentaEfectivo: any = null
        if (cuenta_id) {
            cuentaEfectivo = cuentaRes.data
        } else {
            const cuentas = cuentaRes.data as any[]
            cuentaEfectivo = cuentas?.find(c => c.nombre?.toLowerCase().includes('efectivo')) || cuentas?.[0]
        }

        if (!cuentaEfectivo) {
            return NextResponse.json({ error: 'No se encontró la cuenta financiera seleccionada' }, { status: 404 })
        }

        const perfilMap = new Map(perfilesRes.data?.map((p: any) => [p.nombre_completo.toLowerCase().trim(), p.id]) || [])
        const categoriaMap = new Map(categoriasRes.data?.map((c: any) => [c.nombre.toLowerCase().trim(), c.id]) || [])

        // Validar y preparar todos los registros en memoria
        const results = {
            total: expenses.length,
            success: 0,
            skipped: 0,
            skippedData: [] as any[],
            errors: [] as string[],
            totalDescontado: 0,
        }

        type GastoPreparado = {
            movimiento: Record<string, any>
            audit: Record<string, any>
            monto: number
            descripcionOriginal: string
        }

        const validos: GastoPreparado[] = []
        let totalADescontar = 0

        for (const e of expenses) {
            const descripcion = (e.descripcion || e.Descripcion || e.detalle || '').toString().trim()
            const monto = parseFloat(e.monto || e.Monto || 0)
            const categoriaName = (e.categoria || e.Categoria || '').toString().trim()
            const registradoPorName = (e.registrado_por_nombre || e.registrado_por || e.RegistradoPor || '').toString().trim()
            const fechaRegistroRaw = e.fecha_registro || e.FechaRegistro || e.fecha || null

            if (!descripcion || monto <= 0) {
                results.errors.push(`Fila omitida: Datos insuficientes (Desc: "${descripcion || 'vacío'}", Monto: ${monto})`)
                continue
            }

            const categoriaId = categoriaName ? (categoriaMap.get(categoriaName.toLowerCase().trim()) || null) : null
            const registradoPorId = registradoPorName ? (perfilMap.get(registradoPorName.toLowerCase().trim()) || user.id) : user.id
            const fechaRegistro = normalizeDate(fechaRegistroRaw)

            const movimiento: Record<string, any> = {
                cartera_id: cuentaEfectivo.cartera_id || GLOBAL_CARTERA_ID,
                cuenta_origen_id: cuentaEfectivo.id,
                monto,
                tipo: 'egreso',
                descripcion: `[MIGRACIÓN] ${descripcion}`,
                registrado_por: registradoPorId,
                categoria_id: categoriaId,
                created_at: fechaRegistro,
            }

            validos.push({
                movimiento,
                monto,
                descripcionOriginal: descripcion,
                audit: {
                    usuario_id: user.id,
                    accion: 'migracion_gasto',
                    tabla_afectada: 'movimientos_financieros',
                    detalle: {
                        monto,
                        descripcion,
                        categoria: categoriaName || null,
                        registrado_por_original: registradoPorName || null,
                        fecha_original: fechaRegistroRaw || null,
                        origen: 'migracion_sistema_anterior',
                    },
                },
            })

            totalADescontar += monto
        }

        // Validar saldo suficiente antes de insertar nada
        if (cuentaEfectivo.saldo < totalADescontar) {
            return NextResponse.json({
                error: `Saldo insuficiente. Disponible: $${cuentaEfectivo.saldo?.toFixed(2)}, Requerido: $${totalADescontar.toFixed(2)}`
            }, { status: 400 })
        }

        // Insertar movimientos en lotes
        for (let i = 0; i < validos.length; i += BATCH_SIZE) {
            const lote = validos.slice(i, i + BATCH_SIZE)

            const { error: moveError } = await supabaseAdmin
                .from('movimientos_financieros')
                .insert(lote.map(g => g.movimiento))

            if (moveError) {
                results.errors.push(`Error en lote movimientos ${i}-${i + lote.length}: ${moveError.message}`)
                continue
            }

            results.success += lote.length
            results.totalDescontado += lote.reduce((acc, g) => acc + g.monto, 0)
        }

        // Actualizar saldo una sola vez al final
        const saldoFinal = parseFloat(cuentaEfectivo.saldo) - results.totalDescontado
        await supabaseAdmin
            .from('cuentas_financieras')
            .update({ saldo: saldoFinal })
            .eq('id', cuentaEfectivo.id)

        // Auditoría en batch (solo los que se insertaron exitosamente)
        const exitosos = validos.slice(0, results.success)
        for (let i = 0; i < exitosos.length; i += BATCH_SIZE) {
            await supabaseAdmin
                .from('auditoria')
                .insert(exitosos.slice(i, i + BATCH_SIZE).map(g => g.audit))
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
