import { Metadata } from 'next'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'
import { Plus, Lock } from 'lucide-react'
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
                observacion_supervisor,
                created_at
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

    const activeLoanIds = (clientsRaw || []).flatMap(c => 
        (c.prestamos || [])
            .filter((p: any) => p.estado === 'activo')
            .map((p: any) => p.id)
    )

    const cuotasByLoan = new Map<string, any[]>()
    const pagosByLoan = new Map<string, any[]>()

    if (activeLoanIds.length > 0) {
        const cuotaChunkSize = 50
        const pagosChunkSize = 100

        const cuotaPromises = []
        for (let i = 0; i < activeLoanIds.length; i += cuotaChunkSize) {
            cuotaPromises.push(
                supabaseAdmin
                    .from('cronograma_cuotas')
                    .select(`
                        prestamo_id,
                        monto_cuota,
                        monto_pagado,
                        fecha_vencimiento,
                        estado,
                        pagos (
                            created_at,
                            monto_pagado,
                            estado_verificacion
                        )
                    `)
                    .in('prestamo_id', activeLoanIds.slice(i, i + cuotaChunkSize))
            )
        }

        const pagosPromises = []
        for (let i = 0; i < activeLoanIds.length; i += pagosChunkSize) {
            pagosPromises.push(
                supabaseAdmin
                    .from('pagos')
                    .select('prestamo_id, monto_pagado, estado_verificacion')
                    .in('prestamo_id', activeLoanIds.slice(i, i + pagosChunkSize))
            )
        }

        const [cuotasResults, pagosResults] = await Promise.all([
            Promise.all(cuotaPromises),
            Promise.all(pagosPromises)
        ])

        cuotasResults.forEach(res => {
            res.data?.forEach((c: any) => {
                const list = cuotasByLoan.get(c.prestamo_id) || []
                list.push(c)
                cuotasByLoan.set(c.prestamo_id, list)
            })
        })

        pagosResults.forEach(res => {
            res.data?.forEach((p: any) => {
                if (p.estado_verificacion !== 'rechazado') {
                    const list = pagosByLoan.get(p.prestamo_id) || []
                    list.push(p)
                    pagosByLoan.set(p.prestamo_id, list)
                }
            })
        })
    }

    clientsRaw.forEach(c => {
        c.prestamos?.forEach((p: any) => {
            p.cronograma_cuotas = cuotasByLoan.get(p.id) || []
        })
    })

    const clientIdsParsed = (clientsRaw || []).map(c => c.id)
    let reassignedClientIds = new Set<string>()
    const { data: reassignments } = await supabaseAdmin
        .from('historial_reasignaciones_clientes')
        .select('cliente_id')
        .in('cliente_id', clientIdsParsed)
    
    if (reassignments) {
        reassignments.forEach(r => reassignedClientIds.add(r.cliente_id))
    }

    const allLoanIds = (clientsRaw || []).flatMap(c => (c.prestamos || []).map((p: any) => p.id))
    const { data: renovacionesRefinanciamiento } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
        .in('prestamo_nuevo_id', allLoanIds)

    const prestamoIdsProductoRefinanciamiento = (renovacionesRefinanciamiento || [])
        .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
        .map((r: any) => r.prestamo_nuevo_id as string)
        .filter(Boolean)

    const todayPeru = getTodayPeru()
    
    const clients = (clientsRaw || [])?.map((client: any) => {
        const activeLoans = client.prestamos?.filter((p: any) => {
            const isMigrado = (p.observacion_supervisor || '').includes('Préstamo migrado') || (p.observacion_supervisor || '').includes('[MIGRACIÓN]')
            let saldoCuotas = 0
            if (p.cronograma_cuotas) {
                saldoCuotas = p.cronograma_cuotas.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0)
            }
            const totalPagar = Number(p.monto) * (1 + (Number(p.interes) / 100))
            const totalPagado = (p.cronograma_cuotas || []).reduce((acc: number, c: any) => acc + (Number(c.monto_pagado) || 0), 0)
            const saldoGlobal = Math.max(0, totalPagar - totalPagado)
            const isEffectivelyFinalized = isMigrado && (p.cronograma_cuotas?.length ?? 0) > 0 && 
                                           saldoCuotas <= 0.01 && 
                                           saldoGlobal <= 0.01

            return p.estado === 'activo' && !isEffectivelyFinalized
        }) || []
        
        const riskLevels: Record<string, number> = { 'vencido': 5, 'moroso': 4, 'cpp': 3, 'deuda': 2, 'ok': 1 }
        const sortedActive = [...activeLoans].sort((a: any, b: any) => {
            const riskA = riskLevels[a.estado_mora?.toLowerCase() || 'ok'] || 0
            const riskB = riskLevels[b.estado_mora?.toLowerCase() || 'ok'] || 0
            if (riskA !== riskB) return riskB - riskA
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

        const latestLoanId = client.prestamos?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id || null
        const primaryLoanId = sortedActive[0]?.id || latestLoanId
        const situacion = calculateClientSituation(client)

        let totalDebt = 0
        let isRecaptable = false
        activeLoans.forEach((p: any) => {
            const pagosDirectos = pagosByLoan.get(p.id) || []
            const metrics = calculateLoanMetrics(p, todayPeru, {}, pagosDirectos)
            totalDebt += metrics.saldoPendiente
            if (metrics.esRenovable) isRecaptable = true
        })

        const latestSolicitud = client.solicitudes?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        const historicalLoans = client.prestamos?.filter((p: any) => {
             const pendingBalance = p.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) || 0
             return (
                p.estado === 'completado' || p.estado === 'renovado' || p.estado === 'finalizado' || 
                (pendingBalance <= 0.01 && p.estado !== 'anulado' && p.estado !== 'rechazado')
             )
        }) || []

        return {
            ...client,
            situacion,
            gps_coordenadas: latestSolicitud?.gps_coordenadas || null,
            documentos: latestSolicitud?.documentos_evaluacion || {},
            prestamo_activo_id: primaryLoanId,
            giro_negocio: latestSolicitud?.giro_negocio,
            fuentes_ingresos: latestSolicitud?.fuentes_ingresos,
            ingresos_mensuales: latestSolicitud?.ingresos_mensuales,
            motivo_prestamo: latestSolicitud?.motivo_prestamo,
            isRecaptable,
            wasReassigned: reassignedClientIds.has(client.id),
            stats: { activeLoansCount: activeLoans.length, totalDebt: totalDebt, historicalLoansCount: historicalLoans.length }
        }
    }) || []

    let perfiles: any[] = []
    if (userRole === 'admin' || userRole === 'supervisor' || userRole === 'secretaria') {
        const { data: perfilesData } = await supabaseAdmin
            .from('perfiles')
            .select('id, nombre_completo, rol, supervisor_id')
            .in('rol', ['supervisor', 'asesor'])
            .order('nombre_completo')
        perfiles = perfilesData || []
    }

    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const accessResult = await checkSystemAccess(supabaseAdmin, user?.id || '', userRole || 'asesor', 'solicitud')
    
    let blockInfo = null
    if (userRole === 'asesor' && user?.id) {
        blockInfo = await checkAdvisorBlocked(supabaseAdmin, user.id)
    }

    const canCreateDueToTime = accessResult.allowed || userRole === 'admin'
    
    return (
        <div className="page-container">
             <DashboardAlerts 
                userId={user?.id || ''} 
                blockInfo={blockInfo} 
                accessInfo={accessResult} 
             />
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
