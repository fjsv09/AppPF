
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CronogramaClient } from "@/components/prestamos/cronograma-client"; // Client Component for actions
import { ContratoGenerator } from "@/components/prestamos/contrato-generator";
import { SolicitudRenovacionModal } from "@/components/prestamos/solicitud-renovacion-modal";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ClientMiniCard } from "@/components/prestamos/client-mini-card";
import { UploadEvidenceButton } from '@/components/dashboard/upload-evidence-button'
import { Calendar, DollarSign, Percent, User, Users, CreditCard, AlertTriangle, Lock } from "lucide-react";
import Link from "next/link";
import { LoanTabs } from "@/components/prestamos/loan-tabs";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/ui/back-button";
import { checkAdvisorBlocked } from "@/utils/checkAdvisorBlocked";

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LoanDetailPage({ params, searchParams }: { params: { id: string }, searchParams: { [key: string]: string | string[] | undefined } }) {
    const isContractTab = searchParams.tab === 'contrato';

    // Use admin client to bypass RLS
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

    // Verificar si hay solicitud de renovación pendiente
    const { data: solicitudRenovacion } = await supabaseAdmin
        .from('solicitudes_renovacion')
        .select('id, estado_solicitud')
        .eq('prestamo_id', params.id)
        .in('estado_solicitud', ['pendiente_supervision', 'en_correccion', 'pre_aprobado'])
        .maybeSingle()

    // Verificar si este préstamo es producto de un refinanciamiento
    const { data: origenRenovacion } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_original:prestamo_original_id(estado)')
        .eq('prestamo_nuevo_id', prestamo.id)
        .maybeSingle()

    const esProductoDeRefinanciamiento = (origenRenovacion?.prestamo_original as any)?.estado === 'refinanciado'

    // Fetch Configuración Sistema para Refinanciacion Directa
    const { data: configRefinanciacionRaw } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'refinanciacion_min_mora')
        .single()
    const refinanciacionMinMora = configRefinanciacionRaw?.valor ? parseInt(configRefinanciacionRaw.valor) : 50

    // Fetch schedule config
    const { data: scheduleConfigs } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
    
    const systemSchedule = (scheduleConfigs || []).reduce((acc: any, curr) => {
        acc[curr.clave] = curr.valor
        return acc
    }, {
        horario_apertura: '07:00',
        horario_cierre: '20:00',
        desbloqueo_hasta: '2000-01-01T00:00:00Z'
    })

    // 1. Tarea de Evidencia Técnica (Fotos: Desembolso, Firma, etc.)
    const { data: tareasEvidenciaAll } = await supabaseAdmin
        .from('tareas_evidencia')
        .select(`
            *,
            asesor:asesor_id(nombre_completo)
        `)
        .eq('prestamo_id', params.id)
        .neq('tipo', 'auditoria_dirigida')
        .filter('tipo', 'not.in', '("visita_asignada","gestion_asignada")')
        .order('created_at', { ascending: false });

    const tareaEvidencia = tareasEvidenciaAll?.[0] || null;

    // 2. Tarea de Gestión Administrativa (Llamada, WhatsApp, Visita) - Solo la pendiente
    const { data: tareasGestionAll } = await supabaseAdmin
        .from('tareas_evidencia')
        .select(`
            *,
            asesor:asesor_id(nombre_completo)
        `)
        .eq('prestamo_id', params.id)
        .filter('tipo', 'in', '("visita_asignada","gestion_asignada")')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false });

    const tareaGestion = tareasGestionAll?.[0] || null;

    // Verificar si este es el ÚLTIMO préstamo del cliente (solo el último se puede renovar)
    const { data: prestamosDelCliente } = await supabaseAdmin
        .from('prestamos')
        .select('id, fecha_inicio, created_at')
        .eq('cliente_id', prestamo.cliente_id)
        .order('fecha_inicio', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
    
    const esUltimoPrestamo = prestamosDelCliente?.[0]?.id === prestamo.id

    // Obtener usuario actual y su rol
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

    // --- LOGICA DE HORARIO ---
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })
    const currentHourString = formatter.format(now)

    const apertura = systemSchedule.horario_apertura || '07:00'
    const cierre = systemSchedule.horario_cierre || '20:00'
    const desbloqueoHasta = systemSchedule.desbloqueo_hasta ? new Date(systemSchedule.desbloqueo_hasta) : null
    
    const isWithinHours = currentHourString >= apertura && currentHourString < cierre
    const isTemporaryUnlocked = desbloqueoHasta && now < desbloqueoHasta
    
    // Admins can always renovate? Request was for "also close renovations", let's be strict for advisors
    const canRenovateDueToTime = isWithinHours || isTemporaryUnlocked || userRole === 'admin'
    // --- FIN LOGICA DE HORARIO ---

    // Determinar Mora para Refinanciacion Admin
    const todayPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    const cuotasAtrasadas = cronograma ? cronograma.filter(c => 
        c.fecha_vencimiento < todayPeru && 
        c.estado !== 'pagado' && 
        (c.monto_cuota - (c.monto_pagado || 0)) > 0.01
    ).length : 0;
    
    const totalCuotasCalculadas = cronograma ? cronograma.length : (prestamo.cuotas || 30);
    const porcentajeMora = (totalCuotasCalculadas > 0) ? (cuotasAtrasadas / totalCuotasCalculadas) * 100 : 0;
    const esCandidatoRefinanciacionAdmin = (porcentajeMora >= refinanciacionMinMora) && (userRole === 'admin');

    console.log('[DEBUG-REFINANCE]', {
        prestamoId: params.id,
        userRole,
        cuotasAtrasadas,
        totalCuotasCalculadas,
        porcentajeMora,
        refinanciacionMinMora,
        esCandidatoRefinanciacionAdmin,
        esUltimoPrestamo
    });

    const esRefinanciado = prestamo.estado === 'refinanciado'
    const tieneSolicitudPendiente = !!solicitudRenovacion
    const puedeRenovar = userRole && (
        (userRole === 'admin') || 
        (userRole === 'asesor' && !esRefinanciado)
    )
    
    // Reglas de visualizacion unificada
    const mostrarBotonRenovacion = esUltimoPrestamo && !tieneSolicitudPendiente && (
        prestamo.estado === 'activo' || 
        prestamo.estado === 'finalizado' ||
        prestamo.estado === 'refinanciado'
    ) && (puedeRenovar || esCandidatoRefinanciacionAdmin)

    let isBlockedByCuadre = false;
    let blockReasonCierre = '';

    if (userRole === 'asesor' && user) {
        const blockStatus = await checkAdvisorBlocked(supabaseAdmin, user.id);
        isBlockedByCuadre = blockStatus.isBlocked;
        blockReasonCierre = blockStatus.reason;
    }

    // Obtener Pagos del Préstamo para el Historial
    const { data: cuotasIds } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('id')
        .eq('prestamo_id', params.id);
    
    const idsCuotas = cuotasIds?.map(c => c.id) || [];
    
    let pagos: any[] = [];
    if (idsCuotas.length > 0) {
        const { data, error } = await supabaseAdmin
            .from('pagos')
            .select('*')
            .in('cuota_id', idsCuotas)
            .order('created_at', { ascending: false });
            
        if (!error && data && data.length > 0) {
             const { data: fullData, error: fullError } = await supabaseAdmin
                .from('pagos')
                .select(`
                    *,
                    perfiles (nombre_completo),
                    cronograma_cuotas (
                        numero_cuota
                    )
                `)
            .in('cuota_id', idsCuotas)
            .order('created_at', { ascending: false });
            
            if (!fullError) {
                pagos = fullData || [];
            } else {
                 pagos = data; 
            }
        }
    }

    return (
        <div className="space-y-6 md:space-y-8 animate-in slide-in-from-bottom-4 duration-500 max-w-full overflow-x-hidden">
            {/* Alerta de Producto Refinanciado */}
            {esProductoDeRefinanciamiento && (
                <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3 md:p-4 flex items-center gap-3 md:gap-4 shadow-lg mx-0.5">
                    <div className="bg-amber-500/20 p-2 rounded-full shrink-0">
                        <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                    </div>
                    <div>
                        <h4 className="text-amber-400 font-bold text-sm md:text-base tracking-tight leading-tight">Préstamo Refinanciado</h4>
                        <p className="text-amber-200/70 text-[10px] md:text-sm mt-0.5 leading-snug">Este préstamo es el resultado de una refinanciación directa debido a mora o atrasos.</p>
                    </div>
                </div>
            )}

            {/* Premium Credit Card Header - Robust Mobile Layout */}
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-slate-800 shadow-xl flex flex-col mx-0.5">
                {/* Abstract Background Shapes */}
                <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-50 z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl opacity-50 z-0 pointer-events-none" />

                <div className="relative z-10 p-4 md:p-6 text-white">
                    {/* Responsive Header: Mobile (2 Rows) | PC (Single Row) */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 md:gap-4 mb-6 md:mb-8">
                        {/* Row 1: Title Area */}
                        <div className="flex items-center gap-2.5 w-full lg:w-auto">
                            <BackButton />
                            <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 bg-white/10 rounded-lg md:rounded-xl backdrop-blur-md border border-white/10 shrink-0">
                                <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-blue-300" />
                            </div>
                            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white/95 leading-none">Préstamo Individual</h1>
                        </div>

                        {/* Row 2: Client Profile (Mobile Specific Line) */}
                        <div className="lg:hidden w-full flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                            <ClientMiniCard 
                                clienteId={prestamo.cliente_id}
                                nombres={prestamo.clientes?.nombres}
                                fotoPerfil={prestamo.clientes?.foto_perfil}
                                className="h-10 shrink-0 shadow-sm bg-white/10 border-white/20 min-w-[140px]"
                            />
                            <div className="flex items-center gap-2 md:gap-3 bg-white/5 h-10 px-3 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer group shrink-0 min-w-[140px]">
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

                        {/* Row 3: Actions Area */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 lg:gap-4 w-full lg:w-auto">
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="flex-1 sm:flex-none min-w-0">
                                    <ContratoGenerator prestamo={prestamo} cronograma={cronograma || []} defaultOpen={isContractTab} />
                                </div>

                                {mostrarBotonRenovacion && (
                                <div className="flex-1 sm:flex-none min-w-0">
                                    <SolicitudRenovacionModal 
                                            {...{ 
                                                prestamoId: prestamo.id, 
                                                clienteNombre: prestamo.clientes?.nombres || 'Cliente', 
                                                currentMonto: prestamo.monto,
                                                currentInteres: prestamo.interes,
                                                currentModalidad: prestamo.frecuencia?.toLowerCase() || 'diario',
                                                currentCuotas: prestamo.cuotas || 30,
                                                solicitudPendiente: solicitudRenovacion,
                                                userRole,
                                                esRefinanciado,
                                                isAdminDirectRefinance: esCandidatoRefinanciacionAdmin,
                                                esProductoDeRefinanciamiento,
                                                systemSchedule,
                                                isBlockedByCuadre,
                                                blockReasonCierre
                                            }}
                                            trigger={
                                                <Button 
                                                    disabled={(!canRenovateDueToTime && (userRole as any) !== 'admin') || isBlockedByCuadre}
                                                    className={cn(
                                                        "h-9 text-[11px] md:text-xs bg-gradient-to-r text-white rounded-xl flex items-center justify-center gap-2 px-3 shadow-md w-full",
                                                        (canRenovateDueToTime && !isBlockedByCuadre)
                                                            ? "from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400" 
                                                            : "from-slate-700 to-slate-800 opacity-60 cursor-not-allowed"
                                                    )}
                                                >
                                                    {canRenovateDueToTime && !isBlockedByCuadre ? <Calendar className="w-3.5 h-3.5 shrink-0" /> : <Lock className="w-3.5 h-3.5 shrink-0" />}
                                                    <span className="font-bold">
                                                        {isBlockedByCuadre 
                                                            ? 'Bloqueado'
                                                            : canRenovateDueToTime 
                                                                ? (esCandidatoRefinanciacionAdmin ? 'Refinanciar' : 'Renovar')
                                                                : 'Cerrado'
                                                        }
                                                    </span>
                                                </Button>
                                            }
                                    />
                                </div>
                                )}
                            </div>
                            
                            {/* Desktop Profile (Hidden on Mobile) */}
                            <div className="hidden lg:flex items-center gap-4">
                                <div className="w-px h-8 bg-white/10 mx-1" />
                                <ClientMiniCard 
                                    clienteId={prestamo.cliente_id}
                                    nombres={prestamo.clientes?.nombres}
                                    fotoPerfil={prestamo.clientes?.foto_perfil}
                                    className="h-11 shadow-sm bg-white/10 border-white/20"
                                />
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

                    {/* Data Grid: 3 columns (Mobile/Tablet) -> 6 columns (PC) */}
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-y-4 gap-x-3 md:gap-6 pt-4 md:pt-6 border-t border-white/10 relative z-10">
                        {/* Column 1: Monto */}
                        <div className="space-y-0.5">
                            <p className="text-blue-200/30 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black">Monto</p>
                            <p className="text-sm md:text-2xl font-black text-white leading-none">${prestamo.monto?.toLocaleString()}</p>
                        </div>

                        {/* Column 2: Interés */}
                        <div className="space-y-0.5 text-center sm:text-left">
                            <p className="text-blue-200/30 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black">Interés</p>
                            <p className="text-sm md:text-2xl font-black text-white leading-none">{prestamo.interes}%</p>
                        </div>

                        {/* Column 3: Cuotas */}
                        <div className="space-y-0.5 text-right sm:text-left">
                            <p className="text-blue-200/30 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black">Cuotas</p>
                            <p className="text-base md:text-2xl font-black text-white leading-none">{prestamo.cuotas}</p>
                        </div>

                        {/* Column 4: Estado */}
                        <div className="space-y-0.5">
                            <p className="text-blue-200/30 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black">Estado</p>
                            <div className="flex items-center gap-1.5 min-h-[1.5rem]">
                                {(() => {
                                    const isEffectivelyFinalized = prestamo.estado === 'finalizado' || prestamo.estado === 'renovado' || prestamo.estado === 'refinanciado' || prestamo.saldo_pendiente <= 0;
                                    
                                    const statusConfig = {
                                        refinanciado: { label: 'Refin', color: 'text-indigo-400', dot: 'bg-indigo-500' },
                                        renovado: { label: 'Renov', color: 'text-slate-500', dot: 'bg-slate-600' },
                                        finalizado: { label: 'Final', color: 'text-slate-500', dot: 'bg-slate-600' },
                                        vencido: { label: 'Venc', color: 'text-rose-500', dot: 'bg-rose-500' },
                                        moroso: { label: 'Mora', color: 'text-red-500', dot: 'bg-red-600' },
                                        mora: { label: 'Mora', color: 'text-red-500', dot: 'bg-red-600' },
                                        cpp: { label: 'CPP', color: 'text-orange-500', dot: 'bg-orange-500' },
                                        deuda: { label: 'Deuda', color: 'text-amber-400', dot: 'bg-amber-400' },
                                        ok: { label: 'OK', color: 'text-emerald-500', dot: 'bg-emerald-500' }
                                    };

                                    const getStatusKey = () => {
                                        if (prestamo.estado === 'refinanciado') return 'refinanciado';
                                        if (prestamo.estado === 'renovado') return 'renovado';
                                        if (isEffectivelyFinalized) return 'finalizado';
                                        if (prestamo.estado_mora === 'vencido') return 'vencido';
                                        if (prestamo.estado_mora === 'moroso' || prestamo.estado_mora === 'mora') return 'moroso';
                                        if (prestamo.estado_mora === 'cpp') return 'cpp';
                                        if (prestamo.deuda_exigible_hoy > 0) return 'deuda';
                                        return 'ok';
                                    };

                                    const config = statusConfig[getStatusKey()] || statusConfig.ok;

                                    return (
                                        <>
                                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 animate-pulse", config.dot)} />
                                            <span className={cn("text-[10px] md:text-sm font-black uppercase tracking-wider", config.color)}>
                                                {config.label}
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Column 5: Inicio */}
                        <div className="space-y-0.5 text-center sm:text-left">
                            <p className="text-blue-200/30 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black">Inicio</p>
                            <p className="text-xs md:text-base font-bold text-white/70 leading-none py-1">
                                {prestamo.fecha_inicio ? prestamo.fecha_inicio.split('-').reverse().join('/') : '-'}
                            </p>
                        </div>

                        {/* Column 6: Vencimiento */}
                        <div className="space-y-0.5 text-right sm:text-left">
                            <p className="text-blue-200/30 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black">Vencimiento</p>
                             <div className="flex items-center gap-1.5 justify-end sm:justify-start py-1">
                                <Calendar className="w-3 h-3 text-orange-400/40" />
                                <p className="text-xs md:text-base font-bold text-white/70 leading-none">
                                    {prestamo.fecha_fin ? prestamo.fecha_fin.split('-').reverse().join('/') : 'Indefinido'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>


            </div>

            {/* Loan Tabs: Schedule and History */}
            <LoanTabs 
                prestamo={prestamo} 
                cronograma={cronograma || []} 
                pagos={pagos || []}
                userRole={userRole as 'admin' | 'supervisor' | 'asesor'} 
                cliente={prestamo.clientes}
                tareaEvidencia={tareaEvidencia}
                systemSchedule={systemSchedule}
                isBlockedByCuadre={isBlockedByCuadre}
                blockReasonCierre={blockReasonCierre}
            />
        </div>
    )
}
