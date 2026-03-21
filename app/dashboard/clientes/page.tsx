
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Users, TrendingUp, CreditCard, Plus, Zap, CheckCircle2, AlertTriangle } from 'lucide-react'
import { ClientDirectory } from '@/components/clientes/client-directory'
import { getTodayPeru, calculateClientSituation, calculateLoanMetrics } from '@/lib/financial-logic'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
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

    const todayPeru = getTodayPeru()
    
    // Process clients to add calculated stats
    const clients = (clientsRaw || [])?.map((client: any) => {
        const activeLoans = client.prestamos?.filter((p: any) => p.estado === 'activo') || []
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
             // Calculate pending balance
             const pendingBalance = p.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) || 0
             
             return (
                p.estado === 'completado' || 
                p.estado === 'renovado' || 
                p.estado === 'finalizado' || 
                (pendingBalance <= 0.01 && p.estado !== 'anulado' && p.estado !== 'rechazado')
             )
        }) || []

        const latestLoanId = client.prestamos?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id || null

        return {
            ...client,
            situacion,
            gps_coordenadas,
            documentos,
            prestamo_activo_id: activeLoans[0]?.id || latestLoanId,
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
        }
    }) || []

    // Calc Header Stats
    const totalClients = clients.length
    const clientsAlDia = clients.filter((c: any) => c.situacion === 'ok' || c.situacion === 'deuda').length
    const clientsMora = clients.filter((c: any) => ['cpp', 'moroso', 'vencido'].includes(c.situacion)).length
    const recaptablesCount = clients.filter((c: any) => c.isRecaptable).length

    // Fetch perfiles for filters (if admin or supervisor)
    let perfiles: any[] = []
    if (userRole === 'admin' || userRole === 'supervisor') {
        const { data: perfilesData } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol, supervisor_id')
            .in('rol', ['supervisor', 'asesor'])
            .order('nombre_completo')
        perfiles = perfilesData || []
    }

    return (
        <div className="page-container">
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
                {userRole === 'asesor' && (
                    <Link href="/dashboard/solicitudes/nueva">
                        <Button className="btn-action bg-purple-600 hover:bg-purple-500 shadow-purple-900/20 hover:scale-105">
                            <Plus className="mr-2 h-5 w-5" />
                            Nueva Solicitud
                        </Button>
                    </Link>
                )}
            </div>

             {/* Hero Stats */}
             <div className="kpi-grid lg:grid-cols-4">
                 {/* Card 1: Total */}
                 <Link href="?tab=todos" className="block h-full">
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

                 {/* Card 2: Al Día */}
                 <Link href="?tab=al_dia" className="block h-full">
                     <div className="kpi-card group hover:border-emerald-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="kpi-card-icon">
                            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                        </div>
                        <p className="kpi-label">Clientes al Día</p>
                        <h2 className="kpi-value">{clientsAlDia}</h2>
                        <div className="mt-2 text-emerald-400 flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="kpi-badge bg-transparent p-0 mt-0">AL CORRIENTE</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 3: En Mora */}
                 <Link href="?tab=mora" className="block h-full">
                     <div className="kpi-card group hover:border-rose-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="kpi-card-icon">
                            <AlertTriangle className="w-16 h-16 text-rose-500" />
                        </div>
                        <p className="kpi-label">En Mora / Riesgo</p>
                        <h2 className="kpi-value">{clientsMora}</h2>
                        <div className="mt-2 text-rose-400 flex items-center gap-1">
                            <span className="kpi-badge bg-rose-950/50 text-rose-400 border border-rose-900/50">POR GESTIONAR</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 4: Recaptables */}
                 <Link href="?tab=recaptables" className="block h-full">
                     <div className="kpi-card group hover:border-purple-500/30 hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="kpi-card-icon">
                            <Zap className="w-16 h-16 text-purple-500" />
                        </div>
                        <p className="kpi-label">Clientes Recaptables</p>
                        <h2 className="kpi-value">{recaptablesCount}</h2>
                        <div className="mt-2 text-purple-400 flex items-center gap-1">
                             <span className="kpi-badge bg-purple-950/50 text-purple-400 border border-purple-900/50">APTOS RENOVACIÓN</span>
                        </div>
                     </div>
                 </Link>
             </div>

             {/* Client Directory with Detail View */}
             <ClientDirectory 
                clientes={clients} 
                perfiles={perfiles}
                userRol={userRole as any}
                userId={user?.id}
            />
        </div>
    )
}
