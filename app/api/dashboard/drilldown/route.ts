import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getTodayPeru, calculateLoanMetrics } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
    const { searchParams } = new URL(request.url)
    
    const type = searchParams.get('type')
    const asesorId = searchParams.get('asesorId')
    const supervisorId = searchParams.get('supervisorId')

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { data: perfil } = await supabaseAdmin.from('perfiles').select('rol').eq('id', user.id).single()
        const isAdmin = perfil?.rol === 'admin' || perfil?.rol === 'secretaria'

        // 1. Determinar el equipo objetivo
        let targetAsesorIds: string[] = []
        
        if (asesorId && asesorId !== 'null' && asesorId !== 'undefined') {
            targetAsesorIds = [asesorId]
        } else if (supervisorId && supervisorId !== 'null' && supervisorId !== 'undefined') {
            const { data: team } = await supabaseAdmin.from('perfiles').select('id').eq('supervisor_id', supervisorId)
            targetAsesorIds = [supervisorId, ...(team?.map(a => a.id) || [])]
        } else if (isAdmin) {
            // Admin/Secretaria sin filtro específico ven TODO
            const { data: allAsesores } = await supabaseAdmin.from('perfiles').select('id').in('rol', ['asesor', 'supervisor'])
            targetAsesorIds = allAsesores?.map(a => a.id) || []
        } else {
            // Usuario normal ve su equipo
            const { data: team } = await supabaseAdmin.from('perfiles').select('id').eq('supervisor_id', user.id)
            targetAsesorIds = [user.id, ...(team?.map(a => a.id) || [])]
        }
        const nowPeru = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
        const firstOfMonth = new Date(nowPeru.getFullYear(), nowPeru.getMonth(), 1).toISOString();
        const today = nowPeru.toISOString().split('T')[0];

        // Lógica de refinanciamiento para filtrar "Activo Vigente"
        const { data: renovacionesRefinanciamiento } = await supabaseAdmin
            .from('renovaciones')
            .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
        
        const prestamoIdsProductoRefinanciamiento = new Set(
            (renovacionesRefinanciamiento || [])
                .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
                .map((r: any) => r.prestamo_nuevo_id as string)
                .filter(Boolean)
        )

        // Configuración para cálculos
        const { data: configSistema } = await supabaseAdmin.from('configuracion_sistema').select('clave, valor')
        const config = {
            renovacionMinPagado: parseInt(configSistema?.find(c => c.clave === 'renovacion_min_pagado')?.valor || '60'),
            umbralCpp: parseInt(configSistema?.find(c => c.clave === 'umbral_mora_cpp')?.valor || '4'),
            umbralMoroso: parseInt(configSistema?.find(c => c.clave === 'umbral_mora_moroso')?.valor || '7'),
            umbralCppOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_mora_cpp_otros')?.valor || '1'),
            umbralMorosoOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_mora_moroso_otros')?.valor || '2')
        }

        let results: any[] = []

        if (type === 'vencidos' || type === 'critica' || type === 'advert') {
            const { data: loans } = await supabaseAdmin
                .from('prestamos')
                .select('*, clientes(nombres, asesor_id), cronograma_cuotas(*, pagos(*))')
                .in('estado', ['activo', 'legal'])

            const filteredLoans = (loans || []).filter(p => targetAsesorIds.includes(p.clientes?.asesor_id))

            filteredLoans.forEach(p => {
                const metrics = calculateLoanMetrics(p, today, config)
                const cronograma = p.cronograma_cuotas || []
                const sorted = [...cronograma].sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())
                const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].fecha_vencimiento : null
                
                const isActuallyVencido = lastDate && lastDate < today && metrics.saldoPendiente > 1.0 && metrics.cuotasAtrasadas > 0

                if (type === 'vencidos' && isActuallyVencido) {
                    results.push({
                        id: p.id,
                        cliente: p.clientes?.nombres,
                        monto: p.monto,
                        saldo: metrics.saldoPendiente,
                        atraso: metrics.cuotasAtrasadas,
                        fechaFin: lastDate
                    })
                } else if (type === 'critica' && !isActuallyVencido && metrics.isCritico) {
                    results.push({
                        id: p.id,
                        cliente: p.clientes?.nombres,
                        monto: p.monto,
                        saldo: metrics.saldoPendiente,
                        atraso: metrics.cuotasAtrasadas,
                        estadoMora: 'CRÍTICO'
                    })
                } else if (type === 'advert' && !isActuallyVencido && metrics.isMora) {
                    results.push({
                        id: p.id,
                        cliente: p.clientes?.nombres,
                        monto: p.monto,
                        saldo: metrics.saldoPendiente,
                        atraso: metrics.cuotasAtrasadas,
                        estadoMora: 'ADVERTENCIA'
                    })
                }
            })
        } else if (type === 'bloqueados') {
            const { data: clients } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres, asesor_id, telefono')
                .in('asesor_id', targetAsesorIds)
                .eq('bloqueado_renovacion', true)
            results = clients || []
        } else if (type === 'nuevos') {
            const { data: clients } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres, created_at, asesor_id')
                .in('asesor_id', targetAsesorIds)
                .gte('created_at', firstOfMonth)
            results = clients || []
        } else if (type === 'renovaciones') {
            const { data: renovs } = await supabaseAdmin
                .from('renovaciones')
                .select('id, monto_nuevo, fecha_renovacion, prestamos!prestamo_nuevo_id!inner(clientes!inner(nombres, asesor_id))')
                .in('prestamos.clientes.asesor_id', targetAsesorIds)
                .gte('fecha_renovacion', firstOfMonth)
            
            results = (renovs || []).map((r: any) => ({
                id: r.id,
                cliente: r.prestamos?.clientes?.nombres || 'Sin nombre',
                monto: r.monto_nuevo,
                fecha: r.fecha_renovacion
            }))
        } else if (type === 'aptos') {
            const { data: loans } = await supabaseAdmin
                .from('prestamos')
                .select('*, clientes(id, nombres, asesor_id, telefono, bloqueado_renovacion), cronograma_cuotas(*, pagos(*))')
                .in('estado', ['activo', 'legal', 'finalizado', 'completado'])

            const filteredLoans = (loans || []).filter(p => targetAsesorIds.includes(p.clientes?.asesor_id))
            const loansByClient = new Map<string, any[]>()
            
            filteredLoans.forEach(p => {
                const list = loansByClient.get(p.clientes.id) || []
                list.push(p)
                loansByClient.set(p.clientes.id, list)
            })

            const aptosMap = new Map()
            loansByClient.forEach((clientLoans, clientId) => {
                const sorted = [...clientLoans].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                const activeLoans = sorted.filter(l => l.estado === 'activo')
                const finishedLoans = sorted.filter(l => ['finalizado', 'completado'].includes(l.estado))

                let bestLoanItem = null
                if (activeLoans.length > 0) {
                    // Si tiene activos, buscamos el que tenga más progreso de los renovables
                    const renovables = activeLoans.map(l => ({
                        loan: l,
                        metrics: calculateLoanMetrics(l, today, config)
                    })).filter(item => item.metrics.esRenovable && !item.loan.clientes?.bloqueado_renovacion)
                    
                    if (renovables.length > 0) {
                        bestLoanItem = renovables.sort((a,b) => (b.metrics.cuotasPagadas/b.metrics.totalCuotas) - (a.metrics.cuotasPagadas/a.metrics.totalCuotas))[0]
                    }
                } else if (finishedLoans.length > 0) {
                    // Si solo hay terminados, el último debe ser renovable
                    const latestFinished = finishedLoans[0]
                    const m = calculateLoanMetrics(latestFinished, today, config)
                    if (m.esRenovable && !latestFinished.clientes?.bloqueado_renovacion) {
                        bestLoanItem = { loan: latestFinished, metrics: m }
                    }
                }

                if (bestLoanItem) {
                    aptosMap.set(clientId, {
                        id: bestLoanItem.loan.id,
                        cliente: bestLoanItem.loan.clientes.nombres,
                        telefono: bestLoanItem.loan.clientes.telefono,
                        montoActual: bestLoanItem.loan.monto,
                        progreso: (bestLoanItem.metrics.cuotasPagadas / bestLoanItem.metrics.totalCuotas) * 100
                    })
                }
            })
            results = Array.from(aptosMap.values())
        }
 else if (type === 'vigente') {
            const { data: loans } = await supabaseAdmin
                .from('prestamos')
                .select('*, clientes(nombres, asesor_id, bloqueado_renovacion), cronograma_cuotas(*, pagos(*))')
                .in('estado', ['activo', 'legal'])

            const filteredLoans = (loans || []).filter(p => targetAsesorIds.includes(p.clientes?.asesor_id))
            filteredLoans.forEach(p => {
                const metrics = calculateLoanMetrics(p, today, config)
                const crono = p.cronograma_cuotas || []
                const sorted = [...crono].sort((a,b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())
                const lastDate = sorted.pop()?.fecha_vencimiento
                
                const isActuallyVencido = lastDate && lastDate < today && metrics.saldoPendiente > 1.0 && metrics.cuotasAtrasadas > 0
                const isMainLoan = !p.es_paralelo;
                const isNotRefinancedProduct = !prestamoIdsProductoRefinanciamiento.has(p.id);
                const isNotVencido = !isActuallyVencido;
                const hasBalance = metrics.saldoPendiente > 0.01;

                if (isMainLoan && isNotRefinancedProduct && isNotVencido && hasBalance && !p.clientes?.bloqueado_renovacion) {
                    results.push({
                        id: p.id,
                        cliente: p.clientes?.nombres,
                        monto: p.monto,
                        saldo: metrics.saldoPendiente
                    })
                }
            })
        } else if (type === 'total') {
            const { data: clients } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres, telefono, asesor_id')
                .in('asesor_id', targetAsesorIds)
            results = clients || []
        }

        return NextResponse.json(results)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
