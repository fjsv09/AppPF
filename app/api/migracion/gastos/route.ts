import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'

/**
 * POST /api/migracion/gastos
 * Importación masiva de gastos históricos del sistema anterior.
 * Descuenta de la cuenta Efectivo Global y registra con las fechas originales.
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

        const { expenses } = await request.json()
        if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
            return NextResponse.json({ error: 'Datos incompletos: Se requiere lista de gastos' }, { status: 400 })
        }

        // 2. Buscar cuenta Efectivo Global
        const { data: cuentasGlobal } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('cartera_id', GLOBAL_CARTERA_ID)
            .order('nombre')

        let cuentaEfectivo = cuentasGlobal?.find(c => c.nombre?.toLowerCase().includes('efectivo'))
            || cuentasGlobal?.[0]

        if (!cuentaEfectivo) {
            return NextResponse.json({ error: 'No se encontró la cuenta Efectivo Global' }, { status: 404 })
        }

        // 3. Calcular total para validar saldo
        const totalGastos = expenses.reduce((acc: number, e: any) => {
            return acc + (parseFloat(e.monto || e.Monto || 0))
        }, 0)

        if (cuentaEfectivo.saldo < totalGastos) {
            return NextResponse.json({
                error: `Saldo insuficiente en Efectivo Global. Disponible: $${cuentaEfectivo.saldo?.toFixed(2)}, Requerido: $${totalGastos.toFixed(2)}`
            }, { status: 400 })
        }

        // Precargar datos de referencia
        const { data: perfilesData } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo')
            .eq('activo', true)
        const perfilMap = new Map(perfilesData?.map((p: any) => [p.nombre_completo.toLowerCase().trim(), p.id]) || [])

        const { data: categoriasData } = await supabaseAdmin
            .from('categorias_gastos')
            .select('id, nombre')
        const categoriaMap = new Map(categoriasData?.map((c: any) => [c.nombre.toLowerCase().trim(), c.id]) || [])

        const results = {
            total: expenses.length,
            success: 0,
            skipped: 0,
            skippedData: [] as any[],
            errors: [] as string[],
            totalDescontado: 0
        }

        let currentBalance = parseFloat(cuentaEfectivo.saldo)

        // 4. Procesar cada gasto
        for (const e of expenses) {
            try {
                const descripcion = (e.descripcion || e.Descripcion || e.detalle || '').toString().trim()
                const monto = parseFloat(e.monto || e.Monto || 0)
                const categoriaName = (e.categoria || e.Categoria || '').toString().trim()
                const registradoPorName = (e.registrado_por_nombre || e.registrado_por || e.RegistradoPor || '').toString().trim()
                const fechaRegistroRaw = e.fecha_registro || e.FechaRegistro || e.fecha || null

                if (!descripcion || monto <= 0) {
                    results.errors.push(`Fila omitida: Datos insuficientes (Desc: "${descripcion || 'vacío'}", Monto: ${monto})`)
                    continue
                }

                // Mapear categoría
                let categoriaId = null
                if (categoriaName) {
                    categoriaId = categoriaMap.get(categoriaName.toLowerCase().trim()) || null
                }

                // Mapear persona que registró
                let registradoPorId = user.id
                if (registradoPorName) {
                    const mappedId = perfilMap.get(registradoPorName.toLowerCase().trim())
                    if (mappedId) registradoPorId = mappedId
                }

                // Parsear fecha de registro
                let fechaRegistro: string | null = null
                if (fechaRegistroRaw) {
                    if (fechaRegistroRaw instanceof Date) {
                        fechaRegistro = fechaRegistroRaw.toISOString()
                    } else {
                        // Intentar parsear como fecha
                        const parsed = new Date(fechaRegistroRaw)
                        if (!isNaN(parsed.getTime())) {
                            fechaRegistro = parsed.toISOString()
                        }
                    }
                }

                // Insertar movimiento financiero
                const insertData: any = {
                    cartera_id: GLOBAL_CARTERA_ID,
                    cuenta_origen_id: cuentaEfectivo.id,
                    monto,
                    tipo: 'egreso',
                    descripcion: `[MIGRACIÓN] ${descripcion}`,
                    registrado_por: registradoPorId,
                    categoria_id: categoriaId
                }

                // Usar la fecha original si se proporcionó
                if (fechaRegistro) {
                    insertData.created_at = fechaRegistro
                }

                const { error: moveError } = await supabaseAdmin
                    .from('movimientos_financieros')
                    .insert(insertData)

                if (moveError) throw new Error(`Error registrando movimiento: ${moveError.message}`)

                // Actualizar saldo
                currentBalance -= monto
                await supabaseAdmin
                    .from('cuentas_financieras')
                    .update({ saldo: currentBalance })
                    .eq('id', cuentaEfectivo.id)

                results.totalDescontado += monto

                // Auditoría
                await supabaseAdmin.from('auditoria').insert({
                    usuario_id: user.id,
                    accion: 'migracion_gasto',
                    tabla_afectada: 'movimientos_financieros',
                    detalle: {
                        monto,
                        descripcion,
                        categoria: categoriaName || null,
                        registrado_por_original: registradoPorName || null,
                        fecha_original: fechaRegistroRaw || null,
                        origen: 'migracion_sistema_anterior'
                    }
                })

                results.success++

            } catch (err: any) {
                console.error('Row Import Error:', err.message)
                results.errors.push(`Error en gasto "${e.descripcion || 'N/A'}": ${err.message}`)
            }
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Migration Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
