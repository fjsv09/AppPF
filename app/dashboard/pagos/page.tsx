
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, DollarSign, Calendar, TrendingUp, ArrowUpRight } from 'lucide-react'
import { TablaCuotasVencidas } from '@/components/pagos/tabla-cuotas-vencidas'
import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PagosPage(props: { searchParams: Promise<{ fecha?: string }> }) {
    const searchParams = await props.searchParams;
    const fechaParam = searchParams.fecha;

    const supabase = await createClient()
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get current user and role
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol, supervisor_id')
        .eq('id', user?.id)
        .single()

    const userRol = (perfil?.rol || 'asesor') as 'admin' | 'supervisor' | 'asesor'
    const userId = user?.id || ''

    // Fetch all perfiles for filters
    const { data: perfiles } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, rol, supervisor_id')
        .in('rol', ['supervisor', 'asesor'])
        .order('nombre_completo')

    // Build pagos query with role-based filtering
    let pagosQuery = supabaseAdmin
        .from('pagos')
        .select(`
            *,
            cronograma_cuotas!inner (
                numero_cuota,
                prestamos!inner (
                    clientes!inner (nombres, asesor_id)
                )
            )
        `)

    if (userRol === 'asesor') {
        pagosQuery = pagosQuery.eq('cronograma_cuotas.prestamos.clientes.asesor_id', userId)
    } else if (userRol === 'supervisor') {
        const teamAsesorIds = perfiles?.filter(p => p.supervisor_id === userId).map(p => p.id) || []
        pagosQuery = pagosQuery.in('cronograma_cuotas.prestamos.clientes.asesor_id', teamAsesorIds)
    }

    const { data: pagos, error: pagosError } = await pagosQuery
        .order('fecha_pago', { ascending: false })
        .limit(20)

    if (pagosError) {
        console.error('Error fetching pagos:', pagosError.message)
    }

    // Fetch pending quotas for filter date (or today/overdue)
    const now = new Date()
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    
    // Build query with role-based filtering
    let cuotasQuery = supabaseAdmin
        .from('cronograma_cuotas')
        .select(`
            id,
            monto_cuota,
            monto_pagado,
            numero_cuota,
            fecha_vencimiento,
            prestamo_id,
            prestamos (
                id,
                created_by,
                clientes ( id, nombres, asesor_id )
            )
        `)
        .neq('estado', 'pagado')
        .order('fecha_vencimiento', { ascending: true })

    // Conditional Date Filter
    if (fechaParam) {
        // Si el usuario seleccionó una fecha específica -> Filtro estricto (solo ese día)
        cuotasQuery = cuotasQuery.eq('fecha_vencimiento', fechaParam)
    } else {
        // Por defecto -> Filtro acumulado (todo lo vencido hasta hoy)
        cuotasQuery = cuotasQuery.lte('fecha_vencimiento', todayISO)
    }
    
    const { data: vencimientosHoy } = await cuotasQuery
    
    // Get total cuotas count per prestamo
    const prestamoIds = [...new Set(vencimientosHoy?.map((v: any) => v.prestamo_id).filter(Boolean) || [])]
    
    let totalCuotasPorPrestamo: Record<string, number> = {}
    if (prestamoIds.length > 0) {
        const { data: allCuotas } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('prestamo_id')
            .in('prestamo_id', prestamoIds as string[])
        
        totalCuotasPorPrestamo = (allCuotas || []).reduce((acc: Record<string, number>, c: any) => {
            acc[c.prestamo_id] = (acc[c.prestamo_id] || 0) + 1
            return acc
        }, {})
    }

    // Get asesor info from perfiles
    const asesorIds = [...new Set(vencimientosHoy?.map((v: any) => v.prestamos?.created_by || v.prestamos?.clientes?.asesor_id).filter(Boolean) || [])]
    
    const { data: asesoresInfo } = asesorIds.length > 0 ? await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, supervisor_id')
        .in('id', asesorIds as string[]) : { data: [] }
    
    const asesoresMap = (asesoresInfo || []).reduce((acc: any, a: any) => {
        acc[a.id] = a
        return acc
    }, {})

    // Get supervisor info
    const supervisorIds = [...new Set((asesoresInfo || []).map((a: any) => a.supervisor_id).filter(Boolean))]
    
    const { data: supervisoresInfo } = supervisorIds.length > 0 ? await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo')
        .in('id', supervisorIds as string[]) : { data: [] }
    
    const supervisoresMap = (supervisoresInfo || []).reduce((acc: any, s: any) => {
        acc[s.id] = s
        return acc
    }, {})

    // Group quotas by prestamo and add asesor/supervisor info
    const cuotasVencidas = Object.values(
        (vencimientosHoy || []).reduce((acc: any, quota: any) => {
            const prestamoId = quota.prestamos?.id || quota.prestamo_id
            if (!prestamoId) return acc
            
            const asesorId = quota.prestamos?.created_by || quota.prestamos?.clientes?.asesor_id
            const asesor = asesoresMap[asesorId]
            const supervisor = asesor?.supervisor_id ? supervisoresMap[asesor.supervisor_id] : null
            
            if (!acc[prestamoId]) {
                acc[prestamoId] = {
                    id: quota.id,
                    prestamoId,
                    clienteNombre: quota.prestamos?.clientes?.nombres || 'Sin nombre',
                    totalCuotas: totalCuotasPorPrestamo[prestamoId] || 0,
                    cuotasVencidas: 0,
                    totalPendiente: 0,
                    asesorId: asesorId || null,
                    asesorNombre: asesor?.nombre_completo || null,
                    supervisorId: asesor?.supervisor_id || null,
                    supervisorNombre: supervisor?.nombre_completo || null
                }
            }
            
            const pending = quota.monto_cuota - (quota.monto_pagado || 0)
            acc[prestamoId].cuotasVencidas++
            acc[prestamoId].totalPendiente += pending
            
            return acc
        }, {} as Record<string, any>)
    )

    // Apply role-based filtering
    const cuotasFiltradas = cuotasVencidas.filter((cuota: any) => {
        if (userRol === 'admin') return true
        if (userRol === 'supervisor') {
            return cuota.supervisorId === userId
        }
        if (userRol === 'asesor') {
            return cuota.asesorId === userId
        }
        return false
    })

    // Calculate Daily Stats
    const getLocalDate = (utcTimestamp: string) => {
        const date = new Date(utcTimestamp)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    
    // Usar todayISO para filtrar pagos 'de hoy' independientemente del filtro de tabla
    const today = todayISO
    const pagosHoy = pagos?.filter((p: any) => getLocalDate(p.fecha_pago) === today)
    
    const totalCobradoHoy = pagosHoy?.reduce((acc: number, curr: any) => acc + (curr.monto_pagado || 0), 0) || 0
        
    const totalPendienteHoy = cuotasFiltradas.reduce((acc: number, curr: any) => acc + (curr.totalPendiente || 0), 0) || 0
    
    const totalMostrado = pagos?.reduce((acc: number, curr: any) => acc + (curr.monto_pagado || 0), 0) || 0

    return (
        <div className="page-container">
            {/* ... (Header & Stats Code Omitted for Brevity - No changes needed there) ... */}
            {/* Header & Actions */}
            {/* Header & Actions */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                             <h1 className="page-title">Transacciones</h1>
                             <p className="page-subtitle">Gestión de cobros y pagos</p>
                        </div>
                    </div>
                </div>
                <Link href="/dashboard/pagos/registrar" className="w-full md:w-auto">
                    <Button className="w-full md:w-auto btn-action bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20 hover:scale-105 active:scale-95">
                        <Plus className="mr-2 h-5 w-5" />
                        Registrar Nuevo Pago
                    </Button>
                </Link>
            </div>

            {/* Daily Stats Grid */}
            <div className="kpi-grid md:grid-cols-3">
                {/* Stat 1: Collected Today */}
                <div className="kpi-card group hover:border-emerald-500/30 flex items-center gap-4">
                   <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
                        <DollarSign className="w-7 h-7 text-emerald-500" />
                   </div>
                   <div>
                        <p className="kpi-label">Cobrado Hoy</p>
                        <h3 className="kpi-value">${totalCobradoHoy.toLocaleString()}</h3>
                   </div>
                </div>

                 {/* Stat 2: Pending Today */}
                 <div className="kpi-card group hover:border-blue-500/30 flex items-center gap-4">
                   <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                        <Calendar className="w-7 h-7 text-blue-500" />
                   </div>
                   <div>
                        <p className="kpi-label">Pendiente Vencido</p>
                        <h3 className="kpi-value">${totalPendienteHoy.toLocaleString()}</h3>
                   </div>
                </div>

                {/* Stat 3: Total Recent */}
                <div className="kpi-card group hover:border-purple-500/30 flex items-center gap-4">
                   <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors">
                        <TrendingUp className="w-7 h-7 text-purple-500" />
                   </div>
                   <div>
                        <p className="kpi-label">Flujo Reciente</p>
                        <h3 className="kpi-value">${totalMostrado.toLocaleString()}</h3>
                   </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid lg:grid-cols-5 gap-8">
                {/* Left Column: Pending Collections Table (Larger) */}
                <div className="lg:col-span-3 space-y-4">
                     <h2 className="section-title">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" />
                        Préstamos con Cuotas Vencidas
                     </h2>
                    
                    <TablaCuotasVencidas
                        cuotasVencidas={cuotasFiltradas as any}
                        perfiles={perfiles || []}
                        userRol={userRol}
                        userId={userId}
                        initialDate={fechaParam} 
                    />
                </div>

                {/* Right Column: Recent Payments (Smaller) */}
                <div className="lg:col-span-2 space-y-4">
                     <h2 className="section-title">
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                        Pagos Recientes
                     </h2>

                    <div className="content-card">
                        <div className="divide-y divide-slate-800/50 max-h-[500px] overflow-y-auto">
                            {pagos?.map((pago: any) => (
                                <div key={pago.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between gap-4 group cursor-default">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition-all">
                                            <DollarSign className="w-4 h-4 text-emerald-500" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-200 text-sm group-hover:text-white transition-colors flex items-center gap-2">
                                                {pago.cronograma_cuotas?.prestamos?.clientes?.nombres || 'Cliente'}
                                                {pago.metodo_pago && pago.metodo_pago !== 'Efectivo' && (
                                                    <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                                                        {pago.metodo_pago}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                                                {format(new Date(pago.fecha_pago), 'dd MMM', { locale: es })} • Cuota #{pago.cronograma_cuotas?.numero_cuota || '-'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="text-right">
                                        <div className="text-base font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                            +${pago.monto_pagado}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            
                            {(!pagos || pagos.length === 0) && (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                    <div className="w-14 h-14 bg-slate-800/50 rounded-full flex items-center justify-center mb-3 border border-slate-800">
                                        <div className="flex gap-1">
                                            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" />
                                        </div>
                                    </div>
                                    <h3 className="font-medium text-slate-400">Sin movimientos recientes</h3>
                                    <p className="text-sm text-slate-600 mt-1 text-center max-w-[180px]">
                                        Los últimos pagos aparecerán aquí
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
