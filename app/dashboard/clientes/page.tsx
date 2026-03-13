
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
    await supabaseAdmin.rpc('actualizar_estados_mora')

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
        .abortSignal(AbortSignal.timeout(5000)) // Timeout safety

    // Apply role-based filtering
    if (userRole === 'asesor') {
        // Asesor only sees their own clients
        clientsQuery = clientsQuery.eq('asesor_id', user?.id)
    } else if (userRole === 'supervisor') {
        // Supervisor sees clients of their asesores
        const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user?.id)
        const asesorIds = asesores?.map(a => a.id) || []
        if (asesorIds.length > 0) {
            clientsQuery = clientsQuery.in('asesor_id', asesorIds)
        }
    }
    // Admin sees all (no filter)

    const { data: clientsRaw } = await clientsQuery
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
            situacion, // Nueva situación financiera calculada
            gps_coordenadas, // Attach to root
            documentos, // Attach to root
            prestamo_activo_id: activeLoans[0]?.id || latestLoanId, // Usar activo o el más reciente
            giro_negocio: latestSolicitud?.giro_negocio,
            fuentes_ingresos: latestSolicitud?.fuentes_ingresos,
            ingresos_mensuales: latestSolicitud?.ingresos_mensuales,
            motivo_prestamo: latestSolicitud?.motivo_prestamo,
            isRecaptable,
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
        <div className="space-y-8 animate-in fade-in duration-500">
             {/* Header with Action */}
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                <div>
                     <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">Directorio de Clientes</h1>
                     </div>
                     <p className="text-slate-400 mt-2 md:mt-1">Gestión de cartera y perfiles</p>
                </div>
                {userRole === 'asesor' && (
                    <Link href="/dashboard/solicitudes/nueva">
                        <Button size="lg" className="bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-900/20 text-white font-semibold px-6 py-6 h-auto text-lg hover:scale-105 transition-transform rounded-xl">
                            <Plus className="mr-2 h-5 w-5" />
                            Nueva Solicitud
                        </Button>
                    </Link>
                )}
            </div>

             {/* Hero Stats */}
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                 {/* Card 1: Total */}
                 <Link href="?tab=todos" className="block h-full">
                     <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Users className="w-16 h-16 text-blue-500" />
                        </div>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Total Clientes</p>
                        <h2 className="text-xl md:text-3xl font-bold text-white">{totalClients}</h2>
                        <div className="mt-2 flex items-center text-blue-400">
                             <span className="bg-blue-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-900/50">REGISTRADOS</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 2: Al Día */}
                 <Link href="?tab=al_dia" className="block h-full">
                     <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                        </div>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Clientes al Día</p>
                        <h2 className="text-xl md:text-3xl font-bold text-white">{clientsAlDia}</h2>
                        <div className="mt-2 text-emerald-400 flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] font-bold">AL CORRIENTE</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 3: En Mora */}
                 <Link href="?tab=mora" className="block h-full">
                     <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                            <AlertTriangle className="w-16 h-16 text-rose-500" />
                        </div>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">En Mora / Riesgo</p>
                        <h2 className="text-xl md:text-3xl font-bold text-white">{clientsMora}</h2>
                        <div className="mt-2 text-rose-400 flex items-center gap-1">
                            <span className="bg-rose-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-900/50">POR GESTIONAR</span>
                        </div>
                     </div>
                 </Link>

                 {/* Card 4: Recaptables */}
                 <Link href="?tab=recaptables" className="block h-full">
                     <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer h-full">
                        <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="w-16 h-16 text-purple-500" />
                        </div>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Clientes Recaptables</p>
                        <h2 className="text-xl md:text-3xl font-bold text-white">{recaptablesCount}</h2>
                        <div className="mt-2 text-purple-400 flex items-center gap-1">
                             <span className="bg-purple-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-900/50">APTOS RENOVACIÓN</span>
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
