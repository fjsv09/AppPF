import { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import { PrestamosTable } from "@/components/prestamos/prestamos-table";
import { TableSkeleton } from "@/components/prestamos/table-skeleton";
import { AdminLoanActions } from "@/components/prestamos/admin-loan-actions";
import { BackButton } from "@/components/ui/back-button";
import { getTodayPeru, calculateLoanMetrics, calculateMoraBancaria } from "@/lib/financial-logic";
import { KpiCards } from "@/components/prestamos/kpi-cards";
import { DashboardAlerts } from "@/components/dashboard/dashboard-alerts";
import { checkAdvisorBlocked } from "@/utils/checkAdvisorBlocked";

export const metadata: Metadata = {
    title: 'Panel de Préstamos'
}

export default async function PrestamosPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
    const sParams = searchParams;
    const filtroSupervisor = sParams.supervisor as string || 'todos';
    const filtroAsesor = sParams.asesor as string || 'todos';
    const filtroSector = sParams.sector as string || 'todos';
    const filtroFrecuencia = sParams.frecuencia as string || 'todos';
    const searchQuery = ((sParams.search as string) || '').trim();
    const activeTab = sParams.tab as string;

    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();

    // Get current user and role
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol, exigir_gps_cobranza')
        .eq('id', user?.id)
        .single()

    const userRole = perfil?.rol || 'asesor'
    const exigirGpsCobranza = !!perfil?.exigir_gps_cobranza

    // RESTRICCIÓN POR URL: Solo admin y secretaria pueden ver historial (se mantiene)
    const restrictedTabs = ['finalizados', 'renovados', 'refinanciados', 'anulados', 'pendientes', 'todos'];
    if (userRole !== 'admin' && userRole !== 'secretaria' && activeTab && restrictedTabs.includes(activeTab)) {
        redirect('/dashboard/prestamos?tab=ruta_hoy');
    }

    // [REFORZADO] Lógica de Acceso al Sistema (Centralizada)
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const accessResult = await checkSystemAccess(supabaseAdmin, user?.id || '', userRole || 'asesor', 'prestamo')

    const isBlockedByCuadre = !accessResult.allowed && userRole !== 'admin'
    const blockReasonCierre = accessResult.reason || ''
    const systemAccess = accessResult // Pasa el objeto completo para saber el 'code'

    // [NUEVO] Obtener información de bloqueos de deuda histórica
    let blockInfo = null
    if (userRole === 'asesor' && user?.id) {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id)
    }

    // Build query based on role - USING DIRECT TABLES (Fallback mechanism)
    
    // 0. Auto-update Mora Status (Robot)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('actualizar_estados_mora')
    if (rpcError) console.error('Error running Mora Robot:', rpcError)
    else console.log('🤖 Mora Robot Result:', rpcResult)

    const selectedDate = (sParams.fecha as string) || getTodayPeru()

    // Pre-filtrar cliente_ids para roles no-admin (evita cargar todos los préstamos en memoria)
    let clienteIdFilter: string[] | null = null
    if (userRole === 'asesor' && user?.id) {
        const { data: misClientes } = await supabaseAdmin
            .from('clientes').select('id').eq('asesor_id', user.id)
        clienteIdFilter = misClientes?.map((c: any) => c.id) || []
    } else if (userRole === 'supervisor' && user?.id) {
        const { data: misAsesores } = await supabaseAdmin
            .from('perfiles').select('id').eq('supervisor_id', user.id)
        const asesorIds = misAsesores?.map((a: any) => a.id) || []
        if (asesorIds.length > 0) {
            const { data: misClientes } = await supabaseAdmin
                .from('clientes').select('id').in('asesor_id', asesorIds)
            clienteIdFilter = misClientes?.map((c: any) => c.id) || []
        }
    } else if (filtroAsesor !== 'todos') {
        const { data: misClientes } = await supabaseAdmin
            .from('clientes').select('id').eq('asesor_id', filtroAsesor)
        clienteIdFilter = misClientes?.map((c: any) => c.id) || []
    } else if ((userRole === 'admin' || userRole === 'secretaria') && filtroSupervisor !== 'todos') {
        const { data: subAsesores } = await supabaseAdmin
            .from('perfiles').select('id').eq('supervisor_id', filtroSupervisor)
        const asesorIds = subAsesores?.map((a: any) => a.id) || []
        if (asesorIds.length > 0) {
            const { data: misClientes } = await supabaseAdmin
                .from('clientes').select('id').in('asesor_id', asesorIds)
            clienteIdFilter = misClientes?.map((c: any) => c.id) || []
        }
    }

    // Step 1: Fetch préstamos con filtros a nivel DB
    let prestamosQuery = supabaseAdmin
        .from('prestamos')
        .select(`
            *,
            clientes (
                *,
                sectores (id, nombre),
                solicitudes (gps_coordenadas, created_at),
                asesor:asesor_id(nombre_completo)
            ),
            gestiones (
                id,
                tipo_gestion,
                resultado,
                notas,
                created_at,
                usuario_id
            ),
            visitas_terreno (
                id,
                estado,
                cumple_minimo,
                notas,
                fecha_inicio,
                asesor_id
            ),
            observacion_supervisor
        `)
        .order('created_at', { ascending: false })
        .limit(5000)

    // Filtro de sector a nivel DB
    if (filtroSector !== 'todos') {
        const { data: clientesSector } = await supabaseAdmin
            .from('clientes').select('id').eq('sector_id', filtroSector)
        const sectorClienteIds = clientesSector?.map((c: any) => c.id) || []
        if (clienteIdFilter) {
            clienteIdFilter = clienteIdFilter.filter(id => sectorClienteIds.includes(id))
        } else {
            clienteIdFilter = sectorClienteIds
        }
    }

    // Filtro de búsqueda server-side: nombres/dni del cliente. Evita el límite de filas
    // de PostgREST cuando la base crece (no dependemos de cargar todos los préstamos).
    // Mínimo 2 caracteres para no disparar queries demasiado amplias.
    if (searchQuery.length >= 2) {
        // Sanitizar wildcards de PostgREST (% y _) en el término de búsqueda
        const sanitized = searchQuery.replace(/[%_]/g, m => `\\${m}`)
        const { data: matchingClientes } = await supabaseAdmin
            .from('clientes')
            .select('id')
            .or(`nombres.ilike.%${sanitized}%,dni.ilike.%${sanitized}%`)
            .limit(2000)
        const searchClienteIds = (matchingClientes || []).map((c: any) => c.id)

        // Soporte adicional: búsqueda por prefijo de UUID de préstamo (≥8 hex chars)
        if (/^[0-9a-fA-F-]{8,}$/.test(searchQuery)) {
            const { data: matchingPrestamos } = await supabaseAdmin
                .from('prestamos')
                .select('cliente_id')
                .ilike('id', `${searchQuery}%`)
                .limit(500)
            for (const p of (matchingPrestamos || [])) {
                if (p.cliente_id && !searchClienteIds.includes(p.cliente_id)) {
                    searchClienteIds.push(p.cliente_id)
                }
            }
        }

        if (clienteIdFilter !== null) {
            const filterSet = new Set(clienteIdFilter)
            clienteIdFilter = searchClienteIds.filter(id => filterSet.has(id))
        } else {
            clienteIdFilter = searchClienteIds
        }
    }

    if (clienteIdFilter !== null) {
        if (clienteIdFilter.length === 0) {
            // Sin clientes en scope → retornar vacío
            prestamosQuery = prestamosQuery.in('cliente_id', ['00000000-0000-0000-0000-000000000000'])
        } else {
            // Chunked para respetar límite de URL
            // Usamos el primer chunk; si hay más de 500 clientes, usamos la primera mitad del filtro
            // (para scopes muy grandes, mejor sin filtro que truncado)
            if (clienteIdFilter.length <= 150) {
                prestamosQuery = prestamosQuery.in('cliente_id', clienteIdFilter)
            }
        }
    }

    // Filtro de frecuencia a nivel DB
    if (filtroFrecuencia !== 'todos') {
        prestamosQuery = prestamosQuery.eq('frecuencia', filtroFrecuencia)
    }

    const { data: prestamosRaw, error } = await prestamosQuery

    if (error) {
        console.error('Error fetching loans:', error)
        return <div className="p-8 text-center text-red-500 font-bold">Error al cargar préstamos: {error.message}</div>;
    }

    // [NUEVO] Step 1.5: Cargar TODOS los préstamos globales para mora (sin filtros de rol) - admin only
    let prestamosGlobal = prestamosRaw // Default: usar los mismos que se muestran
    if (userRole === 'admin' || userRole === 'secretaria') {
        const { data: allPrestamos, error: allError } = await supabaseAdmin
            .from('prestamos')
            .select(`
                id,
                estado,
                monto,
                interes,
                numero_cuotas,
                cuotas,
                cronograma_cuotas (
                    id,
                    fecha_vencimiento,
                    estado,
                    monto_cuota,
                    monto_pagado
                )
            `)
            .in('estado', ['activo', 'vencido', 'moroso', 'cpp', 'legal'])
            .limit(10000)

        if (!allError && allPrestamos) {
            prestamosGlobal = allPrestamos
            console.log(`🌍 Préstamos Global (para mora): ${prestamosGlobal.length} total`)
        }
    }

    // Step 2: Fetch cronograma_cuotas para TODOS los préstamos
    // Se necesita para calcular cuotas vencidas hoy (META HOY) incluyendo préstamos finalizados/renovados
    const ESTADOS_ARCHIVADOS = ['finalizado', 'renovado', 'refinanciado', 'anulado', 'castigado']
    const idsConCronograma = prestamosRaw
        ?.map(p => p.id) || []

    const cuotasByLoan = new Map<string, any[]>()
    const chunkSize = 35

    for (let i = 0; i < idsConCronograma.length; i += chunkSize) {
        const chunk = idsConCronograma.slice(i, i + chunkSize)
        const { data: cuotasChunk, error: cuotasError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select(`
                *,
                pagos (id, created_at, monto_pagado, metodo_pago, voucher_compartido, latitud, longitud, registrado_por, estado_verificacion)
            `)
            .in('prestamo_id', chunk)
            .limit(5000)

        if (cuotasError) {
            console.error(`Error fetching cuotas chunk ${i / chunkSize}:`, cuotasError)
        } else if (cuotasChunk) {
            cuotasChunk.forEach((c: any) => {
                const list = cuotasByLoan.get(c.prestamo_id) || []
                list.push(c)
                cuotasByLoan.set(c.prestamo_id, list)
            })
        }
    }

    // Merge cuotas — archivados quedan con [] (sin cronograma, se usan métricas aproximadas)
    prestamosRaw?.forEach(p => {
        p.cronograma_cuotas = cuotasByLoan.get(p.id) || []
    })

    console.log(`📉 Préstamos: ${prestamosRaw?.length} total, ${idsConCronograma.length} con cronograma`)

    // Una sola query para toda la configuración (era 2 queries secuenciales)
    const { data: configTodo } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', [
            'renovacion_min_pagado', 'refinanciacion_min_mora',
            'umbral_cpp_cuotas', 'umbral_moroso_cuotas', 'umbral_cpp_otros', 'umbral_moroso_otros',
            'horario_apertura', 'horario_cierre', 'horario_fin_turno_1', 'desbloqueo_hasta'
        ])

    const cfg = (k: string) => configTodo?.find(c => c.clave === k)?.valor
    const renovacionMinPagado = cfg('renovacion_min_pagado') ? parseInt(cfg('renovacion_min_pagado')!) : 60
    const refinanciacionMinMora = cfg('refinanciacion_min_mora') ? parseInt(cfg('refinanciacion_min_mora')!) : 50
    const umbralCpp = parseInt(cfg('umbral_cpp_cuotas') || '4')
    const umbralMoroso = parseInt(cfg('umbral_moroso_cuotas') || '7')
    const umbralCppOtros = parseInt(cfg('umbral_cpp_otros') || '1')
    const umbralMorosoOtros = parseInt(cfg('umbral_moroso_otros') || '2')

    const systemSchedule = {
        horario_apertura: cfg('horario_apertura') || '07:00',
        horario_cierre: cfg('horario_cierre') || '20:00',
        horario_fin_turno_1: cfg('horario_fin_turno_1') || '13:30',
        desbloqueo_hasta: cfg('desbloqueo_hasta') || ''
    }

    // --- DATA PARA DESEMBOLSO (Admin & Supervisor) ---
    let cuentasAdmin: any[] = []
    if (userRole === 'admin' || userRole === 'supervisor' || userRole === 'secretaria') {
        const { data: qAdmin } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('id, nombre, saldo, cartera_id, usuarios_autorizados')
            .order('nombre')
        
        if (userRole === 'admin') {
            // El admin solo quiere ver cuentas globales/propias, ocultando las de los asesores
            cuentasAdmin = (qAdmin || []).filter((c: any) => 
                !c.nombre.startsWith('Cobranzas - Cartera ')
            )
        } else {
            // Supervisores/Secretarias: Filtrar solo cuentas compartidas y de la cartera global
            cuentasAdmin = (qAdmin || []).filter((c: any) => 
                c.cartera_id === '00000000-0000-0000-0000-000000000000' || 
                (c.usuarios_autorizados && c.usuarios_autorizados.length > 0)
            )
        }

    }


    // Fetch Feriados
    const { data: feriadosRaw } = await supabaseAdmin
        .from('feriados')
        .select('fecha')
    const feriados = (feriadosRaw || []).map(f => {
        if (typeof f.fecha === 'string') return f.fecha.split('T')[0]
        if (f.fecha instanceof Date) return f.fecha.toISOString().split('T')[0]
        return String(f.fecha)
    })

    // Obtener IDs de préstamos con solicitudes de renovación pendientes
    const { data: solicitudesPendientes } = await supabaseAdmin
        .from('solicitudes_renovacion')
        .select('prestamo_id')
        .in('estado_solicitud', ['pendiente_supervision', 'en_correccion', 'pre_aprobado'])
    const prestamoIdsConSolicitudPendiente = solicitudesPendientes?.map(s => s.prestamo_id) || []

    // Obtener IDs de préstamos que son producto de una refinanciación directa
    const { data: renovacionesRefinanciamiento } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
    const prestamoIdsProductoRefinanciamiento = (renovacionesRefinanciamiento || [])
        .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
        .map((r: any) => r.prestamo_nuevo_id as string)
        .filter(Boolean)

    // Obtener IDs de préstamos con tareas de evidencia pendientes (asesor no ha subido la evidencia
    // del préstamo). Excluimos auditorías dirigidas/auditorías para que el chip solo refleje la
    // evidencia del préstamo en sí.
    const { data: tareasEvidenciaPendientes } = await supabaseAdmin
        .from('tareas_evidencia')
        .select('prestamo_id, evidencia_url, tipo')
        .eq('estado', 'pendiente')
        .is('evidencia_url', null)
        .not('prestamo_id', 'is', null)
        .not('tipo', 'in', '(auditoria_dirigida,auditoria)')
    const prestamoIdsConEvidenciaPendiente = Array.from(
        new Set((tareasEvidenciaPendientes || []).map((t: any) => t.prestamo_id).filter(Boolean))
    )

    // Filtros de role/asesor/sector/frecuencia ya aplicados a nivel DB arriba.
    // Solo se necesita filtro residual para el caso de admin con scope amplio sin filtro de cliente.
    let filteredList = prestamosRaw || []

    // Filtro residual en memoria solo si clienteIdFilter > 150 (no se pudo aplicar en DB)
    if (clienteIdFilter !== null && clienteIdFilter.length > 150) {
        const filterSet = new Set(clienteIdFilter)
        filteredList = filteredList.filter(p => filterSet.has(p.cliente_id))
    }

    // 1.5. Calculate loan Management Map for Renewal Logic 
    // Computed over filteredList (so it respects advisor scope)
    const loanManagementMap = filteredList.reduce((acc: Record<string, {hasActive: boolean, latestLoanId: string}>, curr: any) => {
        const cId = curr.cliente_id || curr.clientes?.id
        if (!cId) return acc
        if (!acc[cId]) {
            acc[cId] = { 
                hasActive: false,
                latestLoanId: curr.id // First one encountered is latest due to DESC sort
            }
        }
        if (curr.estado === 'activo') {
            acc[cId].hasActive = true
        }
        return acc
    }, {})

    // 2.1 Fetch Perfiles (needed before mapping for asesorBloqueoMap)
    let perfiles: any[] = []
    let asesorBloqueoMap: Record<string, boolean> = {}
    if (userRole === 'admin' || userRole === 'supervisor' || userRole === 'secretaria') {
        const { data: profiles } = await supabaseAdmin
            .from('perfiles')
            .select('*')
        perfiles = profiles || []
        
        // Build map of asesor_id -> pagos_bloqueados for admin block toggle
        if (userRole === 'admin') {
            perfiles.forEach((p: any) => {
                if (p.rol === 'asesor' || p.rol === 'supervisor') {
                    asesorBloqueoMap[p.id] = !!p.pagos_bloqueados
                }
            })
        }
    }

    // 2. KPI Calculation & Mapping
    const prestamos = filteredList.map(p => {
        const referenceDate = selectedDate
        const metrics = calculateLoanMetrics(p, referenceDate, {
            renovacionMinPagado,
            umbralCpp,
            umbralMoroso,
            umbralCppOtros,
            umbralMorosoOtros
        })

        const totalPagar = p.monto * (1 + (p.interes / 100))



        // Extract Coordinates
        const solicitudesCoords = p.clientes?.solicitudes
            ?.filter((s: any) => {
                if (!s.gps_coordenadas) return false;
                const [lat, lng] = s.gps_coordenadas.split(',').map((c: string) => parseFloat(c.trim()));
                return !isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001);
            })
            ?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        const gps_coordenadas = solicitudesCoords?.[0]?.gps_coordenadas || null

        return {
            ...p,
            cliente_id: p.clientes?.id,
            cliente_nombre: p.clientes?.nombres,
            cliente_dni: p.clientes?.dni,
            asesor_id: p.clientes?.asesor_id,
            asesor_nombre: p.clientes?.asesor?.nombre_completo,
            gps_coordenadas,
            
            deuda_exigible_hoy: metrics.deudaExigibleHoy,
            cuota_dia_hoy: metrics.cuotaDiaHoy,
            cuota_dia_programada: metrics.cuotaDiaProgramada,
            cobrado_hoy: metrics.cobradoHoy,
            cobrado_ruta_hoy: metrics.cobradoRutaHoy,
            total_pagado_acumulado: metrics.totalPagadoAcumulado,
            riesgo_capital_real_porcentaje: metrics.riesgoPorcentaje,
            dias_sin_pago: metrics.diasSinPago,
            valor_cuota_promedio: metrics.valorCuotaPromedio,
            cuotas_mora_real: metrics.cuotasAtrasadas,
            saldo_cuota_parcial: metrics.saldoCuotaParcial,
            
            es_renovable: metrics.esRenovable,
            isFinalizado: p.estado === 'finalizado',
            
            // Attach metrics for optimized aggregate calculation
            metrics: metrics,
            
            clientes: {
                ...p.clientes,
                // Attach asesor block status for admin toggle UI
                asesor_pagos_bloqueados: asesorBloqueoMap[p.clientes?.asesor_id] || false
            }
        }
    })

    // 2.5 Compute Strict Renewal Eligibility (es_renovable_estricto)
    prestamos.forEach(prestamo => {
        const clienteId = prestamo.cliente_id || prestamo.clientes?.id
        const mgmt = loanManagementMap[clienteId]
        
        let esRenovableEstricto = false;
        
        const evaluateEligibility = () => {
            if (!mgmt) return false

            const isClientBlocked = !!prestamo.clientes?.bloqueado_renovacion
            if (isClientBlocked) return false // No se cuentan como renovables si el cliente está bloqueado
            
            // Regla para Préstamos Migrados:
            // Si es migrado y ya no tiene saldo pendiente (efectivamente finalizado), 
            // solo permitimos la renovación si es el registro más reciente de ese cliente.
            const isMigrado = (prestamo.observacion_supervisor || '').includes('Préstamo migrado') || (prestamo.observacion_supervisor || '').includes('[MIGRACIÓN]')
            const isEffectivelyFinalized = prestamo.estado === 'finalizado' || 
                                         prestamo.estado === 'renovado' || 
                                         (prestamo.saldo_pendiente <= 0.01 && typeof prestamo.saldo_pendiente === 'number')

            if (isMigrado && isEffectivelyFinalized) {
                if (mgmt && prestamo.id !== mgmt.latestLoanId) return false
            }

            if (prestamoIdsConSolicitudPendiente.includes(prestamo.id)) return false
            if (!['activo', 'finalizado'].includes(prestamo.estado)) return false

            // Reglas de Negocio Estrictas:
            // 1. Solo se puede renovar el préstamo más reciente (si tiene varios finalizados/migrados)
            if (mgmt && prestamo.id !== mgmt.latestLoanId) return false

            // 2. Si el préstamo está finalizado pero el cliente ya tiene otro préstamo ACTIVO, el viejo no es renovable
            if (prestamo.estado === 'finalizado' && mgmt.hasActive) return false

            // Role based rules (Paralelos)
            const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor'
            if (!isAdminOrSupervisor) {
                if (prestamo.es_paralelo) return false
            }

            const isRefinanciado = prestamo.estado === 'refinanciado'
            const isFinalizado = prestamo.estado === 'finalizado' || prestamo.isFinalizado || (prestamo.saldo_pendiente <= 0 && typeof prestamo.saldo_pendiente === 'number')
            
            const totalPagar = prestamo.monto * (1 + (prestamo.interes / 100))
            const pagado = prestamo.total_pagado_acumulado || 0
            const porcentajePagado = totalPagar > 0 ? (pagado / totalPagar) : 0
            
            const limitePorcentaje = typeof renovacionMinPagado === 'number' ? renovacionMinPagado : 60
            const umbralRenovacion = limitePorcentaje / 100
            const cumpleUmbral = porcentajePagado >= umbralRenovacion && porcentajePagado > 0.01

            const limiteMora = typeof refinanciacionMinMora === 'number' ? refinanciacionMinMora : 50
            const valorCuotaPromedio = parseFloat(prestamo.valor_cuota_promedio || 0)
            const calculatedTotalCuotas = valorCuotaPromedio > 0 ? Math.round(totalPagar / valorCuotaPromedio) : 0
            const totalCuotasCalc = prestamo.numero_cuotas || calculatedTotalCuotas || 30
            const porcentajeMora = (totalCuotasCalc > 0) ? ((prestamo.cuotas_mora_real || 0) / totalCuotasCalc) * 100 : 0
            
            // Administrador y Supervisor pueden VER la opción de refinanciamiento directo
            const esCandidatoRefinanciacionAdmin = (porcentajeMora >= limiteMora) && isAdminOrSupervisor

            const isReady = isFinalizado || esCandidatoRefinanciacionAdmin || cumpleUmbral
            if (!isReady) return false

            if (isRefinanciado) return false
            const esProductoDeRefinanciamiento = prestamoIdsProductoRefinanciamiento.includes(prestamo.id)
            if (esProductoDeRefinanciamiento) return false

            const estadosProhibidos = ['legal', 'castigado']
            if (estadosProhibidos.includes(prestamo.estado_mora || '')) return false
            
            if (prestamo.estado_mora === 'vencido' && !isAdminOrSupervisor && !cumpleUmbral) return false

            return true
        }

        prestamo.es_renovable_estricto = evaluateEligibility()
    })

    // 3. Totals for PrestamosTable props
    const totalPrestado = prestamos.filter(p => p.estado === 'activo').reduce((acc, p) => {
        const deudaTotal = (parseFloat(p.monto) * (1 + (parseFloat(p.interes)/100)))
        const pagado = p.total_pagado_acumulado || 0
        return acc + Math.max(0, deudaTotal - pagado)
    }, 0)

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const capitalEnRiesgo = calculateMoraBancaria(prestamos, today).capitalVencido

    // Perfiles ya cargados arriba (sección 2.1)

    return (
        <div className="page-container">
            <DashboardAlerts 
                userId={user?.id || ''} 
                blockInfo={blockInfo} 
                accessInfo={accessResult} 
            />

            {/* Header with Title and Action Button */}
            {/* Header with Title and Subtitle */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-4">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Panel de Préstamos</h1>
                            <p className="page-subtitle">
                                {(userRole === 'admin' || userRole === 'secretaria') ? 'Visión Global y Rentabilidad' : 
                                 userRole === 'supervisor' ? 'Supervisión de Riesgo y Alertas' : 
                                 'Gestión Diaria de Cobranza'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Acciones de Admin (Creación Directa) */}
                {userRole === 'admin' && (
                    <AdminLoanActions 
                        cuentas={cuentasAdmin}
                        feriados={feriados}
                    />
                )}
            </div>

            {/* KPI Cards + Alerts Bar (client component, reactive to filters) */}
            <Suspense fallback={<div className="h-52 mb-6 animate-pulse rounded-xl bg-slate-900/20" />}>
                <KpiCards
                    prestamos={prestamos}
                    prestamosGlobal={prestamosGlobal}
                    perfiles={perfiles}
                    userRole={userRole}
                    prestamoIdsProductoRefinanciamiento={prestamoIdsProductoRefinanciamiento}
                    today={today}
                    umbralCpp={umbralCpp}
                    umbralMoroso={umbralMoroso}
                    umbralCppOtros={umbralCppOtros}
                    umbralMorosoOtros={umbralMorosoOtros}
                />
            </Suspense>

            <div className="mt-4 space-y-6">
                <Suspense fallback={<TableSkeleton />}>
                    <PrestamosTable 
                        prestamos={prestamos || []} 
                        today={today}
                        selectedDate={selectedDate}
                        totalPrestado={totalPrestado}
                        overdueAmount={capitalEnRiesgo}
                        perfiles={perfiles || []}
                        userRol={userRole}
                        userId={user?.id}
                        prestamoIdsConSolicitudPendiente={prestamoIdsConSolicitudPendiente}
                        prestamoIdsConEvidenciaPendiente={prestamoIdsConEvidenciaPendiente}
                        renovacionMinPagado={renovacionMinPagado}
                        refinanciacionMinMora={refinanciacionMinMora}
                        prestamoIdsProductoRefinanciamiento={prestamoIdsProductoRefinanciamiento}
                        systemSchedule={systemSchedule}
                        umbralCpp={umbralCpp}
                        umbralMoroso={umbralMoroso}
                        umbralCppOtros={umbralCppOtros}
                        umbralMorosoOtros={umbralMorosoOtros}
                        isBlockedByCuadre={isBlockedByCuadre}
                        blockReasonCierre={blockReasonCierre}
                        systemAccess={systemAccess}
                        cuentas={cuentasAdmin || []}
                        exigirGpsCobranza={exigirGpsCobranza}
                    />
                </Suspense>
            </div>
        </div>
    )
}
