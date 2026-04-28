import { Metadata } from 'next'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Users, TrendingUp, CreditCard, Plus, Zap, CheckCircle2, AlertTriangle, Lock, HandCoins, UserCheck } from 'lucide-react'
import { ClientDirectory } from '@/components/clientes/client-directory'
import { getTodayPeru, calculateClientSituation, calculateLoanMetrics } from '@/lib/financial-logic'
import { cn } from '@/lib/utils'
import { DashboardAlerts } from '@/components/dashboard/dashboard-alerts'
import { checkAdvisorBlocked } from '@/utils/checkAdvisorBlocked'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Directorio Clientes'
}

export default async function ClientesPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
    const sParams = searchParams;
    const filtroSupervisor = sParams.supervisor as string || 'todos';
    const filtroAsesor = sParams.asesor as string || 'todos';
    const filtroSector = sParams.sector as string || 'todos';
    const searchQuery = sParams.q as string || '';

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // Get current user and role
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol, id')
        .eq('id', user?.id)
        .single()

    const userRole = perfil?.rol || 'asesor'
    
    // 0. Auto-update Mora Status (Robot)
    try {
        await supabaseAdmin.rpc('actualizar_estados_mora')
    } catch (e) {
        console.error('Error in actualizar_estados_mora:', e)
    }

    // Build base query based on role
    let clientsQuery = supabaseAdmin
        .from('clientes')
        .select(`
            *,
            prestamos (
                id,
                estado,
                monto,
                interes,
                frecuencia,
                fecha_inicio,
                estado_mora,
                es_paralelo,
                cronograma_cuotas (
                    monto_cuota,
                    monto_pagado,
                    fecha_vencimiento,
                    estado,
                    pagos (
                        created_at,
                        monto_pagado
                    )
                )
            ),
            solicitudes (
                gps_coordenadas,
                giro_negocio,
                fuentes_ingresos,
                ingresos_mensuales,
                motivo_prestamo,
                documentos_evaluacion,
                created_at
            ),
            sectores (
                id,
                nombre
            )
        `)
        .order('created_at', { ascending: false })
        .abortSignal(AbortSignal.timeout(30000))

    // Apply role-based filtering
    if (userRole === 'asesor') {
        clientsQuery = clientsQuery.eq('asesor_id', user?.id)
    } else if (userRole === 'supervisor') {
        const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user?.id)
        const asesorIds = asesores?.map(a => a.id) || []
        if (asesorIds.length > 0) {
            clientsQuery = clientsQuery.in('asesor_id', asesorIds)
        } else {
            clientsQuery = clientsQuery.eq('id', '00000000-0000-0000-0000-000000000000')
        }
    }

    const { data: clientsRaw, error: clientsError } = await clientsQuery
    
    if (clientsError) {
        console.error('Error cargando clientes:', clientsError)
        return <div className="p-10 text-slate-500 text-center">
            No se pudieron cargar los datos de clientes. Intente nuevamente.
        </div>
    }

    // NEW: Robust fetch of reassignments (DEBUG: Fetching all to be sure)
    const clientIdsParsed = (clientsRaw || []).map(c => c.id)
    let reassignedClientIds = new Set<string>()
    const { data: reassignments, error: reassignError } = await supabaseAdmin
        .from('historial_reasignaciones_clientes')
        .select('*')
    
    if (reassignments) {
        reassignments.forEach(r => reassignedClientIds.add(r.cliente_id))
    }

    // Obtener IDs de préstamos que son producto de una refinanciación directa
    const { data: renovacionesRefinanciamiento } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
    const prestamoIdsProductoRefinanciamiento = (renovacionesRefinanciamiento || [])
        .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
        .map((r: any) => r.prestamo_nuevo_id as string)
        .filter(Boolean)

    const todayPeru = getTodayPeru()
    
    // Process clients to add calculated stats
    const clients = (clientsRaw || [])?.map((client: any) => {
        // Process loans to identify primary active loan
        const activeLoans = client.prestamos?.filter((p: any) => {
            const isMigrado = (p.observacion_supervisor || '').includes('Préstamo migrado') || (p.observacion_supervisor || '').includes('[MIGRACIÓN]')
            
            // Calculate balance if not present or check against known payments
            let saldo = 0
            if (p.cronograma_cuotas) {
                saldo = p.cronograma_cuotas.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0)
            }

            const isEffectivelyFinalized = isMigrado && saldo <= 0.01
            return p.estado === 'activo' && !isEffectivelyFinalized
        }) || []
        
        // Define risk hierarchy
        const riskLevels: Record<string, number> = {
            'vencido': 5,
            'moroso': 4,
            'cpp': 3,
            'deuda': 2,
            'ok': 1
        }

        // Sort active loans: Higher risk first, then most recent
        const sortedActive = [...activeLoans].sort((a: any, b: any) => {
            const riskA = riskLevels[a.estado_mora?.toLowerCase() || 'ok'] || 0
            const riskB = riskLevels[b.estado_mora?.toLowerCase() || 'ok'] || 0
            if (riskA !== riskB) return riskB - riskA
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

        const latestLoanId = client.prestamos?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id || null
        const primaryLoanId = sortedActive[0]?.id || latestLoanId

        const situacion = calculateClientSituation(client)

        // Totales básicos
        let totalDebt = 0
        let isRecaptable = false
        activeLoans.forEach((p: any) => {
            const metrics = calculateLoanMetrics(p, todayPeru)
            totalDebt += metrics.deudaExigibleTotal
            if (metrics.esRenovable) isRecaptable = true
        })

        // Get latest GPS coordinates from solicitudes
        const latestSolicitud = client.solicitudes?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        const gps_coordenadas = latestSolicitud?.gps_coordenadas || null
        const documentos = latestSolicitud?.documentos_evaluacion || {}
        const historicalLoans = client.prestamos?.filter((p: any) => {
             const pendingBalance = p.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) || 0
             return (
                p.estado === 'completado' || 
                p.estado === 'renovado' || 
                p.estado === 'finalizado' || 
                (pendingBalance <= 0.01 && p.estado !== 'anulado' && p.estado !== 'rechazado')
             )
        }) || []

        return {
            ...client,
            situacion,
            gps_coordenadas,
            documentos,
            prestamo_activo_id: primaryLoanId,
            giro_negocio: latestSolicitud?.giro_negocio,
            fuentes_ingresos: latestSolicitud?.fuentes_ingresos,
            ingresos_mensuales: latestSolicitud?.ingresos_mensuales,
            motivo_prestamo: latestSolicitud?.motivo_prestamo,
            isRecaptable,
            wasReassigned: reassignedClientIds.has(client.id),
            stats: {
                activeLoansCount: activeLoans.length,
                totalDebt: totalDebt,
                historicalLoansCount: historicalLoans.length
            }
        }    }) || []

    // Fetch perfiles for filters (Needed here for KPI calculations and later for the directory)
    let perfiles: any[] = []
    if (userRole === 'admin' || userRole === 'supervisor' || userRole === 'secretaria') {
        const { data: perfilesData } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol, supervisor_id')
            .in('rol', ['supervisor', 'asesor'])
            .order('nombre_completo')
        perfiles = perfilesData || []
    }

    // --- APLICAR FILTROS PARA KPI ACTIVOS (REACTIVOS AL URL) ---
    let filteredForKPIs = [...clients]

    // Filtro por Texto (Q)
    if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filteredForKPIs = filteredForKPIs.filter(c => 
            c.nombres?.toLowerCase().includes(query) ||
            c.dni?.includes(query) ||
            c.telefono?.includes(query) ||
            c.sectores?.nombre?.toLowerCase().includes(query)
        )
    }

    // Filtro por Supervisor (Admin & Secretaria only)
    if ((userRole === 'admin' || userRole === 'secretaria') && filtroSupervisor !== 'todos') {
         const advisorIds = perfiles
            .filter(p => p.supervisor_id === filtroSupervisor)
            .map(p => p.id)
         filteredForKPIs = filteredForKPIs.filter(c => advisorIds.includes(c.asesor_id))
    }

    // Filtro por Asesor
    if (filtroAsesor !== 'todos') {
        filteredForKPIs = filteredForKPIs.filter(c => c.asesor_id === filtroAsesor)
    }

    // Filtro por Sector
    if (filtroSector !== 'todos') {
        filteredForKPIs = filteredForKPIs.filter(c => c.sector_id === filtroSector)
    }

    // Calc Header Stats Basados en la Lista Filtrada por el usuario
    const totalClients = filteredForKPIs.length
    const clientsConDeuda = filteredForKPIs.filter((c: any) => c.stats.totalDebt > 0).length
    const clientsSinPrestamos = filteredForKPIs.filter((c: any) => c.stats.activeLoansCount === 0).length
    const reasignadosCount = filteredForKPIs.filter((c: any) => c.wasReassigned).length
    const bloqueadosCount = filteredForKPIs.filter((c: any) => !!c.bloqueado_renovacion).length

    // Clientes Activos con Deuda Pendiente (REGLAS DE NEGOCIO):
    // 1. Solo cuenta el préstamo PRINCIPAL (no paralelos, no refinanciados)
    // 2. El préstamo debe estar en estado 'activo'
    // 3. Excluye si el préstamo principal está 'vencido'
    // 4. Excluye si el cliente está bloqueado en renovaciones
    const clientesActivosConDeuda = filteredForKPIs.filter((c: any) => {
        if (!!c.bloqueado_renovacion) return false
        
        const loans = c.prestamos || []
        // Buscar el préstamo principal activo
        const mainActiveLoan = loans.find((p: any) => 
            p.estado === 'activo' && 
            !p.es_paralelo && 
            p.estado !== 'refinanciado' &&
            !prestamoIdsProductoRefinanciamiento.includes(p.id)
        )

        if (!mainActiveLoan) return false
        
        // Excluir si está vencido
        if (mainActiveLoan.estado_mora === 'vencido') return false
        
        // Debe tener saldo pendiente
        const metrics = calculateLoanMetrics(mainActiveLoan, todayPeru)
        return metrics.saldoPendiente > 0.01
    }).length

    const controlRecibosCount = filteredForKPIs.filter((c: any) => !!c.excepcion_voucher).length

    // [REFORZADO] Lógica de Acceso al Sistema (Centralizada)
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const accessResult = await checkSystemAccess(supabaseAdmin, user?.id || '', userRole || 'asesor', 'solicitud')
    
    // [NUEVO] Obtener información de bloqueos de deuda
    let blockInfo = null
    if (userRole === 'asesor' && user?.id) {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id)
    }

    const canCreateDueToTime = accessResult.allowed || userRole === 'admin'
    
    // Configuración para prop compatibility
    const sysConfig = accessResult.config || {}
    const systemSchedule = {
        horario_apertura: sysConfig.horario_apertura || '07:00',
        horario_cierre: sysConfig.horario_cierre || '20:00',
        horario_fin_turno_1: sysConfig.horario_fin_turno_1 || '13:30',
        desbloqueo_hasta: sysConfig.desbloqueo_hasta || ''
    }


    return (
        <div className="page-container">
             <DashboardAlerts 
                userId={user?.id || ''} 
                blockInfo={blockInfo} 
                accessInfo={accessResult} 
             />
             {/* Header with Action */}
             <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Directorio Clientes</h1>
                            <p className="page-subtitle">Gestión de cartera y perfiles</p>
                        </div>
                    </div>
                </div>
                {(userRole === 'asesor' || userRole === 'secretaria') && (
                    <Link href={canCreateDueToTime ? "/dashboard/solicitudes/nueva" : "#"}>
                        <Button 
                            disabled={!canCreateDueToTime}
                            className={cn(
                                "btn-action",
                                canCreateDueToTime 
                                    ? "bg-purple-600 hover:bg-purple-500 shadow-purple-900/20 hover:scale-105" 
                                    : "bg-slate-700 opacity-60 cursor-not-allowed"
                            )}
                        >
                            {canCreateDueToTime ? <Plus className="mr-2 h-5 w-5" /> : <Lock className="mr-2 h-5 w-5" />}
                            {canCreateDueToTime ? 'Nueva Solicitud' : 'Cerrado'}
                        </Button>
                    </Link>
                )}
            </div>

             {/* Hero Stats */}
             <div className="kpi-grid lg:grid-cols-5">
                 {/* Card 1: Total */}
                 <Link 
                    href={{
                        query: { ...sParams, tab: 'todos', page: '1' }
                    }} 
                    className="block h-full"
                >
                     <div className="kpi-card group hover:border-blue-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="kpi-card-icon">
                            <Users className="w-16 h-16 text-blue-500" />
                        </div>
                        <p className="kpi-label">Total Clientes</p>
                        <h2 className="kpi-value">{totalClients}</h2>
                        <div className="mt-2 flex items-center text-blue-400">
                             <span className="kpi-badge bg-blue-950/50 text-blue-400 border border-blue-900/50">REGISTRADOS</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 2: Con Deuda */}
                 <Link 
                    href={{
                        query: { ...sParams, tab: 'con_deuda', page: '1' }
                    }} 
                    className="block h-full"
                >
                     <div className="kpi-card group hover:border-amber-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="kpi-card-icon">
                            <HandCoins className="w-16 h-16 text-amber-500" />
                        </div>
                        <p className="kpi-label">Con Deuda</p>
                        <h2 className="kpi-value">{clientsConDeuda}</h2>
                        <div className="mt-2 text-amber-400 flex items-center gap-1">
                            <span className="kpi-badge bg-amber-950/50 text-amber-400 border border-amber-900/50">SALDO PENDIENTE</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 3: Activos con Deuda (Excluye vencidos y bloqueados) */}
                 <Link 
                    href={{
                        query: { ...sParams, tab: 'activos_deuda', page: '1' }
                    }} 
                    className="block h-full"
                >
                     <div className="kpi-card group hover:border-emerald-500/50 hover:scale-[1.02] active:scale-95 cursor-pointer h-full relative overflow-hidden border-emerald-500/20 shadow-[0_0_15px_-5px_rgba(16,185,129,0.1)] hover:shadow-[0_0_25px_-5px_rgba(16,185,129,0.3)] transition-all">
                        {/* Subtle inner glow */}
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 blur-3xl group-hover:bg-emerald-500/20 transition-colors" />
                        
                        <div className="kpi-card-icon">
                            <UserCheck className="w-16 h-16 text-emerald-500 group-hover:scale-110 transition-transform" />
                        </div>
                        <p className="kpi-label">ACTIVOS</p>
                        <h2 className="kpi-value text-emerald-50">{clientesActivosConDeuda}</h2>
                        <div className="mt-2 text-emerald-400 flex items-center gap-1">
                             <span className="kpi-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">ACTIVOS</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 4: Sin Préstamos */}
                 <Link 
                    href={{
                        query: { ...sParams, tab: 'sin_prestamos', page: '1' }
                    }} 
                    className="block h-full"
                >
                     <div className="kpi-card group hover:border-slate-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="kpi-card-icon">
                            <Zap className="w-16 h-16 text-slate-500 opacity-50" />
                        </div>
                        <p className="kpi-label">Sin Préstamos</p>
                        <h2 className="kpi-value">{clientsSinPrestamos}</h2>
                        <div className="mt-2 text-slate-400 flex items-center gap-1">
                             <span className="kpi-badge bg-slate-900/50 text-slate-500 border border-slate-800">SIN ACTIVIDAD</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 5: Control / Reasignados */}
                 {(userRole === 'admin' || userRole === 'secretaria') ? (
                     <Link 
                        href={{
                            query: { ...sParams, tab: 'reasignados', page: '1' }
                        }} 
                        className="block h-full"
                    >
                          <div className="kpi-card group hover:border-purple-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                             <div className="kpi-card-icon">
                                 <Users className="w-16 h-16 text-purple-500" />
                             </div>
                             <p className="kpi-label">Reasignados</p>
                             <h2 className="kpi-value">{reasignadosCount}</h2>
                             <div className="mt-2 text-purple-400 flex items-center gap-1">
                                  <span className="kpi-badge bg-purple-950/50 text-purple-400 border border-purple-900/50">CAMBIO ASESOR</span>
                             </div>
                          </div>
                      </Link>
                  ) : (userRole === 'supervisor' ? (
                     <Link 
                        href={{
                            query: { ...sParams, tab: 'bloqueados', page: '1' }
                        }} 
                        className="block h-full"
                    >
                         <div className="kpi-card group hover:border-rose-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                            <div className="kpi-card-icon">
                                <Lock className="w-16 h-16 text-rose-500" />
                            </div>
                            <p className="kpi-label">Bloqueados</p>
                            <h2 className="kpi-value">{bloqueadosCount}</h2>
                            <div className="mt-2 text-rose-400 flex items-center gap-1">
                                 <span className="kpi-badge bg-rose-950/50 text-rose-400 border border-rose-900/50">RESTRICCIÓN</span>
                            </div>
                         </div>
                     </Link>
                  ) : (
                     <Link 
                        href={{
                            query: { ...sParams, tab: 'todos', page: '1' }
                        }} 
                        className="block h-full"
                    >
                         <div className="kpi-card group hover:border-blue-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                            <div className="kpi-card-icon">
                                <TrendingUp className="w-16 h-16 text-blue-500" />
                            </div>
                            <p className="kpi-label">Crecimiento</p>
                            <h2 className="kpi-value">{totalClients}</h2>
                            <div className="mt-2 text-blue-400 flex items-center gap-1">
                                 <span className="kpi-badge bg-blue-950/50 text-blue-400 border border-blue-900/50">CLIENTES TOTAL</span>
                            </div>
                         </div>
                     </Link>
                  ))}
             </div>

             {/* Client Directory with Detail View */}
             <ClientDirectory 
                clientes={clients} 
                perfiles={perfiles}
                userRol={userRole as any}
                userId={user?.id}
                prestamoIdsProductoRefinanciamiento={prestamoIdsProductoRefinanciamiento}
            />
        </div>
    )
}
