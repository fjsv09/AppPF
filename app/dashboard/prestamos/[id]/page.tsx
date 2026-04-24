import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CronogramaClient } from "@/components/prestamos/cronograma-client"; 
import { ContratoGenerator } from "@/components/prestamos/contrato-generator";
import { SolicitudRenovacionModal } from "@/components/prestamos/solicitud-renovacion-modal";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ClientMiniCard } from "@/components/prestamos/client-mini-card";
import { UploadEvidenceButton } from '@/components/dashboard/upload-evidence-button'
import { Calendar, DollarSign, Percent, User, Users, CreditCard, AlertTriangle, Lock, Loader2 } from "lucide-react";
import Link from "next/link";
import { LoanTabs } from "@/components/prestamos/loan-tabs";
import { BackButton } from "@/components/ui/back-button";
import { getTodayPeru, calculateLoanMetrics, getLoanStatusUI, calculateLoanScore, getComprehensiveEvaluation, getLoanHealthScoreAction } from "@/lib/financial-logic";
import { cn, getFrequencyBadgeStyles } from "@/lib/utils";


export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: { id: string } }) {
    return {
        title: `Detalle Préstamo #${params.id.slice(0, 8)}`
    }
}

export default async function LoanDetailPage({ params, searchParams }: { params: { id: string }, searchParams: { [key: string]: string | string[] | undefined } }) {
    const isContractTab = searchParams.tab === 'contrato';

    const supabaseAdmin = createAdminClient();
    const { data: prestamo } = await supabaseAdmin
        .from('prestamos')
        .select('*, clientes(*, asesor:asesor_id(nombre_completo))')
        .eq('id', params.id)
        .single();

    if (!prestamo) return <div>Préstamo no encontrado</div>;

    const { data: cronograma } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('*')
        .eq('prestamo_id', params.id)
        .order('numero_cuota', { ascending: true });

    const { data: solicitudRenovacion } = await supabaseAdmin
        .from('solicitudes_renovacion')
        .select('id, estado_solicitud')
        .eq('prestamo_id', params.id)
        .in('estado_solicitud', ['pendiente_supervision', 'en_correccion', 'pre_aprobado'])
        .maybeSingle()

    const { data: origenRenovacion } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_original:prestamo_original_id(estado)')
        .eq('prestamo_nuevo_id', prestamo.id)
        .maybeSingle()

    const esProductoDeRefinanciamiento = (origenRenovacion?.prestamo_original as any)?.estado === 'refinanciado'

    const { data: configRefinanciacionRaw } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'refinanciacion_min_mora')
        .single()
    const refinanciacionMinMora = configRefinanciacionRaw?.valor ? parseInt(configRefinanciacionRaw.valor) : 50

    const { data: configRenovacionRaw } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'renovacion_min_pagado')
        .single()
    const renovacionMinPagado = configRenovacionRaw?.valor ? parseInt(configRenovacionRaw.valor) : 68

    const { data: scheduleConfigs } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta', 'horario_fin_turno_1'])
    
    const systemSchedule = (scheduleConfigs || []).reduce((acc: any, curr) => {
        acc[curr.clave] = curr.valor
        return acc
    }, {
        horario_apertura: '10:00',
        horario_cierre: '19:00',
        horario_fin_turno_1: '13:00',
        desbloqueo_hasta: '2000-01-01T00:00:00Z'
    })

    const { data: tareasEvidenciaAll } = await supabaseAdmin
        .from('tareas_evidencia')
        .select(`*, asesor:asesor_id(nombre_completo)`)
        .eq('prestamo_id', params.id)
        .neq('tipo', 'auditoria_dirigida')
        .filter('tipo', 'not.in', '("visita_asignada","gestion_asignada")')
        .order('created_at', { ascending: false });

    const tareaEvidencia = tareasEvidenciaAll?.[0] || null;

    const { data: tareasGestionAll } = await supabaseAdmin
        .from('tareas_evidencia')
        .select(`*, asesor:asesor_id(nombre_completo)`)
        .eq('prestamo_id', params.id)
        .filter('tipo', 'in', '("visita_asignada","gestion_asignada")')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false });

    const tareaGestion = tareasGestionAll?.[0] || null;

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    let userRole: string | null = null
    if (user) {
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()
        userRole = perfil?.rol || null
    }

    const { data: todosLosPrestamos } = await supabaseAdmin
        .from('prestamos')
        .select('id, estado, fecha_inicio, created_at')
        .eq('cliente_id', prestamo.cliente_id)
        .in('estado', ['activo', 'finalizado'])
        .order('created_at', { ascending: true })

    const prestamosFinalizados = todosLosPrestamos?.filter(p => p.estado === 'finalizado') || []
    const esParalelo = prestamo.es_paralelo || false
    let esElegibleParaRenovar = false

    // RESTRICCIÓN DE ACCESO CENTRALIZADA
    const { checkSystemAccess } = await import('@/utils/systemRestrictions')
    const accessResult = await checkSystemAccess(supabaseAdmin, user?.id || '', userRole || 'asesor', 'prestamo')
    
    const isBlockedByCuadre = !accessResult.allowed && userRole !== 'admin'
    const blockReasonCierre = accessResult.reason || ''
    const systemAccess = accessResult
    const canOperateDueToTime = accessResult.allowed || userRole === 'admin'
    const currentSystemSchedule = accessResult.config || systemSchedule

    const totalDinero = cronograma?.reduce((acc, c) => acc + Number(c.monto_cuota), 0) || 0;
    const totalPagado = cronograma?.reduce((acc, c) => acc + Number(c.monto_pagado || 0), 0) || 0;
    const porcentajePagadoActual = totalDinero > 0 ? (totalPagado / totalDinero) * 100 : 0;
    const cumpleLimiteRenovacion = porcentajePagadoActual >= renovacionMinPagado;

    if (userRole === 'admin') {
        // El admin puede renovar si el préstamo está finalizado (100% pagado)
        // O si está activo Y cumple el límite de flujo de renovación estándar.
        // Si no cumple el % pero el admin quiere forzarlo, usará el flujo de Refinanciación Directa
        if (prestamo.estado === 'finalizado') {
            esElegibleParaRenovar = true;
        } else if (prestamo.estado === 'activo' && cumpleLimiteRenovacion) {
            esElegibleParaRenovar = true;
        } else {
            esElegibleParaRenovar = false; // El botón "Renovar" desaparece si no cumple el %, forzando "Refinanciar" si aplica
        }
    } else if (userRole === 'asesor') {
        // El asesor NO puede renovar préstamos paralelos.
        if (!esParalelo) {
            if (prestamo.estado === 'activo' && cumpleLimiteRenovacion) {
                esElegibleParaRenovar = true
            } else if (prestamo.estado === 'finalizado' && prestamosFinalizados.length > 0) {
                const esUltimoFinalizado = prestamosFinalizados[prestamosFinalizados.length - 1].id === prestamo.id
                esElegibleParaRenovar = esUltimoFinalizado
            }
        }
    }
    
    const { data: qCuentas } = await supabaseAdmin
        .from('cuentas_financieras')
        .select('id, nombre, saldo, cartera_id, usuarios_autorizados')
        .order('nombre')
    
    const cuentas = (qCuentas || []).filter((c: any) => 
        c.cartera_id === '00000000-0000-0000-0000-000000000000' || 
        (c.usuarios_autorizados && c.usuarios_autorizados.length > 0)
    )

    const { data: cuotasIds } = await supabaseAdmin.from('cronograma_cuotas').select('id').eq('prestamo_id', params.id);
    const idsCuotas = cuotasIds?.map(c => c.id) || [];
    let pagos: any[] = [];
    if (idsCuotas.length > 0) {
        const { data: fullData } = await supabaseAdmin
            .from('pagos')
            .select(`
                *, 
                perfiles(nombre_completo), 
                cronograma_cuotas(numero_cuota, fecha_vencimiento),
                pagos_distribucion(*)
            `)
            .in('cuota_id', idsCuotas)
            .neq('estado_verificacion', 'rechazado')
            .order('created_at', { ascending: false });
        pagos = fullData || [];
    }

    const todayPeru = getTodayPeru()

    const metrics = calculateLoanMetrics({ 
        ...prestamo, 
        cronograma_cuotas: cronograma || [] 
    }, todayPeru, { 
        renovacionMinPagado, 
        umbralCpp: 4, 
        umbralMoroso: 7, 
        umbralCppOtros: 1, 
        umbralMorosoOtros: 2 
    }, pagos)

    // [ATOMICO] Calcular Salud del Préstamo (La "Verdad" de 18 PTS)
    // Este orquestadorFetch realiza su propia consulta para garantizar paridad total.
    const loanScore = await getLoanHealthScoreAction(supabaseAdmin, prestamo.id)

    // [INTEGRAL] Calcular evaluación completa para el resto del sistema (Reputación)
    const evaluation = getComprehensiveEvaluation(
        prestamo.clientes,
        (todosLosPrestamos || []).map(p => p.id === prestamo.id ? { ...prestamo, cronograma_cuotas: cronograma } : p),
        pagos,
        prestamo.id
    )

    // [BLOQUEO MIGRACIÓN] Si es un préstamo migrado ya pagado (o sin saldo), 
    // solo permitimos renovar si es el más reciente de todo su historial.
    const isMigrado = prestamo.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
    const effectivelyFinalized = prestamo.estado === 'finalizado' || (metrics.saldoPendiente <= 0.01)

    if (isMigrado && effectivelyFinalized && todosLosPrestamos && todosLosPrestamos.length > 0) {
        const latestLoan = todosLosPrestamos[todosLosPrestamos.length - 1]
        if (latestLoan.id !== prestamo.id) {
            esElegibleParaRenovar = false
        }
    }
    
    const esUltimoPrestamo = esElegibleParaRenovar

    const esRefinanciado = prestamo.estado === 'refinanciado'
    const esCandidatoRefinanciacionAdmin = (metrics.riesgoPorcentaje >= refinanciacionMinMora) && (userRole === 'admin');
    const esRenovacionParaleloAdmin = esParalelo && (userRole === 'admin');
    const esFlujoRefinanciacionAdmin = esCandidatoRefinanciacionAdmin || esRenovacionParaleloAdmin;

    const tieneSolicitudPendiente = !!solicitudRenovacion
    const puedeRenovar = userRole && !prestamo.clientes?.bloqueado_renovacion && (
        (userRole === 'admin') || 
        (userRole === 'asesor' && !esParalelo && !esRefinanciado && !esProductoDeRefinanciamiento) ||
        (userRole === 'supervisor' && !esProductoDeRefinanciamiento)
    )
    
    const mostrarBotonRenovacion = esUltimoPrestamo && !tieneSolicitudPendiente && (
        prestamo.estado === 'activo' || 
        prestamo.estado === 'finalizado'
    ) && (puedeRenovar || esFlujoRefinanciacionAdmin)

    // [NUEVO] Obtener cuadres de hoy para validación visual de edición
    let cuadresHoy: any[] = []
    if (pagos.length > 0) {
        const uniqueAsesores = Array.from(new Set(pagos.map(p => p.registrado_por).filter(Boolean)))
        const { data: qCuadres } = await supabaseAdmin
            .from('cuadres_diarios')
            .select('asesor_id, tipo_cuadre, created_at, estado')
            .eq('fecha', todayPeru)
            .in('asesor_id', uniqueAsesores)
            .in('estado', ['pendiente', 'aprobado'])
        
        cuadresHoy = qCuadres || []
    }

    return (
        <div className="page-container max-w-full overflow-x-hidden">
            {esProductoDeRefinanciamiento && (
                <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3 md:p-4 flex items-center gap-3 md:gap-4 shadow-lg mx-0.5 mb-4">
                    <div className="bg-amber-500/20 p-2 rounded-full shrink-0">
                        <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                    </div>
                    <div>
                        <h4 className="text-amber-400 font-bold text-sm md:text-base tracking-tight leading-tight">Préstamo Refinanciado</h4>
                        <p className="text-amber-200/70 text-[10px] md:text-sm mt-0.5 leading-snug">Este préstamo es el resultado de una refinanciación directa debido a mora o atrasos.</p>
                    </div>
                </div>
            )}

            {prestamo.clientes?.bloqueado_renovacion && (
                <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3 md:p-4 flex items-center gap-3 md:gap-4 shadow-lg mx-0.5 mb-4">
                    <div className="bg-amber-500/20 p-2 rounded-full shrink-0">
                        <Lock className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                    </div>
                    <div>
                        <h4 className="text-amber-400 font-bold text-sm md:text-base tracking-tight leading-tight">Cliente Bloqueado para Renovación</h4>
                        <p className="text-amber-200/70 text-[10px] md:text-sm mt-0.5 leading-snug">Este cliente ha sido bloqueado y no podrá solicitar nuevas renovaciones hasta que un administrador lo desbloquee.</p>
                    </div>
                </div>
            )}

            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-slate-800 shadow-xl flex flex-col mx-0.5">
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-50 z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl opacity-50 z-0 pointer-events-none" />
                
                {/* BANNER DE BLOQUEO GLOBAL (NUEVA UBICACIÓN) */}
                {(!canOperateDueToTime || isBlockedByCuadre) && (
                    <div className={cn(
                        "relative z-20 w-full px-6 py-4 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left border-b",
                        isBlockedByCuadre 
                            ? "bg-rose-500/20 border-rose-500/30" 
                            : "bg-amber-500/10 border-amber-500/20"
                    )}>
                        <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                            isBlockedByCuadre ? "bg-rose-500/20" : "bg-amber-500/20"
                        )}>
                            <Lock className={cn("w-5 h-5", isBlockedByCuadre ? "text-rose-500" : "text-amber-500")} />
                        </div>
                        <div className="flex-1">
                            <h4 className={cn("font-bold text-sm uppercase tracking-wider", isBlockedByCuadre ? "text-rose-400" : "text-amber-400")}>
                                {isBlockedByCuadre ? "Operaciones Restringidas" : "Sistema Bloqueado"}
                            </h4>
                            <p className="text-slate-300 text-xs mt-0.5 font-medium leading-relaxed">
                                {blockReasonCierre}
                            </p>
                        </div>
                    </div>
                )}

                <div className="relative z-10 p-4 md:p-6 text-white">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 md:gap-4 mb-6 md:mb-8">
                        <div className="flex items-center gap-2.5 w-full lg:w-auto">
                            <BackButton />
                            <ClientMiniCard 
                                clienteId={prestamo.cliente_id}
                                nombres={prestamo.clientes?.nombres}
                                fotoPerfil={prestamo.clientes?.foto_perfil}
                                className="h-10 md:h-11 shadow-sm bg-white/10 border-white/20"
                            />
                            {esParalelo && (
                                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 font-bold ml-2 shadow-sm uppercase tracking-wider text-[10px] md:text-xs">PARALELO</Badge>
                            )}
                        </div>

                        <div className="lg:hidden w-full flex justify-end">
                            <div className="flex items-center gap-2 md:gap-3 bg-white/5 h-10 px-3 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer group w-fit min-w-[140px]">
                                <div className="h-7 w-7 shrink-0 rounded-full bg-slate-800 flex items-center justify-center shadow-lg border border-white/10 group-hover:scale-105 transition-transform overflow-hidden relative">
                                    <Users className="w-3.5 h-3.5 text-blue-400" />
                                </div>
                                <div className="flex flex-col justify-center min-w-0">
                                    <span className="text-[8px] md:text-[9px] text-blue-200/50 font-black uppercase tracking-[0.15em] leading-none mb-0.5">Asesor</span>
                                    <span className="font-bold text-xs text-white/90 leading-tight truncate group-hover:text-blue-300 transition-colors">
                                        {prestamo.clientes?.asesor?.nombre_completo || 'No asignado'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-row items-center gap-3 lg:gap-4 w-full lg:w-auto">
                            <div className="flex items-center gap-2 w-full lg:w-auto">
                                <div className="flex-1 lg:flex-none lg:w-auto">
                                    <ContratoGenerator prestamo={prestamo} cronograma={cronograma || []} defaultOpen={isContractTab} />
                                </div>

                                <div className="flex-1 lg:flex-none lg:w-auto">
                                    {mostrarBotonRenovacion && (
                                        <SolicitudRenovacionModal 
                                                {...{ 
                                                    prestamoId: prestamo.id, 
                                                    clienteId: prestamo.cliente_id || prestamo.clientes?.id || '',
                                                    clienteNombre: prestamo.clientes?.nombres || 'Cliente', 
                                                    clienteFotoPerfil: prestamo.clientes?.foto_perfil,
                                                    clienteTelefono: prestamo.clientes?.telefono,
                                                    currentMonto: prestamo.monto,
                                                    currentInteres: prestamo.interes,
                                                    currentModalidad: prestamo.frecuencia?.toLowerCase() || 'diario',
                                                    currentCuotas: prestamo.cuotas || 30,
                                                    solicitudPendiente: solicitudRenovacion,
                                                    userRole: userRole || 'asesor',
                                                    esRefinanciado,
                                                    isAdminDirectRefinance: esFlujoRefinanciacionAdmin,
                                                    esProductoDeRefinanciamiento,
                                                    systemSchedule: currentSystemSchedule,
                                                    isBlockedByCuadre,
                                                    blockReasonCierre,
                                                    cuentas
                                                }}
                                                trigger={
                                                    <Button 
                                                        disabled={(!canOperateDueToTime && userRole !== 'admin') || isBlockedByCuadre}
                                                        className={cn(
                                                            "h-9 text-[11px] md:text-xs bg-gradient-to-r text-white rounded-xl flex items-center justify-center gap-2 px-3 shadow-md w-full",
                                                            (canOperateDueToTime && !isBlockedByCuadre)
                                                                ? (esFlujoRefinanciacionAdmin ? "from-purple-600 to-indigo-600" : "from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400")
                                                                : "from-slate-700 to-slate-800 opacity-60 cursor-not-allowed"
                                                        )}
                                                    >
                                                        {(canOperateDueToTime && !isBlockedByCuadre) ? <Calendar className="w-3.5 h-3.5 shrink-0" /> : <Lock className="w-3.5 h-3.5 shrink-0" />}
                                                        <span className="font-bold uppercase tracking-tight">
                                                            {isBlockedByCuadre ? 'Bloqueado' : 
                                                             !canOperateDueToTime ? 'Cerrado' :
                                                             userRole === 'supervisor' ? 'Ver Evaluación' :
                                                             (esFlujoRefinanciacionAdmin ? (esRenovacionParaleloAdmin ? 'Renovar Paralelo' : 'Refinanciar') : 'Renovar')}
                                                        </span>
                                                    </Button>
                                                }
                                        />
                                    )}
                                </div>
                            </div>
                            
                            <div className="hidden lg:flex items-center gap-4">
                                <div className="w-px h-8 bg-white/10 mx-1" />
                                <div className="flex items-center gap-2 md:gap-3 bg-white/5 h-11 px-3 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer group w-fit min-w-[140px]">
                                    <div className="h-7 w-7 md:h-8 md:w-8 shrink-0 rounded-full bg-slate-800 flex items-center justify-center shadow-lg border border-white/10 group-hover:scale-105 transition-transform overflow-hidden relative">
                                        <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
                                    </div>
                                    <div className="flex flex-col justify-center min-w-0">
                                        <span className="text-[8px] md:text-[9px] text-blue-200/50 font-black uppercase tracking-[0.15em] leading-none mb-0.5">Asesor</span>
                                        <span className="font-bold text-xs md:text-sm text-white/90 leading-tight truncate group-hover:text-blue-300 transition-colors">
                                            {prestamo.clientes?.asesor?.nombre_completo || 'No asignado'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 lg:grid-cols-9 gap-y-6 gap-x-2 pt-4 md:pt-6 border-t border-white/10 relative z-10 w-full">
                        {/* MONTO */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Monto</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full">
                                <p className="text-xs md:text-2xl font-black text-white leading-none tracking-tight">${prestamo.monto?.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* INTERES */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Interés</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full">
                                <p className="text-xs md:text-2xl font-black text-white leading-none tracking-tight">{prestamo.interes}%</p>
                            </div>
                        </div>

                        {/* FRECUENCIA */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Frecuencia</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full">
                                <Badge className={cn(
                                    "text-[9px] md:text-sm font-black px-2 py-0.5 rounded-lg border uppercase tracking-wider",
                                    getFrequencyBadgeStyles(prestamo.frecuencia)
                                )}>
                                    {prestamo.frecuencia}
                                </Badge>
                            </div>
                        </div>

                        {/* CUOTAS */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Cuotas</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full">
                                <p className="text-xs md:text-2xl font-black text-white leading-none tracking-tight">{prestamo.cuotas}</p>
                            </div>
                        </div>

                        {/* SALDO PARCIAL */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Saldo</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full">
                                <p className={cn(
                                    "text-xs md:text-2xl font-black leading-none tracking-tight",
                                    metrics.saldoCuotaParcial > 0 ? "text-blue-400" : "text-white/30"
                                )}>
                                    ${metrics.saldoCuotaParcial.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* PROGRESO */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Prog.</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex flex-col justify-end items-center w-full text-center">
                                {metrics.totalCuotas > 0 && (
                                    <div className="mb-0.5">
                                        {metrics.cuotasPagadas >= metrics.totalCuotas ? (
                                            <span className="text-[7px] md:text-[10px] text-emerald-500 font-bold whitespace-nowrap">✅ FINALIZADO</span>
                                        ) : (
                                            <span className={cn(
                                                "text-[7px] md:text-[10px] font-bold whitespace-nowrap",
                                                metrics.cuotasAtrasadas > 0 ? "text-amber-500" : "text-emerald-500"
                                            )}>
                                                {metrics.cuotasAtrasadas > 0 ? `⚠️ ${metrics.cuotasAtrasadas} ATR` : '✅ AL DÍA'}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <p className="text-xs md:text-2xl font-black text-white leading-none tracking-tight">
                                    {metrics.cuotasPagadas}/{metrics.totalCuotas}
                                </p>
                            </div>
                        </div>

                        {/* ESTADO */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Estado</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full">
                                <div className="flex items-center gap-1 mb-0.5">
                                    {(() => {
                                        const statusUI = getLoanStatusUI({ ...prestamo, metrics, deudaHoy: metrics.deudaExigibleHoy });
                                        return (
                                            <>
                                                <span className={cn("w-1 h-1 md:w-1.5 md:h-1.5 rounded-full shrink-0", statusUI.animate && "animate-pulse", statusUI.bg.replace('bg-', 'bg-').replace('/20', ''))} style={{ backgroundColor: statusUI.marker }} />
                                                <span className={cn("text-[9px] md:text-base font-black uppercase tracking-wider", statusUI.color)}>{statusUI.label}</span>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* INICIO */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Inicio</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full text-center">
                                <p className="text-[9px] md:text-sm font-bold text-white/50 mb-0.5">{prestamo.fecha_inicio?.split('-').reverse().join('/')}</p>
                            </div>
                        </div>

                        {/* FIN */}
                        <div className="flex flex-col items-center justify-between h-full space-y-1.5 text-center">
                            <p className="text-blue-200/40 text-[7px] md:text-[9px] uppercase tracking-[0.15em] font-black w-full">Fin</p>
                            <div className="min-h-[2.2rem] md:min-h-[2.5rem] flex items-end justify-center w-full text-center">
                                <p className="text-[9px] md:text-sm font-bold text-white/50 mb-0.5">{prestamo.fecha_fin?.split('-').reverse().join('/')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Suspense fallback={
                <div className="flex flex-col items-center justify-center p-20 bg-slate-900/20 rounded-3xl border border-slate-800">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                    <p className="text-slate-500 text-sm font-medium">Cargando detalles del préstamo...</p>
                </div>
            }>
                <LoanTabs 
                    prestamo={prestamo} 
                    cronograma={cronograma || []} 
                    pagos={pagos || []}
                    cuadresHoy={cuadresHoy}
                    userRole={userRole as any} 
                    cliente={prestamo.clientes}
                    tareaEvidencia={tareaEvidencia}
                    systemSchedule={currentSystemSchedule}
                    isBlockedByCuadre={isBlockedByCuadre}
                    blockReasonCierre={blockReasonCierre}
                    systemAccess={systemAccess}
                    loanScore={loanScore}
                />
            </Suspense>
        </div>
    )
}
