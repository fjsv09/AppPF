import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getTodayPeru, calculateLoanMetrics, calculateMoraBancaria } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        // 1. Verificar usuario y rol
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol, id')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'supervisor' && perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 })
        }

        const today = getTodayPeru()
        const { searchParams } = new URL(request.url)
        const filterAsesorId = searchParams.get('asesorId')
        const filterSupervisorId = searchParams.get('supervisorId')

        // 2. Obtener equipo completo (para el selector) - CORREGIDO: removido foto_url
        let equipoQuery = supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo')
            .eq('rol', 'asesor')

        if (perfil.rol === 'supervisor') {
            equipoQuery = equipoQuery.eq('supervisor_id', user.id)
        } else if (perfil.rol === 'admin' && filterSupervisorId) {
            equipoQuery = equipoQuery.eq('supervisor_id', filterSupervisorId)
        }

        const { data: equipoCompleto, error: equipoError } = await equipoQuery
        if (equipoError) throw new Error('Error al obtener equipo: ' + equipoError.message)

        let targetAsesorIds = equipoCompleto?.map(a => a.id) || []
        if (filterAsesorId) targetAsesorIds = [filterAsesorId]

        let supervisoresDisplay: Array<{ id: string, nombre: string }> = []
        if (perfil.rol === 'admin') {
            const { data: sups } = await supabaseAdmin.from('perfiles').select('id, nombre_completo').eq('rol', 'supervisor')
            supervisoresDisplay = sups?.map((s: any) => ({ id: s.id, nombre: s.nombre_completo })) || []
        }

        const asesorIds = targetAsesorIds
        if (asesorIds.length === 0) {
            return NextResponse.json({ 
                teamSummary: { totalAsesores: 0, totalClientes: 0, totalCapitalActivo: 0, moraGlobal: 0, eficienciaHoy: 0, metaHoyMonto: 0, metaHoyPagado: 0, metaHoyPrestamosTotal: 0, metaHoyPrestamosPagados: 0, renovacionesMes: 0, clientesNuevosMes: 0, clientesBloqueados: 0, refinanciamientosMes: 0, totalRenovables: 0, totalInactivos: 0, totalAlertaCritica: 0, totalAdvertencia: 0, totalVencidos: 0, totalClientesConDeudaActiva: 0 },
                asesores: [], 
                supervisores: supervisoresDisplay,
                pendientes: { solicitudes: [], renovaciones: [] }
            })
        }

        // 3. Obtener préstamos activos
        const allAdvisorsIds = equipoCompleto?.map(a => a.id) || []
        const { data: clientes } = await supabaseAdmin.from('clientes').select('id, asesor_id').in('asesor_id', allAdvisorsIds)
        const clienteIds = clientes?.map(c => c.id) || []
        const clientToAsesorMap = new Map(clientes?.map(c => [c.id, c.asesor_id]))

        const { data: prestamosRaw } = await supabaseAdmin.from('prestamos')
            .select('*, clientes!inner(id, nombres, asesor_id, bloqueado_renovacion)')
            .in('clientes.asesor_id', allAdvisorsIds)
            .in('estado', ['activo', 'legal', 'vencido', 'moroso', 'cpp', 'finalizado', 'completado'])

        const loanIds = prestamosRaw?.map(p => p.id) || []
        let allCuotasRaw: any[] = []
        
        for (let i = 0; i < loanIds.length; i += 150) {
            const chunk = loanIds.slice(i, i + 150)
            const { data: cuotasChunk } = await supabaseAdmin.from('cronograma_cuotas')
                .select('*, pagos(*)')
                .in('prestamo_id', chunk)
            if (cuotasChunk) allCuotasRaw.push(...cuotasChunk)
        }

        prestamosRaw?.forEach(p => {
            p.cronograma_cuotas = allCuotasRaw.filter(c => c.prestamo_id === p.id)
        })

        // 4. Configuración
        const { data: configSistema } = await supabaseAdmin.from('configuracion_sistema').select('clave, valor')
        const config = {
            renovacionMinPagado: parseInt(configSistema?.find(c => c.clave === 'renovacion_min_pagado')?.valor || '60'),
            umbralCpp: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_cuotas')?.valor || '4'),
            umbralMoroso: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_cuotas')?.valor || '7'),
            umbralCppOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_otros')?.valor || '1'),
            umbralMorosoOtros: parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_otros')?.valor || '2')
        }

        // 5. Cálculos
        const statsByAsesor = new Map<string, any>()
        equipoCompleto?.forEach((a: any) => {
            statsByAsesor.set(a.id, { id: a.id, nombre: a.nombre_completo, capitalActivo: 0, originalCapitalTotal: 0, moraMonto: 0, cuotasHoyTotal: 0, cuotasHoyPagado: 0, clientesActivos: new Set() })
        })

        let totalOriginalCapitalGlobal = 0, totalMoraGlobalMonto = 0, totalMetaHoyMonto = 0, totalMetaHoyPagado = 0, totalEfcMetaEquipo = 0, totalEfcPagadoEquipo = 0, totalCapitalEnRiesgoGlobal = 0, totalCapitalEnRiesgoTargeted = 0
        let prestamosHoyTotalContado = new Set<string>(), prestamosHoyPagadosContado = new Set<string>()

        const isToday = (date: string) => {
            if (!date) return false;
            try { return new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === today; } catch (e) { return false; }
        };

        prestamosRaw?.forEach(p => {
            // [FILTRO] Para metas y eficiencia de HOY, consideramos activos, legales y todos los estados de riesgo
            const isRelevantForToday = ['activo', 'legal', 'vencido', 'moroso', 'cpp'].includes(p.estado);
            if (!isRelevantForToday) return;

            const asesorId = clientToAsesorMap.get(p.cliente_id)
            if (!asesorId || !statsByAsesor.has(asesorId)) return
            const asesorData = statsByAsesor.get(asesorId)
            asesorData.clientesActivos.add(p.cliente_id)

            const metrics = calculateLoanMetrics(p, today, config)
            const isTargeted = targetAsesorIds.includes(asesorId)
            const montoCapitalOriginal = parseFloat(p.monto) || 0
            asesorData.originalCapitalTotal += montoCapitalOriginal
            if (isTargeted) totalOriginalCapitalGlobal += montoCapitalOriginal

            // ACUMULACIÓN GLOBAL (Para KPI de Mora Global - Siempre Global)
            totalMoraGlobalMonto += metrics.deudaExigibleTotal
            totalCapitalEnRiesgoGlobal += metrics.saldoPendiente
            
            if (isTargeted) {
                asesorData.moraMonto += metrics.deudaExigibleTotal
                asesorData.capitalActivo += metrics.saldoPendiente
                totalCapitalEnRiesgoTargeted += metrics.saldoPendiente
            }

            if (metrics.cuotaDiaProgramada > 0 && isTargeted) {
                prestamosHoyTotalContado.add(p.id)
                totalMetaHoyMonto += metrics.cuotaDiaProgramada
                totalMetaHoyPagado += metrics.cobradoRutaHoy
                if (metrics.cobradoRutaHoy >= metrics.cuotaDiaProgramada - 0.1) prestamosHoyPagadosContado.add(p.id)
            }

            asesorData.cuotasHoyTotal += metrics.metaTotalHoyYAtrasados; 
            asesorData.cuotasHoyPagado += metrics.cobradoTotalHoyYAtrasados;
            if (isTargeted) { 
                totalEfcMetaEquipo += metrics.metaTotalHoyYAtrasados; 
                totalEfcPagadoEquipo += metrics.cobradoTotalHoyYAtrasados; 
            }
        })

        // Métricas Finales
        let totalRenovables = 0, totalAlertaCritica = 0, totalAdvertencia = 0, totalVencidos = 0;
        // 5. Cálculos de Resumen Operativo (Mes Actual) - Filtros estrictos
        const nowPeru = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
        const firstOfMonth = new Date(nowPeru.getFullYear(), nowPeru.getMonth(), 1).toISOString();
        
        // --- NUEVA LÓGICA DE ACTIVOS (Sincronizada con Cobranza Vigente) ---
        // Necesitamos identificar préstamos producto de refinanciamiento para excluirlos
        const { data: renovacionesRefinanciamiento } = await supabaseAdmin
            .from('renovaciones')
            .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
        
        const prestamoIdsProductoRefinanciamiento = new Set(
            (renovacionesRefinanciamiento || [])
                .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
                .map((r: any) => r.prestamo_nuevo_id as string)
                .filter(Boolean)
        )

        const clientesConActivoVigente = new Set<string>();
        const clientesConDeudaCualquiera = new Set<string>();
        const clientesAptosUnicos = new Set<string>();
        const clientesCriticosUnicos = new Set<string>();
        const clientesAdvertenciaUnicos = new Set<string>();
        const clientesVencidosUnicos = new Set<string>();
        let totalVencidosPrestamos = 0;

        const loansByClient = new Map<string, any[]>();
        prestamosRaw?.forEach(p => {
            const list = loansByClient.get(p.cliente_id) || [];
            list.push(p);
            loansByClient.set(p.cliente_id, list);
        });

        loansByClient.forEach((clientLoans, clienteId) => {
            const asesorIdForClient = clientToAsesorMap.get(clienteId);
            const isTargeted = targetAsesorIds.includes(asesorIdForClient || '');
            if (!isTargeted) return;

            // Ordenar por fecha de creación descendente para tener el más reciente primero
            const sortedLoans = [...clientLoans].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            const latestLoan = sortedLoans[0];
            const p = latestLoan; // El préstamo de referencia para métricas globales de cliente

            if (p.estado === 'activo') {
                clientesConDeudaCualquiera.add(p.cliente_id);
            }

            const metrics = calculateLoanMetrics(p, today, config);
            
            // REGLAS PARA SER CONSIDERADO "ACTIVO VIGENTE"
            const isMainLoan = !p.es_paralelo;
            const isNotRefinancedProduct = !prestamoIdsProductoRefinanciamiento.has(p.id);
            
            const cronograma = p.cronograma_cuotas || [];
            const sortedCronograma = [...cronograma].sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());
            const lastDate = sortedCronograma.length > 0 ? sortedCronograma[sortedCronograma.length - 1].fecha_vencimiento : null;
            const isActuallyVencido = lastDate && lastDate < today && metrics.saldoPendiente > 1.0 && metrics.cuotasAtrasadas > 0;
            const isNotVencido = !isActuallyVencido;
            const hasBalance = metrics.saldoPendiente > 0.01;
            
            const activeLoans = sortedLoans.filter(l => ['activo', 'legal', 'vencido', 'moroso', 'cpp'].includes(l.estado));
            const finishedLoans = sortedLoans.filter(l => ['finalizado', 'completado'].includes(l.estado));
            
            // 1. Lógica de Aptos (Renovables) - Por CLIENTE
            let isApto = false;
            if (activeLoans.length > 0) {
                isApto = activeLoans.some(l => calculateLoanMetrics(l, today, config).esRenovable && !l.clientes?.bloqueado_renovacion);
            } else if (finishedLoans.length > 0) {
                isApto = calculateLoanMetrics(finishedLoans[0], today, config).esRenovable && !finishedLoans[0].clientes?.bloqueado_renovacion;
            }

            if (isApto) clientesAptosUnicos.add(clienteId);

            // 2. Lógica de Estados (Vencido, Crítico, Mora)
            let clientIsVencido = false;
            let clientIsCritico = false;
            let clientIsMora = false;

            activeLoans.forEach(loan => {
                const metrics = calculateLoanMetrics(loan, today, config);
                const crono = loan.cronograma_cuotas || [];
                const sortedCrono = [...crono].sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());
                const lastDate = sortedCrono.length > 0 ? sortedCrono[sortedCrono.length - 1].fecha_vencimiento : null;
                
                const actuallyVencido = (lastDate && lastDate < today && metrics.saldoPendiente > 1.0 && metrics.cuotasAtrasadas > 0) || ['vencido', 'moroso', 'cpp'].includes(loan.estado);
                
                if (actuallyVencido) {
                    clientIsVencido = true;
                    totalVencidosPrestamos++;
                } else if (metrics.isCritico) clientIsCritico = true;
                else if (metrics.isMora) clientIsMora = true;

                // Para Cartera Vigente
                const isMainLoan = !loan.es_paralelo;
                const isNotRefinancedProduct = !prestamoIdsProductoRefinanciamiento.has(loan.id);
                if (isMainLoan && isNotRefinancedProduct && !actuallyVencido && metrics.saldoPendiente > 0.01) {
                    clientesConActivoVigente.add(clienteId);
                }
                clientesConDeudaCualquiera.add(clienteId);
            });

            if (clientIsVencido) clientesVencidosUnicos.add(clienteId);
            else if (clientIsCritico) clientesCriticosUnicos.add(clienteId);
            else if (clientIsMora) clientesAdvertenciaUnicos.add(clienteId);
        });

        totalRenovables = clientesAptosUnicos.size;
        totalVencidos = totalVencidosPrestamos; 
        totalAlertaCritica = clientesCriticosUnicos.size;
        totalAdvertencia = clientesAdvertenciaUnicos.size;

        const targetClienteIds = clienteIds.filter(id => targetAsesorIds.includes(clientToAsesorMap.get(id) || ''));

        // Clientes Nuevos del Mes (Filtered)
        const { count: clientesNuevosMes } = await supabaseAdmin
            .from('clientes')
            .select('*', { count: 'exact', head: true })
            .in('asesor_id', targetAsesorIds)
            .gte('created_at', firstOfMonth)

        // Renovaciones del Mes (Filtered via Financial Records)
        const { count: renovacionesMes } = await supabaseAdmin
            .from('renovaciones')
            .select('id, prestamo_nuevo:prestamo_nuevo_id!inner(clientes!inner(asesor_id))', { count: 'exact', head: true })
            .in('prestamo_nuevo.clientes.asesor_id', targetAsesorIds)
            .gte('fecha_renovacion', firstOfMonth)

        // Refinanciamientos del Mes (Filtered by loan status change and advisor)
        const { count: refinanciamientosMes } = await supabaseAdmin
            .from('prestamos')
            .select('id, clientes!inner(asesor_id)', { count: 'exact', head: true })
            .in('clientes.asesor_id', targetAsesorIds)
            .eq('estado', 'refinanciado')
            .gte('updated_at', firstOfMonth)

        // Clientes Bloqueados / Restringidos (Filtered)
        const { count: clientesBloqueados } = await supabaseAdmin
            .from('clientes')
            .select('*', { count: 'exact', head: true })
            .in('asesor_id', targetAsesorIds)
            .eq('bloqueado_renovacion', true)

        // Pendientes
        const { data: solicitudes } = await supabaseAdmin.from('solicitudes').select(`id, monto_solicitado, created_at, cliente:cliente_id(nombres), asesor:asesor_id(nombre_completo)`).in('asesor_id', asesorIds).eq('estado_solicitud', 'pendiente_supervision').limit(5)
        const { data: renovaciones } = await supabaseAdmin.from('renovaciones').select(`id, monto_nuevo, created_at, cliente:cliente_id(nombres), asesor:asesor_id(nombre_completo)`).in('asesor_id', asesorIds).eq('estado', 'pendiente_supervision').limit(5)

        const moraBancariaGlobal = calculateMoraBancaria(prestamosRaw || [], today);
        const asesoresList = Array.from(statsByAsesor.values()).map(a => ({
            ...a,
            clientesActivos: a.clientesActivos.size,
            eficienciaHoy: a.cuotasHoyTotal > 0 ? (a.cuotasHoyPagado / a.cuotasHoyTotal) * 100 : 0
        }))

        return NextResponse.json({
            teamSummary: {
                totalAsesores: equipoCompleto?.length || 0,
                totalClientes: clienteIds.filter(id => targetAsesorIds.includes(clientToAsesorMap.get(id) || '')).length,
                totalCapitalActivo: Math.round(totalCapitalEnRiesgoTargeted),
                moraGlobal: moraBancariaGlobal.tasaMorosidadCapital,
                moraMontoGlobal: moraBancariaGlobal.capitalVencido,
                eficienciaHoy: totalEfcMetaEquipo > 0 ? (totalEfcPagadoEquipo / totalEfcMetaEquipo) * 100 : 0,
                eficienciaMonto: totalEfcMetaEquipo,
                eficienciaPagado: totalEfcPagadoEquipo,
                metaHoyMonto: totalMetaHoyMonto,
                metaHoyPagado: totalMetaHoyPagado,
                metaHoyPrestamosTotal: prestamosHoyTotalContado.size,
                metaHoyPrestamosPagados: prestamosHoyPagadosContado.size,
                renovacionesMes: renovacionesMes || 0,
                clientesNuevosMes: clientesNuevosMes || 0,
                clientesBloqueados: clientesBloqueados || 0,
                refinanciamientosMes: refinanciamientosMes || 0,
                totalRenovables,
                totalInactivos: clienteIds.filter(cid => targetAsesorIds.includes(clientToAsesorMap.get(cid) || '') && !clientesConDeudaCualquiera.has(cid)).length,
                totalAlertaCritica,
                totalAdvertencia,
                totalVencidos,
                totalClientesConDeudaActiva: clientesConActivoVigente.size
            },
            asesores: asesoresList,
            supervisores: supervisoresDisplay,
            pendientes: {
                solicitudes: solicitudes || [],
                renovaciones: renovaciones || []
            }
        }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            }
        })
    } catch (error: any) {
        console.error('Error:', error)
        return NextResponse.json({ error: 'Error interno', details: error.message }, { status: 500 })
    }
}
