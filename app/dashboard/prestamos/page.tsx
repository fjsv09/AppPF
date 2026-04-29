import { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, TrendingUp, AlertCircle, Users, Trophy, CheckCircle2, ArrowUpRight, RotateCcw } from "lucide-react";
import { PrestamosTable } from "@/components/prestamos/prestamos-table";
import { TableSkeleton } from "@/components/prestamos/table-skeleton";
import { AdminLoanActions } from "@/components/prestamos/admin-loan-actions";
import { BackButton } from "@/components/ui/back-button";
import { getTodayPeru, calculateLoanMetrics, calculateMoraBancaria } from "@/lib/financial-logic";
import { cn } from "@/lib/utils";
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

    // Step 2: Fetch cronograma_cuotas SOLO para préstamos que aportan KPIs activos
    // Los finalizados/renovados/anulados no necesitan cronograma para los KPIs del día
    const ESTADOS_ARCHIVADOS = ['finalizado', 'renovado', 'refinanciado', 'anulado', 'castigado']
    const idsConCronograma = prestamosRaw
        ?.filter(p => !ESTADOS_ARCHIVADOS.includes(p.estado))
        .map(p => p.id) || []

    const cuotasByLoan = new Map<string, any[]>()
    const chunkSize = 200

    for (let i = 0; i < idsConCronograma.length; i += chunkSize) {
        const chunk = idsConCronograma.slice(i, i + chunkSize)
        const { data: cuotasChunk, error: cuotasError } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select(`
                *,
                pagos (id, created_at, monto_pagado, metodo_pago, voucher_compartido, latitud, longitud, registrado_por, estado_verificacion)
            `)
            .in('prestamo_id', chunk)

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

        // Para préstamos archivados sin cronograma: métricas aproximadas
        // Esto evita que total_pagado_acumulado = 0 y arruine los KPIs de renovación/recuperación
        const sinCronograma = ESTADOS_ARCHIVADOS.includes(p.estado) && (!p.cronograma_cuotas || p.cronograma_cuotas.length === 0)
        if (sinCronograma) {
            metrics.totalPagadoAcumulado = totalPagar  // Asumimos pagado completo
            metrics.saldoPendiente = 0
            metrics.cuotasAtrasadas = 0
            metrics.deudaExigibleHoy = 0
            metrics.cuotaDiaHoy = 0
            metrics.cuotaDiaProgramada = 0
            metrics.cobradoHoy = 0
            metrics.cobradoRutaHoy = 0
        }
        


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

    // 3. Totals for Dashboard
    // 3. Totals for Dashboard
    // Total Colocado = Cartera Activa (Total Pagar - Total Pagado de activos)
    const totalPrestado = prestamos.filter(p => p.estado === 'activo').reduce((acc, p) => {
        const deudaTotal = (parseFloat(p.monto) * (1 + (parseFloat(p.interes)/100)))
        const pagado = p.total_pagado_acumulado || 0
        return acc + Math.max(0, deudaTotal - pagado)
    }, 0)

    // --- NUEVA LÓGICA DE ACTIVOS (Sincronizada con Directorio de Clientes) ---
    // 1. Agrupar préstamos por cliente para identificar el principal
    const clientesMapActivos = new Map<string, any>()
    prestamos.forEach(p => {
        const cId = p.cliente_id
        if (!cId) return
        if (!clientesMapActivos.has(cId)) {
            clientesMapActivos.set(cId, [])
        }
        clientesMapActivos.get(cId).push(p)
    })

    const activeLoans = Array.from(clientesMapActivos.entries()).filter(([cId, loans]) => {
        const cliente = loans[0]?.clientes
        // Regla: No estar bloqueado para renovar
        if (!!cliente?.bloqueado_renovacion) return false

        // Buscar préstamo principal activo (no paralelo, no refinanciado)
        const mainActiveLoan = loans.find((p: any) => 
            p.estado === 'activo' && 
            !p.es_paralelo && 
            p.estado !== 'refinanciado' &&
            !prestamoIdsProductoRefinanciamiento.includes(p.id)
        )

        if (!mainActiveLoan) return false

        // Regla: No estar vencido
        if (mainActiveLoan.estado_mora === 'vencido') return false

        // Regla: Debe tener saldo pendiente
        const metrics = mainActiveLoan.metrics // Ya calculados arriba
        return (metrics?.saldoPendiente || 0) > 0.01
    }).length

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

    const totalPagado = prestamos.reduce((acc, p) => acc + (p.total_pagado_acumulado || 0), 0)
    const totalDeudaConInteres = prestamos.reduce((acc, p) => acc + (parseFloat(p.monto) * (1 + (parseFloat(p.interes)/100))), 0) || 1
    const porcentajeRecuperacion = (totalPagado / totalDeudaConInteres) * 100

    const moraBancaria = calculateMoraBancaria(prestamos, today);
    const tasaMorosidadCapital = moraBancaria.tasaMorosidadCapital;
    const capitalEnRiesgo = moraBancaria.capitalVencido;
    
    // Alertas Graves (Supervisor Rule):
    // Daily -> 7+ overdue. Other -> 2+ overdue.
    // Alertas Graves (Supervisor Rule):
    // Daily -> 7+ overdue. Other -> 2+ overdue.
    const alertasGraves = prestamos.filter(p => p.metrics?.isCritico).length
    
    // Mora (Supervisor Rule - Early Deterioration):
    const clientesEnMora = prestamos.filter(p => p.metrics?.isMora).length

    // Meta de Ruta Hoy: Suma de las cuotas programadas para hoy (fijo)
    // Meta de Ruta Hoy: Suma de las cuotas programadas para hoy (fijo)
    // [SINCRONIZADO] Consideramos activos, legales y estados de riesgo (como en Supervisión Central)
    const relevantForToday = prestamos.filter(p => ['activo', 'legal', 'vencido', 'moroso', 'cpp'].includes(p.estado))
    
    const metaCobranzaHoy = relevantForToday.reduce((acc: number, p: any) => acc + (p.cuota_dia_programada || 0), 0)
    const recaudadoTotalHoy = relevantForToday.reduce((acc: number, p: any) => acc + (p.cobrado_hoy || 0), 0)
    const recaudadoRutaHoy = relevantForToday.reduce((acc: number, p: any) => acc + (p.cobrado_ruta_hoy || 0), 0)
    
    // Pendientes Hoy: Clientes que tienen pago programado hoy > 0 y pendiente
    const clientesPendientesHoy = relevantForToday.filter(p => p.cuota_dia_hoy > 0).length
    const totalClientesHoy = relevantForToday.filter(p => (p.cuota_dia_programada || 0) > 0).length
    const clientesCobradosHoy = totalClientesHoy - clientesPendientesHoy
    
    // Use strictly evaluated property for perfectly synchronized counts
    const oportunidadesRenovacion = prestamos.filter(p => p.es_renovable_estricto).length

    // 4.5 Eficiencia de Cobranza CENTRALIZADA (Hoy + Atrasadas)
    let metaEficienciaTotal = 0
    let cobradoEficienciaTotal = 0

    relevantForToday.forEach(p => {
        metaEficienciaTotal += p.metrics.metaTotalHoyYAtrasados
        cobradoEficienciaTotal += p.metrics.cobradoTotalHoyYAtrasados
    })
    const porcentajeEficiencia = metaEficienciaTotal > 0 ? (cobradoEficienciaTotal / metaEficienciaTotal) * 100 : 0

    // Component Prop Compatibility
    const overdueAmount = metaCobranzaHoy

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

            {/* ---------------- KPI GRID (REORGANIZED COMPACT) ---------------- */}
            <div className={cn(
                "grid grid-cols-2 gap-2 md:gap-4 mb-6",
                (userRole === 'admin' || userRole === 'secretaria') ? "lg:grid-cols-6" : "lg:grid-cols-5"
            )}>
                {/* Meta Hoy Card (Uniform Size) */}
                <Link href={{ query: { ...sParams, tab: 'ruta_hoy', page: '1' } }} className="bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px] hover:bg-[#0d1421] transition-all group">
                     {/* Decorative background wallet icon */}
                     <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
                        <Wallet className="w-20 h-20 md:w-24 md:h-24 text-white" />
                     </div>
                     
                     <div className="relative z-10">
                        <p className="text-[#10b981] font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Meta Hoy</p>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg md:text-2xl font-black text-white tracking-tighter">${recaudadoRutaHoy.toLocaleString()}</span>
                           <span className="text-slate-600 text-[9px] md:text-sm font-medium">/ ${metaCobranzaHoy.toLocaleString()}</span>
                        </div>
                     </div>

                     <div className="relative z-10 mt-1 md:mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-all duration-1000 ease-out"
                                   style={{ width: `${metaCobranzaHoy > 0 ? (recaudadoRutaHoy / metaCobranzaHoy) * 100 : 0}%` }}
                               />
                            </div>
                            <p className="text-[#10b981] font-bold text-[7px] md:text-[9px] flex items-center gap-1 shrink-0">
                               <span>{metaCobranzaHoy > 0 ? Math.round((recaudadoRutaHoy / metaCobranzaHoy) * 100) : 0}%</span>
                            </p>
                        </div>
                        <div className="flex">
                            <span className="bg-[#10b981]/10 text-[#10b981] text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-[#10b981]/20 uppercase tracking-wider mt-1">
                                {clientesCobradosHoy} de {totalClientesHoy} Préstamos
                            </span>
                        </div>
                     </div>
                </Link>

                {/* KPI: ACTIVOS (NUEVO) */}
                <Link href={{ query: { ...sParams, tab: 'activos', page: '1' } }} className="bg-[#090e16] border border-emerald-500/20 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px] hover:bg-[#0d1421] hover:border-emerald-500/40 transition-all group">
                     {/* Decorative background wallet icon */}
                     <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
                        <Users className="w-20 h-20 md:w-24 md:h-24 text-emerald-500" />
                     </div>
                     
                     <div className="relative z-10">
                        <p className="text-emerald-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">ACTIVOS</p>
                        <h2 className="text-lg md:text-2xl font-black text-white tracking-tighter">{activeLoans}</h2>
                     </div>

                     <div className="relative z-10 mt-1 md:mt-2 space-y-1.5">
                        <div className="flex">
                            <span className="bg-emerald-500/10 text-emerald-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider mt-1">
                                COBRANZA VIGENTE
                            </span>
                        </div>
                     </div>
                </Link>

                {/* Eficiencia de Cobranza (Hoy + Atrasos) */}
                <div className="bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px] hover:bg-[#0d1421] transition-all group">
                     <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
                        <TrendingUp className="w-20 h-20 md:w-24 md:h-24 text-white" />
                     </div>
                     
                     <div className="relative z-10">
                        <p className="text-blue-400 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Eficiencia Cobro</p>
                        <div className="flex items-baseline gap-1">
                           <span className="text-lg md:text-2xl font-black text-white tracking-tighter">${cobradoEficienciaTotal.toLocaleString()}</span>
                           <span className="text-slate-600 text-[9px] md:text-sm font-medium">/ ${metaEficienciaTotal.toLocaleString()}</span>
                        </div>
                     </div>

                     <div className="relative z-10 mt-1 md:mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 h-1 bg-slate-800/40 rounded-full overflow-hidden">
                               <div 
                                   className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-out"
                                   style={{ width: `${porcentajeEficiencia}%` }}
                               />
                            </div>
                            <p className="text-blue-400 font-bold text-[7px] md:text-[9px] flex items-center gap-1 shrink-0">
                               <span>{porcentajeEficiencia.toFixed(0)}%</span>
                            </p>
                        </div>
                        <div className="flex">
                            <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider mt-1">
                                Hoy + Atrasados
                            </span>
                        </div>
                     </div>
                </div>

                {/* Renovaciones Card */}
                <Link href={{ query: { ...sParams, tab: 'renovaciones', page: '1' } }} className="bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between hover:bg-[#0d1421] transition-all group min-h-[90px] md:min-h-[120px]">
                    <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12 group-hover:opacity-[0.03] transition-opacity">
                        <TrendingUp className="w-20 h-20 md:w-24 md:h-24 text-white" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-amber-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Renovaciones</p>
                        <h2 className="text-lg md:text-3xl font-black text-white tracking-tighter">{oportunidadesRenovacion}</h2>
                    </div>
                    <div className="relative z-10 flex">
                        <span className="bg-amber-500/10 text-amber-500 text-[6px] md:text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
                            Disponibles
                        </span>
                    </div>
                </Link>

                {/* Mora (%) Card */}
                <div className="bg-[#090e16] border border-slate-800/40 rounded-xl p-3 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[90px] md:min-h-[120px]">
                    <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12">
                        <AlertCircle className="w-20 h-20 md:w-24 md:h-24 text-white" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-rose-500 font-bold text-[7px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-2">Índice Mora</p>
                        <h2 className="text-lg md:text-3xl font-black text-white tracking-tighter">
                            {tasaMorosidadCapital.toFixed(1)}%
                        </h2>
                    </div>
                    <div className="relative z-10 flex">
                        <span className="bg-rose-500/10 text-rose-500 text-[6px] md:text-[8px] font-black px-1.5 py-0.5 rounded border border-rose-500/20 uppercase tracking-wider">
                            {(userRole === 'admin' || userRole === 'secretaria') ? `$${capitalEnRiesgo.toLocaleString()}` : "Riesgo"}
                        </span>
                    </div>
                </div>

                {/* Recuperación Card (Solo Admin & Secretaria) */}
                {(userRole === 'admin' || userRole === 'secretaria') && (
                    <div className="bg-[#090e16] border border-slate-800/40 rounded-xl p-2.5 md:p-4 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[95px] md:min-h-[125px]">
                        <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-[0.02] rotate-12">
                            <TrendingUp className="w-20 h-20 md:w-24 md:h-24 text-white" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-blue-500 font-bold text-[8px] md:text-[9px] uppercase tracking-[0.2em] mb-1 md:mb-1.5">Recuperación</p>
                            <h2 className="text-xl md:text-3xl font-black text-white tracking-tighter">
                                {porcentajeRecuperacion.toFixed(1)}%
                            </h2>
                        </div>
                        <div className="relative z-10 flex">
                            <span className="bg-blue-500/10 text-blue-400 text-[7px] md:text-[8px] font-black px-1.5 md:px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider">
                                {(userRole === 'admin' || userRole === 'secretaria') ? `$${totalPagado.toLocaleString()}` : "Retorno"}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Admin/Supervisor/Secretaria Alerts Bar - More Compact */}
            {['admin', 'supervisor', 'secretaria'].includes(userRole) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Link href={{ query: { ...sParams, tab: 'notificar', page: '1' } }} className="bg-slate-900/40 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors border-l-2 border-l-rose-500/40">
                        <div>
                            <p className="text-rose-500/80 font-bold text-[8px] uppercase tracking-tighter">Alertas Críticas</p>
                            <p className="text-lg font-black text-white">{alertasGraves}</p>
                        </div>
                        <AlertCircle className="w-5 h-5 text-rose-500/20" />
                    </Link>
                    <Link href={{ query: { ...sParams, tab: 'morosos', page: '1' } }} className="bg-slate-900/40 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors border-l-2 border-l-amber-500/40">
                        <div>
                            <p className="text-amber-500/80 font-bold text-[8px] uppercase tracking-tighter">Advertencia</p>
                            <p className="text-lg font-black text-white">{clientesEnMora}</p>
                        </div>
                        <TrendingUp className="w-5 h-5 text-amber-500/20" />
                    </Link>
                </div>
            )}

            <div className="mt-4 space-y-6">
                {(userRole === 'admin' || userRole === 'secretaria') && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex flex-col md:flex-row gap-4">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                            <div>
                                <span className="text-rose-400 font-bold uppercase italic">Moroso:</span> Diario ≥{umbralMoroso} atr. Otros ≥{umbralMorosoOtros} atr.
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <TrendingUp className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                                <span className="text-amber-400 font-bold uppercase italic">Advertencia:</span> Diario {umbralCpp}-{umbralMoroso - 1} atr. Otros {umbralCppOtros}-{umbralMorosoOtros - 1} atr.
                            </div>
                        </div>
                    </div>
                )}
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
