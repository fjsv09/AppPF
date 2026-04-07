import { createClient } from '../../../../utils/supabase/server'
import { createAdminClient } from '../../../../utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
            return NextResponse.json({ error: 'Solo administradores pueden realizar importaciones masivas con desembolso' }, { status: 403 })
        }

        const { clients, cuentaOrigenId } = await request.json()
        if (!clients || !Array.isArray(clients) || !cuentaOrigenId) {
            return NextResponse.json({ error: 'Datos incompletos: Se requiere lista de clientes y cuenta de origen' }, { status: 400 })
        }

        // 2. Validar saldo total antes de empezar
        const totalMonto = clients.reduce((acc: number, c: any) => acc + (parseFloat(c.monto_solicitado || c.monto || 0)), 0)
        
        const { data: cuenta, error: cuentaError } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('*')
            .eq('id', cuentaOrigenId)
            .single()

        if (cuentaError || !cuenta) {
            return NextResponse.json({ error: 'La cuenta financiera de origen no existe' }, { status: 404 })
        }

        if (cuenta.saldo < totalMonto) {
            return NextResponse.json({ 
                error: `Saldo insuficiente en la cuenta. Disponible: $${cuenta.saldo}, Requerido: $${totalMonto}` 
            }, { status: 400 })
        }

        const results = {
            total: clients.length,
            success: 0,
            skipped: 0,
            errors: [] as string[]
        }

        // Obtener sectores para mapeo por nombre
        const { data: sectores } = await supabaseAdmin.from('sectores').select('id, nombre')
        const sectorMap = new Map(sectores?.map((s: { nombre: string, id: string }) => [s.nombre.toLowerCase(), s.id]) || [])

        let currentBalance = parseFloat(cuenta.saldo)

        // 3. Procesar por cada fila
        for (const c of clients) {
            try {
                // a. Validar campos mínimos
                const dni = (c.dni || c.DNI || '').toString().trim()
                const nombres = (c.nombres || c.NOMBRES || c.Nombre || '').toString().trim()
                const monto = parseFloat(c.monto_solicitado || c.monto || 0)
                
                if (!dni || !nombres || monto <= 0) {
                    results.errors.push(`Fila omitida: Datos insuficientes para ${nombres || 'sin nombre'}`)
                    continue
                }

                // b. Verificar duplicado de cliente
                const { data: existingClient } = await supabaseAdmin
                    .from('clientes')
                    .select('id')
                    .eq('dni', dni)
                    .maybeSingle()

                if (existingClient) {
                    results.skipped++
                    continue
                }

                // c. Mapear sector
                const sectorName = c.sector || c.Sector
                let sectorId = c.sector_id || null
                if (sectorName && !sectorId) {
                    sectorId = sectorMap.get(sectorName.toString().toLowerCase()) || null
                }

                // --- INICIO DE FLUJO AUTOMATIZADO ---

                // D. Crear Cliente
                const { data: newClient, error: clientError } = await supabaseAdmin
                    .from('clientes')
                    .insert({
                        dni: dni,
                        nombres: nombres,
                        telefono: c.telefono || c.Telefono || null,
                        direccion: c.direccion || c.Direccion || null,
                        referencia: c.referencia || c.Referencia || null,
                        sector_id: sectorId,
                        estado: 'activo',
                        asesor_id: user.id
                    })
                    .select()
                    .single()

                if (clientError) throw new Error(`Error creando cliente: ${clientError.message}`)

                // E. Crear Solicitud (Aprobada)
                const interes = parseFloat(c.interes || 0)
                const cuotas = parseInt(c.cuotas || 0)
                const modalidad = c.modalidad || c.frecuencia || 'diario'
                const fecha_inicio = c.fecha_inicio || c.fecha_inicio_propuesta || new Date().toISOString().split('T')[0]

                const { data: solicitud, error: solicitudError } = await supabaseAdmin
                    .from('solicitudes')
                    .insert({
                        cliente_id: newClient.id,
                        asesor_id: user.id,
                        admin_id: user.id,
                        estado_solicitud: 'aprobado',
                        fecha_aprobacion: new Date().toISOString(),
                        giro_negocio: c.giro_negocio || c.GiroNegocio || null,
                        fuentes_ingresos: c.fuentes_ingresos || c.FuentesIngresos || null,
                        ingresos_mensuales: c.ingresos_mensuales ? parseFloat(c.ingresos_mensuales) : 0,
                        motivo_prestamo: c.motivo_prestamo || 'Importación Masiva',
                        monto_solicitado: monto,
                        interes: interes,
                        cuotas: cuotas,
                        modalidad: modalidad,
                        fecha_inicio_propuesta: fecha_inicio
                    })
                    .select()
                    .single()

                if (solicitudError) throw new Error(`Error creando solicitud: ${solicitudError.message}`)

                // F. Crear Préstamo (Activo)
                // Calcular fecha fin aproximada para el registro de préstamos
                const dateInicio = new Date(fecha_inicio)
                let dateFin = new Date(dateInicio)
                if (modalidad === 'diario') dateFin.setDate(dateFin.getDate() + cuotas)
                else if (modalidad === 'semanal') dateFin.setDate(dateFin.getDate() + (cuotas * 7))
                else if (modalidad === 'quincenal') dateFin.setDate(dateFin.getDate() + (cuotas * 15))
                else if (modalidad === 'mensual') dateFin.setMonth(dateFin.getMonth() + cuotas)

                const { data: prestamo, error: prestamoError } = await supabaseAdmin
                    .from('prestamos')
                    .insert({
                        cliente_id: newClient.id,
                        solicitud_id: solicitud.id,
                        monto: monto,
                        interes: interes,
                        fecha_inicio: fecha_inicio,
                        fecha_fin: dateFin.toISOString().split('T')[0],
                        frecuencia: modalidad,
                        cuotas: cuotas,
                        estado: 'activo',
                        estado_mora: 'ok',
                        created_by: user.id
                    })
                    .select()
                    .single()

                if (prestamoError) throw new Error(`Error creando préstamo: ${prestamoError.message}`)

                // G. Generar Cronograma (RPC)
                const { error: cronogramaError } = await supabaseAdmin.rpc('generar_cronograma_db', {
                    p_prestamo_id: prestamo.id
                })
                if (cronogramaError) throw new Error(`Error generando cronograma: ${cronogramaError.message}`)

                // H. Desembolso Financiero (Saldo y Movimiento)
                currentBalance -= monto
                await supabaseAdmin
                    .from('cuentas_financieras')
                    .update({ saldo: currentBalance })
                    .eq('id', cuentaOrigenId)

                await supabaseAdmin
                    .from('movimientos_financieros')
                    .insert({
                        cartera_id: cuenta.cartera_id,
                        cuenta_origen_id: cuentaOrigenId,
                        monto: monto,
                        tipo: 'egreso',
                        descripcion: `Desembolso Importación Masiva - Préstamo #${prestamo.id.split('-')[0]} - Cliente: ${nombres}`,
                        registrado_por: user.id
                    })

                // I. Auditoría y Tarea Evidencia
                await supabaseAdmin.from('auditoria').insert({
                    usuario_id: user.id,
                    accion: 'importacion_masiva_aprobada',
                    tabla_afectada: 'prestamos',
                    detalle: { prestamo_id: prestamo.id, monto: monto }
                })

                await supabaseAdmin.from('tareas_evidencia').insert({
                    asesor_id: user.id,
                    prestamo_id: prestamo.id,
                    tipo: 'nuevo_prestamo'
                })

                results.success++

            } catch (err: any) {
                console.error('Row Import Error:', err.message)
                results.errors.push(`Error en fila ${c.nombres || 'sin nombre'}: ${err.message}`)
            }
        }

        return NextResponse.json(results)

    } catch (error: any) {
        console.error('Critical Import Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
