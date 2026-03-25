import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        // Inicializar Cliente Admin para saltar RLS
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Verificar Rol del Usuario
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()
        
        if (!perfil || (perfil.rol !== 'admin' && perfil.rol !== 'supervisor')) {
            return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
        }

        // 1. Obtener todos los asesores (Catálogo base)
        const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo')
            .eq('rol', 'asesor')

        if (!asesores) return NextResponse.json([])

        // 2. Obtener todos los pagos en el rango (Excluyendo autopagos de renovación)
        let paymentsQuery = supabaseAdmin
            .from('pagos')
            .select('id, registrado_por, voucher_compartido, cuota_id, fecha_pago, es_autopago_renovacion')
            .or('es_autopago_renovacion.is.null,es_autopago_renovacion.eq.false')

        if (from) paymentsQuery = paymentsQuery.gte('fecha_pago', from)
        if (to) paymentsQuery = paymentsQuery.lte('fecha_pago', to)

        const { data: allPagos, error: pError } = await paymentsQuery

        if (pError || !allPagos || allPagos.length === 0) {
            return NextResponse.json(asesores.map(a => ({ id: a.id, nombre: a.nombre_completo, total: 0, compartidos: 0 })))
        }

        // 3. Obtener el mapa de excepciones y datos de prestamos (para validar estado y deuda)
        const cuotaIds = [...new Set(allPagos.map(p => p.cuota_id).filter(Boolean))]
        
        const { data: chain } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select(`
                id,
                numero_cuota,
                prestamos (
                    id,
                    estado,
                    cronograma_cuotas (
                        monto_cuota,
                        monto_pagado
                    ),
                    clientes (
                        id,
                        nombres,
                        telefono,
                        excepcion_voucher
                    )
                )
            `)
            .in('id', cuotaIds)

        const cuotaAuditMap: Record<string, { 
            isExempt: boolean, 
            isAuditable: boolean,
            clienteNombre?: string,
            clienteTelefono?: string,
            numeroCuota?: number,
            prestamoId?: string
        }> = {}
        
        chain?.forEach((c: any) => {
            const prestamo = Array.isArray(c.prestamos) ? c.prestamos[0] : c.prestamos
            const cliente = Array.isArray(prestamo?.clientes) ? prestamo.clientes[0] : prestamo?.clientes
            
            // Un préstamo es auditable si está ACTIVO y tiene DEUDA
            const isActivo = prestamo?.estado?.toLowerCase() === 'activo'
            
            let tieneDeuda = false
            if (prestamo?.cronograma_cuotas) {
                const cuotasArr = Array.isArray(prestamo.cronograma_cuotas) ? prestamo.cronograma_cuotas : [prestamo.cronograma_cuotas]
                const totalMonto = cuotasArr.reduce((sum: number, cc: any) => sum + (Number(cc.monto_cuota) || 0), 0)
                const totalPagado = cuotasArr.reduce((sum: number, cc: any) => sum + (Number(cc.monto_pagado) || 0), 0)
                tieneDeuda = totalMonto > totalPagado
            }

            cuotaAuditMap[c.id] = {
                isExempt: cliente?.excepcion_voucher === true,
                isAuditable: isActivo && tieneDeuda,
                clienteNombre: cliente?.nombres || 'Cliente Desconocido',
                clienteTelefono: cliente?.telefono,
                numeroCuota: c.numero_cuota,
                prestamoId: prestamo?.id
            }
        })

        // 4. Consolidar estadísticas
        const statsMap = asesores.reduce((acc, a) => {
            acc[a.id] = { id: a.id, nombre: a.nombre_completo, total: 0, compartidos: 0, pendientes: [] }
            return acc
        }, {} as Record<string, any>)

        allPagos.forEach(p => {
            const aid = p.registrado_por
            if (aid && statsMap[aid]) {
                const auditInfo = p.cuota_id ? cuotaAuditMap[p.cuota_id] : null
                
                // Aplicar filtros: Debe ser auditable (Activo + Deuda) y No exento
                if (auditInfo?.isAuditable && !auditInfo.isExempt) {
                    statsMap[aid].total += 1
                    if (p.voucher_compartido) {
                        statsMap[aid].compartidos += 1
                    } else {
                        statsMap[aid].pendientes.push({
                            pago_id: p.id,
                            fecha: p.fecha_pago,
                            cliente: auditInfo.clienteNombre,
                            telefono: auditInfo.clienteTelefono,
                            cuota: auditInfo.numeroCuota,
                            prestamo_id: auditInfo.prestamoId
                        })
                    }
                }
            }
        })

        return NextResponse.json(Object.values(statsMap))

    } catch (e: any) {
        console.error("Error crítico en API Auditoria:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
