import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, TrendingUp, AlertCircle, Users } from "lucide-react";
import { PrestamosTable } from "@/components/prestamos/prestamos-table";
import { BackButton } from "@/components/ui/back-button";
import { getTodayPeru, calculateLoanMetrics } from "@/lib/financial-logic";

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PrestamosPage() {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();

    // Get current user and role
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user?.id)
        .single()

    const userRole = perfil?.rol || 'asesor'

    // Build query based on role - USING DIRECT TABLES (Fallback mechanism)
    
    // 0. Auto-update Mora Status (Robot)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('actualizar_estados_mora')
    if (rpcError) console.error('Error running Mora Robot:', rpcError)
    else console.log('🤖 Mora Robot Result:', rpcResult)

    // Fetch relations to calculate KPIs in memory - NO CACHE
    // Force fresh data after the update
    const { data: prestamosRaw, error } = await supabaseAdmin
        .from('prestamos')
        .select(`
            *,
            clientes (
                *,
                sectores (id, nombre),
                solicitudes (gps_coordenadas, created_at),
                asesor:asesor_id(nombre_completo)
            ),
            cronograma_cuotas (
                *,
                pagos (created_at)
            )
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching loans:', error)
        return <div className="p-8 text-center text-red-500 font-bold">Error al cargar préstamos: {error.message}</div>;
    }

    console.log('📉 Prestamos fetched:', prestamosRaw?.length)
    prestamosRaw?.forEach(p => console.log(`ID: ${p.id.slice(0,4)}... | Estado: ${p.estado} | Mora: ${p.estado_mora}`))

    // Fetch Configuración Sistema BEFORE mapping
    const { data: configSistema } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['renovacion_min_pagado', 'refinanciacion_min_mora', 'umbral_cpp_cuotas', 'umbral_moroso_cuotas', 'umbral_cpp_otros', 'umbral_moroso_otros'])
    
    // Valor por defecto 60% si no existe
    const configRenovacionValor = configSistema?.find(c => c.clave === 'renovacion_min_pagado')?.valor
    const renovacionMinPagado = configRenovacionValor ? parseInt(configRenovacionValor) : 60
    const renovacionMinPagadoDecimal = renovacionMinPagado / 100

    // Valor por defecto 50% si no existe
    const configRefinanciacionValor = configSistema?.find(c => c.clave === 'refinanciacion_min_mora')?.valor
    const refinanciacionMinMora = configRefinanciacionValor ? parseInt(configRefinanciacionValor) : 50

    // Umbrales de mora
    const umbralCpp = parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_cuotas')?.valor || '4')
    const umbralMoroso = parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_cuotas')?.valor || '7')
    const umbralCppOtros = parseInt(configSistema?.find(c => c.clave === 'umbral_cpp_otros')?.valor || '1')
    const umbralMorosoOtros = parseInt(configSistema?.find(c => c.clave === 'umbral_moroso_otros')?.valor || '2')

    // Fetch HORARIO
    const { data: configHorario } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
    
    const systemSchedule = {
        horario_apertura: configHorario?.find(c => c.clave === 'horario_apertura')?.valor || '07:00',
        horario_cierre: configHorario?.find(c => c.clave === 'horario_cierre')?.valor || '20:00',
        desbloqueo_hasta: configHorario?.find(c => c.clave === 'desbloqueo_hasta')?.valor || ''
    }

    // Filter and Process Data in Memory (Robustness)
    let filteredList = prestamosRaw || []

    // 1. Role Filtering
    if (userRole === 'asesor') {
        filteredList = filteredList.filter(p => p.clientes?.asesor_id === user?.id)
    } else if (userRole === 'supervisor') {
         const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user?.id)
         const asesorIds = asesores?.map(a => a.id) || []
         filteredList = filteredList.filter(p => asesorIds.includes(p.clientes?.asesor_id))
    }

    // 2. KPI Calculation & Mapping
    const prestamos = filteredList.map(p => {
        const todayPeru = getTodayPeru()
        const metrics = calculateLoanMetrics(p, todayPeru, { 
            renovacionMinPagado, 
            umbralCpp, 
            umbralMoroso,
            umbralCppOtros,
            umbralMorosoOtros
        })
        
        const totalPagar = p.monto * (1 + (p.interes / 100))
        


        // Extract Coordinates
        const solicitudesCoords = p.clientes?.solicitudes
            ?.filter((s: any) => s.gps_coordenadas)
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
            cobrado_hoy: metrics.cobradoHoy,
            total_pagado_acumulado: metrics.totalPagadoAcumulado,
            riesgo_capital_real_porcentaje: metrics.riesgoPorcentaje,
            dias_sin_pago: metrics.diasSinPago,
            valor_cuota_promedio: metrics.valorCuotaPromedio,
            cuotas_mora_real: metrics.cuotasAtrasadas,
            
            es_renovable: metrics.esRenovable,
            isFinalizado: p.estado === 'finalizado',
            
            // Attach metrics for optimized aggregate calculation
            metrics: metrics,
            
            clientes: p.clientes
        }
    })

    // 3. Totals for Dashboard
    // 3. Totals for Dashboard
    // Total Colocado = Cartera Activa (Total Pagar - Total Pagado de activos)
    const totalPrestado = prestamos.filter(p => p.estado === 'activo').reduce((acc, p) => {
        const deudaTotal = (parseFloat(p.monto) * (1 + (parseFloat(p.interes)/100)))
        const pagado = p.total_pagado_acumulado || 0
        return acc + Math.max(0, deudaTotal - pagado)
    }, 0)

    const activeLoans = prestamos.filter(p => p.estado === 'activo').length
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

    const totalPagado = prestamos.reduce((acc, p) => acc + (p.total_pagado_acumulado || 0), 0)
    const totalDeudaConInteres = prestamos.reduce((acc, p) => acc + (parseFloat(p.monto) * (1 + (parseFloat(p.interes)/100))), 0) || 1
    const porcentajeRecuperacion = (totalPagado / totalDeudaConInteres) * 100

    // Cap. Riesgo = Deuda Pendiente de préstamos con riesgo > 10%
    const capitalEnRiesgo = prestamos.filter(p => p.riesgo_capital_real_porcentaje > 10)
        .reduce((acc, p) => {
            const deudaTotal = (parseFloat(p.monto) * (1 + (parseFloat(p.interes)/100)))
            const pagado = p.total_pagado_acumulado || 0
            return acc + Math.max(0, deudaTotal - pagado)
        }, 0)
    
    // Alertas Graves (Supervisor Rule):
    // Daily -> 7+ overdue. Other -> 2+ overdue.
    // Alertas Graves (Supervisor Rule):
    // Daily -> 7+ overdue. Other -> 2+ overdue.
    const alertasGraves = prestamos.filter(p => p.metrics?.isCritico).length
    
    // Mora (Supervisor Rule - Early Deterioration):
    const clientesEnMora = prestamos.filter(p => p.metrics?.isMora).length

    // Meta de Ruta Hoy: Suma de lo que falta cobrar hoy (sin los adelantos previos)
    const prestamosActivosHoy = prestamos.filter(p => p.estado === 'activo')
    const metaCobranzaHoy = prestamosActivosHoy.reduce((acc: number, p: any) => acc + (p.cuota_dia_hoy || 0), 0)
    const recaudadoTotalHoy = prestamosActivosHoy.reduce((acc: number, p: any) => acc + (p.cobrado_hoy || 0), 0)
    
    // Pendientes Hoy: Clientes que tienen pago programado hoy > 0 y pendiente
    const clientesPendientesHoy = prestamos.filter(p => p.cuota_dia_hoy > 0).length
    
    const oportunidadesRenovacion = prestamos.filter(p => p.es_renovable).length

    // Component Prop Compatibility
    const overdueAmount = metaCobranzaHoy

    // ... Perfiles logic for filters ...
    let perfiles: any[] = []
    if (userRole === 'admin' || userRole === 'supervisor') {
        const { data: profiles } = await supabaseAdmin
            .from('perfiles')
            .select('*')
        perfiles = profiles || []
    }

    // Obtener IDs de préstamos con solicitudes de renovación pendientes
    // Estados pendientes: pendiente_supervision, en_correccion, pre_aprobado
    const { data: solicitudesPendientes } = await supabaseAdmin
        .from('solicitudes_renovacion')
        .select('prestamo_id')
        .in('estado_solicitud', ['pendiente_supervision', 'en_correccion', 'pre_aprobado'])
    
    const prestamoIdsConSolicitudPendiente = solicitudesPendientes?.map(s => s.prestamo_id) || []

    // Obtener IDs de préstamos que son producto de una refinanciación directa
    // (el préstamo nuevo generado cuando el admin refinanció uno en mora)
    const { data: renovacionesRefinanciamiento } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
    
    const prestamoIdsProductoRefinanciamiento = (renovacionesRefinanciamiento || [])
        .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
        .map((r: any) => r.prestamo_nuevo_id as string)
        .filter(Boolean)

    // 5. Configuración del Sistema (movido arriba para aplicar a las verificaciones del map)

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header with Title and Action Button */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
                <div>
                     <div className="flex items-center gap-3 text-white">
                        <BackButton />
                        <h1 className="text-xl md:text-3xl font-bold tracking-tight">Panel de Préstamos</h1>
                     </div>
                     <p className="text-slate-400 mt-2 md:mt-1">
                        {userRole === 'admin' ? 'Visión Global y Rentabilidad' : 
                         userRole === 'supervisor' ? 'Supervisión de Riesgo y Alertas' : 
                         'Gestión Diaria de Cobranza'}
                     </p>
                </div>
            </div>

            {/* Dynamic Hero Stats - Compact Mode for Mobile */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                
                {/* ---------------- ADMIN VIEW ---------------- */}
                {userRole === 'admin' && (
                    <>
                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <Wallet className="w-16 h-16 text-blue-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Cartera Por Cobrar</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white truncate">${totalPrestado.toLocaleString()}</h2>
                            <div className="mt-2 flex items-center text-blue-400">
                                <span className="bg-blue-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-900/50">{activeLoans} Activos</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <TrendingUp className="w-16 h-16 text-emerald-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Recuperación Global</p>
                            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{porcentajeRecuperacion.toFixed(1)}%</h2>
                            <p className="text-emerald-400 font-medium text-sm mt-0.5 flex items-center gap-2">
                                ${totalPagado.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-wider">Recaudado</span>
                            </p>
                        </div>

                        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <AlertCircle className="w-16 h-16 text-rose-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Cap. Riesgo</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white truncate">${capitalEnRiesgo.toLocaleString()}</h2>
                            <div className="mt-2 text-rose-400">
                                <span className="bg-rose-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-900/50">
                                    {clientesEnMora} Críticos
                                </span>
                            </div>
                        </div>
                    </>
                )}

                {/* ---------------- SUPERVISOR VIEW ---------------- */}
                {/* ---------------- SUPERVISOR VIEW ---------------- */}
                {userRole === 'supervisor' && (
                    <>
                        <Link href="/dashboard/prestamos?tab=supervisor_alertas" className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-colors cursor-pointer" title="Frecuencia Diario: >7 cuotas. Otros: >2 cuotas.">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <AlertCircle className="w-16 h-16 text-rose-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Alertas (Alto Riesgo)</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white">{alertasGraves}</h2>
                            <div className="mt-2 text-rose-400">
                                <span className="bg-rose-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-900/50 animate-pulse group-hover:bg-rose-900 transition-colors">
                                    Ver Casos
                                </span>
                            </div>
                        </Link>

                         <Link href="/dashboard/prestamos?tab=supervisor_mora" className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-colors cursor-pointer" title="Frecuencia Diario: >4 cuotas. Otros: >1 cuota.">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <TrendingUp className="w-16 h-16 text-amber-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Total Mora</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white">{clientesEnMora}</h2>
                            <div className="mt-2 text-amber-400 flex items-center gap-1">
                                <span className="bg-amber-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-900/50 group-hover:bg-amber-900 transition-colors">
                                    Ver Mora
                                </span>
                            </div>
                        </Link>

                        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <Wallet className="w-16 h-16 text-slate-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Supervisado</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white truncate">${totalPrestado.toLocaleString()}</h2>
                            <div className="mt-2 text-slate-400">
                                <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">
                                    {activeLoans} Activos
                                </span>
                            </div>
                        </div>
                    </>
                )}

                {/* ---------------- ASESOR VIEW ---------------- */}
                {userRole === 'asesor' && (
                    <>
                        {/* ... existing asesor cards ... */}
                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <Wallet className="w-16 h-16 text-emerald-500" />
                            </div>
                             <p className="text-emerald-500 font-bold text-[10px] uppercase tracking-wider mb-1">Meta Hoy</p>
                             <div className="flex items-baseline gap-2">
                                <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight truncate">${recaudadoTotalHoy.toLocaleString()}</h2>
                                <span className="text-slate-500 text-xs font-medium">/ ${metaCobranzaHoy.toLocaleString()}</span>
                             </div>
                             <div className="mt-2 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-500 transition-all duration-500" 
                                    style={{ width: `${metaCobranzaHoy > 0 ? (recaudadoTotalHoy / metaCobranzaHoy) * 100 : 0}%` }}
                                />
                             </div>
                             <p className="mt-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                                {metaCobranzaHoy > 0 ? Math.round((recaudadoTotalHoy / metaCobranzaHoy) * 100) : 0}% Cobrado
                             </p>
                        </div>

                         <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <Users className="w-16 h-16 text-blue-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Pendientes</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white">{clientesPendientesHoy}</h2>
                            <div className="mt-2 text-blue-400 flex items-center gap-1">
                                <span className="bg-blue-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-900/50">
                                    Clientes
                                </span>
                            </div>
                        </div>

                         <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group">
                             <div className="absolute right-0 top-0 p-2 opacity-5">
                                <TrendingUp className="w-16 h-16 text-yellow-500" />
                            </div>
                            <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Renovaciones</p>
                            <h2 className="text-xl md:text-3xl font-bold text-white">{oportunidadesRenovacion}</h2>
                            <div className="mt-2 text-yellow-400">
                                <span className="bg-yellow-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-yellow-900/50 animate-pulse">
                                    Disponibles
                                </span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Info Legend - Only for Admin/Supervisor */}
            {['admin', 'supervisor'].includes(userRole) && (
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex flex-col md:flex-row gap-4">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                        <div>
                            <span className="text-rose-400 font-bold">MOROSO:</span> Diario ≥{umbralMoroso} atr. Otros ≥{umbralMorosoOtros} atr.
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                            <span className="text-amber-400 font-bold">CPP:</span> Diario ≥{umbralCpp} atr. Otros ≥{umbralCppOtros} atr.
                        </div>
                    </div>
                </div>
            )}

            {/* Prestamos Table with Filters */}
            <PrestamosTable 
                prestamos={prestamos || []} 
                today={today}
                totalPrestado={totalPrestado}
                overdueAmount={overdueAmount}
                perfiles={perfiles}
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
            />
        </div>
    )
}
