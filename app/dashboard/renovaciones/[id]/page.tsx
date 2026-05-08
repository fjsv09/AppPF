import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientMiniCard } from '@/components/prestamos/client-mini-card'
import { RenovacionTicket } from '@/components/renovaciones/renovacion-ticket'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney, formatDate } from '@/utils/format'
import { ScoreIndicator, BehaviorSummary, ScoreBreakdown, ScoreLimitRules, ReputationBreakdown } from '@/components/ui/score-indicator'
import { 
    User, DollarSign, Calendar, AlertTriangle, 
    CheckCircle2, XCircle, Clock, MessageSquare,
    Activity, Files, ArrowUpRight
} from 'lucide-react'
import { calculateRenovationAdjustment } from '@/lib/financial-logic'
import { BackButton } from '@/components/ui/back-button'
import { RenovacionesActions } from '@/components/renovaciones/renovaciones-actions'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { ContratoGenerator } from '@/components/prestamos/contrato-generator'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
    return {
        title: `Renovación #${params.id.slice(0, 8)}`
    }
}

const estadoConfig: Record<string, { label: string; color: string; bg: string }> = {
    'pendiente_supervision': { 
        label: 'Pendiente Supervisión', 
        color: 'text-amber-400',
        bg: 'bg-amber-500/20 border-amber-500/30'
    },
    'en_correccion': { 
        label: 'En Corrección', 
        color: 'text-orange-400',
        bg: 'bg-orange-500/20 border-orange-500/30'
    },
    'pre_aprobado': { 
        label: 'Pre-Aprobado', 
        color: 'text-blue-400',
        bg: 'bg-blue-500/20 border-blue-500/30'
    },
    'aprobado': { 
        label: 'Aprobado', 
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20 border-emerald-500/30'
    },
    'rechazado': { 
        label: 'Rechazado', 
        color: 'text-red-400',
        bg: 'bg-red-500/20 border-red-500/30'
    }
}

export default async function RenovacionDetailPage({ params }: { params: { id: string } }) {
    const { id } = params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Obtener perfil
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol')
        .eq('id', user.id)
        .single()

    if (!perfil) redirect('/login')

    // Obtener solicitud
    const { data: solicitud, error } = await supabaseAdmin
        .from('solicitudes_renovacion')
        .select(`
            *,
            cliente:cliente_id(id, nombres, dni, telefono, direccion, foto_perfil),
            prestamo:prestamo_id(
                id, monto, interes, fecha_inicio, fecha_fin,
                estado, estado_mora, frecuencia, cuotas
            ),
            asesor:asesor_id(id, nombre_completo),
            supervisor:supervisor_id(id, nombre_completo),
            admin:admin_id(id, nombre_completo),
            aprobador_excepcion:excepcion_aprobada_por(id, nombre_completo)
        `)
        .eq('id', id)
        .single()

    if (error || !solicitud) {
        notFound()
    }

    // [NUEVO] OBTENER EVALUACIÓN INTEGRAL PARA EL PANEL DE REVISIÓN (Centralizado)
    const {
        getClientReputationAction,
        getLoanHealthScoreAction,
        getFinancialConfig,
        getSaldoPendienteRenovacion
    } = await import('@/lib/financial-logic')

    // [SNAPSHOT TOTAL] Priorizar datos inmutables guardados para evitar cálculos redundantes
    const resumenData = (solicitud as any).resumen_comportamiento || {}
    const hasFullSnapshot = resumenData.health_evaluation && resumenData.reputation_evaluation

    let evaluation: any = null
    let atomicHealth: any = null

    if (hasFullSnapshot) {
        // Carga instantánea desde el snapshot (Total Fidelity)
        evaluation = {
            ...resumenData.reputation_evaluation,
            reputationScore: solicitud.reputation_score_al_solicitar ?? resumenData.reputation_score ?? resumenData.reputation_evaluation?.score ?? 0
        }
        
        // Normalizar health data si viene de snapshot antiguo (LoanScore) vs nuevo (LoanMetrics)
        const rawHealth = resumenData.health_evaluation || {}
        atomicHealth = rawHealth.loanScore ? rawHealth : { loanScore: rawHealth }
        
        // Forzar score capturado si existe
        if (solicitud.score_al_solicitar) {
            atomicHealth.loanScore.score = Number(solicitud.score_al_solicitar)
        }
    } else {
        // Fallback para registros antiguos: calculamos en tiempo real
        const evaluationDate = new Date(solicitud.created_at).toISOString().split('T')[0]
        const liveEvaluation = await getClientReputationAction(supabaseAdmin, solicitud.cliente_id, evaluationDate)
        const liveAtomicHealth = await getLoanHealthScoreAction(supabaseAdmin, solicitud.prestamo_id, evaluationDate)

        evaluation = liveEvaluation
        atomicHealth = liveAtomicHealth

        // Aún así respetamos el score de salud capturado si existe
        if (solicitud.score_al_solicitar) {
            atomicHealth.loanScore.score = Number(solicitud.score_al_solicitar)
        }
    }

    // [NUEVO] Obtener configuración centralizada
    const systemConfig = await getFinancialConfig(supabaseAdmin)

    // [NUEVO] Pre-calcular ajustes para evitar require e IIFE en JSX
    const limitsAdjustment = calculateRenovationAdjustment(
        atomicHealth.loanScore.score,
        evaluation.reputationScore,
        Number(solicitud.prestamo?.monto || 0),
        Number(solicitud.monto_cuota_pendiente || 0),
        systemConfig
    )

    // Datos adicionales si está aprobada
    let datosRenovacion = null
    let prestamoNuevoAsociado = null
    let cronogramaAsociado: any[] = []
    let saldoPendienteOriginal = 0

    // Obtener saldo pendiente original del préstamo actual
    // Usa todas las cuotas pendientes (vencidas + futuras) para ser consistente con el route de aprobación.
    // Obtener cuotas pendientes para el resumen (Preferir snapshot congelado)
    let numCuotasPendientes = resumenData.cuotas_pendientes ?? null

    if (solicitud.prestamo_id && numCuotasPendientes === null) {
        const { data: cuotasPendientesData } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('monto_cuota, monto_pagado')
            .eq('prestamo_id', solicitud.prestamo_id)
            .neq('estado', 'pagado')
        
        numCuotasPendientes = cuotasPendientesData?.length || 0

        if (solicitud.estado_solicitud !== 'aprobado') {
            saldoPendienteOriginal = (cuotasPendientesData || []).reduce((acc: number, c: any) => {
                return acc + (Number(c.monto_cuota) - Number(c.monto_pagado || 0))
            }, 0)
        }
    } else if (solicitud.prestamo_id && numCuotasPendientes !== null && solicitud.estado_solicitud !== 'aprobado') {
        // Si tenemos el snapshot pero aún necesitamos el saldoPendienteOriginal para cálculos
        const { data: cuotasPendientesData } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('monto_cuota, monto_pagado')
            .eq('prestamo_id', solicitud.prestamo_id)
            .neq('estado', 'pagado')
        
        saldoPendienteOriginal = (cuotasPendientesData || []).reduce((acc: number, c: any) => {
            return acc + (Number(c.monto_cuota) - Number(c.monto_pagado || 0))
        }, 0)
    }

    if (solicitud.estado_solicitud === 'aprobado' && !saldoPendienteOriginal) {
        const { data: renOriginal } = await supabaseAdmin
            .from('renovaciones')
            .select('saldo_pendiente_original')
            .eq('prestamo_original_id', solicitud.prestamo_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        saldoPendienteOriginal = renOriginal?.saldo_pendiente_original || 0
    }

    if (solicitud.estado_solicitud === 'aprobado' && solicitud.prestamo_nuevo_id) {
        const { data: ren } = await supabaseAdmin
            .from('renovaciones')
            .select('saldo_pendiente_original')
            .eq('prestamo_nuevo_id', solicitud.prestamo_nuevo_id)
            .single()
        datosRenovacion = ren
        if (ren?.saldo_pendiente_original) {
            saldoPendienteOriginal = ren.saldo_pendiente_original
        }

        const { data: prestamo } = await supabaseAdmin
            .from('prestamos')
            .select(`
                *,
                clientes:cliente_id(id, nombres, dni, telefono, direccion)
            `)
            .eq('id', solicitud.prestamo_nuevo_id)
            .maybeSingle()
        
        prestamoNuevoAsociado = prestamo

        if (prestamo) {
            const { data: cronograma } = await supabaseAdmin
                .from('cronograma_cuotas')
                .select('*')
                .eq('prestamo_id', prestamo.id)
                .order('numero_cuota', { ascending: true })
            
            cronogramaAsociado = cronograma || []
        }
    }

    const estado = estadoConfig[solicitud.estado_solicitud] || estadoConfig['pendiente_supervision']

    let cuentasAdmin: any[] = []
    if (perfil?.rol === 'admin' && ['pre_aprobado', 'pendiente_supervision'].includes(solicitud.estado_solicitud)) {
        // Solo cuentas en carteras del admin actual
        const { data: adminCarteras } = await supabaseAdmin
            .from('carteras')
            .select('id')
            .eq('asesor_id', user.id)
        const adminCarteraIds = adminCarteras?.map((c: any) => c.id) || []
        if (adminCarteraIds.length > 0) {
            const { data: cuentas } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('id, nombre, saldo, tipo, cartera_id')
                .in('cartera_id', adminCarteraIds)
                .order('nombre')
            cuentasAdmin = cuentas || []
        }
    }

    // Obtener logo del sistema para el ticket
    const { data: logoConfig } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('valor')
        .eq('clave', 'logo_sistema_url')
        .maybeSingle()
    const logoUrl = logoConfig?.valor || ''

    // [NUEVO] Calcular Fechas Proyectadas
    const { data: feriadosData } = await supabaseAdmin
        .from('feriados')
        .select('fecha')
    const feriadosSet = new Set(feriadosData?.map(f => {
        if (typeof f.fecha === 'string') return f.fecha.split('T')[0]
        if (f.fecha instanceof Date) return f.fecha.toISOString().split('T')[0]
        return String(f.fecha)
    }) || [])

    const { 
        calcularFechasProyectadas,
    } = await import('@/lib/financial-logic')

    const fechasProyectadas = calcularFechasProyectadas(
        solicitud.fecha_inicio_propuesta,
        solicitud.cuotas,
        solicitud.modalidad as any,
        feriadosSet
    )

    // [NUEVO] Calcular Valor Cuota con Redondeo (Consistencia)
    const montoSol = Number(solicitud.monto_solicitado || 0)
    const interesSol = Number(solicitud.interes || 0)
    const cuotasSol = Number(solicitud.cuotas || 0)
    const totalBruto = montoSol * (1 + interesSol / 100)
    const valorCuota = cuotasSol > 0 ? Math.ceil(totalBruto / cuotasSol) : 0
    const totalActualizado = valorCuota * cuotasSol

    return (
        <div className="page-container max-w-4xl mx-auto">
                {/* Header */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <BackButton />
                        <div className="flex-1 min-w-0">
                            <h1 className="page-title text-base md:text-xl">
                                Solicitud de Renovación
                            </h1>
                            <p className="page-subtitle text-xs mt-0.5">
                                #{id.split('-')[0]} • {formatDate(solicitud.created_at)}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <Badge className={`${estado.bg} ${estado.color} text-xs`}>
                                {estado.label}
                            </Badge>
                            {solicitud.asesor && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                                    <User className="w-3 h-3 text-blue-400" />
                                    <span className="text-[10px] md:text-xs font-bold text-blue-300">
                                        Asesor: {solicitud.asesor.nombre_completo?.split(' ')[0] || 'Asesor'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        <ClientMiniCard
                            clienteId={solicitud.cliente?.id}
                            nombres={solicitud.cliente?.nombres}
                            fotoPerfil={solicitud.cliente?.foto_perfil}
                            className="bg-slate-800/50 border-slate-700 text-xs md:flex-none"
                        />
                        {prestamoNuevoAsociado && (perfil.rol === 'admin' || perfil.rol === 'supervisor') && (
                            <ContratoGenerator
                                prestamo={prestamoNuevoAsociado}
                                cronograma={cronogramaAsociado}
                                trigger={
                                    <button className="flex items-center gap-1.5 px-2.5 md:px-4 py-1.5 md:py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs md:text-sm font-bold shadow-lg shadow-blue-900/20 transition-all whitespace-nowrap flex-shrink-0">
                                        <Files className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                        <span className="md:hidden">Docs</span>
                                        <span className="hidden md:inline">Ver Documentos</span>
                                    </button>
                                }
                            />
                        )}
                    </div>
                </div>

                {/* Dashboard de Evaluación Dual (NUEVO) */}
                <div className="grid md:grid-cols-3 gap-4 md:gap-6">
                    <Card className="md:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-slate-700/50 relative overflow-hidden group shadow-2xl">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[60px] pointer-events-none" />
                        <CardHeader className="pb-1 md:pb-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
                            <CardTitle className="text-base md:text-lg text-white flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" />
                                Evaluación Integral
                            </CardTitle>
                            {solicitud.score_al_solicitar !== undefined && (
                                <Badge variant="outline" className="text-[9px] md:text-[10px] text-slate-500 border-slate-800 shrink-0">
                                    Score inicial: {solicitud.score_al_solicitar}
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent className="pt-2">
                            <div className="grid sm:grid-cols-2 gap-3 md:gap-6 items-start md:items-center">
                                {/* Salud del Préstamo */}
                                <div className="bg-white/[0.03] rounded-2xl md:rounded-3xl p-3 md:p-6 border border-white/5 flex flex-col items-center gap-2 md:gap-4 relative">
                                    <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Salud Préstamo</span>
                                    <ScoreIndicator score={atomicHealth.loanScore.score} size="md" />
                                    <div className="mt-1 md:mt-2 w-full">
                                        <Accordion type="single" collapsible>
                                            <AccordionItem value="health" className="border-none">
                                                <AccordionTrigger className="hover:no-underline py-0 h-5 md:h-6 flex justify-center text-[8px] md:text-[10px] font-black uppercase text-blue-400/70 tracking-widest">
                                                    Ver Auditoría
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-2 md:pt-4">
                                                    <ScoreBreakdown loanScore={atomicHealth.loanScore} />
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </div>
                                </div>

                                {/* Reputación del Cliente */}
                                <div className="bg-white/[0.03] rounded-2xl md:rounded-3xl p-3 md:p-6 border border-white/5 flex flex-col items-center gap-2 md:gap-4 relative">
                                    <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Reputación Cliente</span>
                                    <ScoreIndicator score={evaluation.reputationScore} size="md" />
                                    <div className="mt-1 md:mt-2 w-full">
                                        <Accordion type="single" collapsible>
                                            <AccordionItem value="reputation" className="border-none">
                                                <AccordionTrigger className="hover:no-underline py-0 h-5 md:h-6 flex justify-center text-[8px] md:text-[10px] font-black uppercase text-purple-400/70 tracking-widest">
                                                    Ver Auditoría
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-2 md:pt-4">
                                                    <ReputationBreakdown reputationData={evaluation.reputationData} />
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-3 md:space-y-4">
                        <Card className="bg-slate-900/50 border-slate-800 h-full">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-widest">Resumen del Préstamo</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                <BehaviorSummary
                                    loanView
                                    data={{
                                        pagos_puntuales: atomicHealth.loanScore?.pagos_puntuales || 0,
                                        pagos_tardios: atomicHealth.loanScore?.pagos_tardios || 0,
                                        cuotas_vencidas_actual: atomicHealth.cuotasAtrasadas || 0,
                                        prestamos_finalizados: 0,
                                        prestamos_renovados: 0,
                                        meses_cliente: 0,
                                        historial_mora: 0,
                                        historial_cpp: 0,
                                        refinanciamientos: 0,
                                        cuotas_pendientes: numCuotasPendientes
                                    } as any}
                                />
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="mt-4 md:mt-6 mb-4 md:mb-8">
                    <ScoreLimitRules
                        healthScore={atomicHealth.loanScore.score}
                        reputationScore={evaluation.reputationScore}
                        config={systemConfig}
                    />
                </div>

                {/* Excepción Alert */}
                {solicitud.requiere_excepcion && (
                    <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg md:rounded-xl p-3 md:p-4 flex items-start gap-3">
                        <AlertTriangle className="h-5 md:h-6 w-5 md:w-6 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <h3 className="text-amber-400 font-semibold text-sm">Requiere Excepción</h3>
                            <p className="text-slate-400 text-xs md:text-sm mt-1">
                                {solicitud.tipo_excepcion === 'mora' && 'El préstamo está en estado de mora.'}
                                {solicitud.tipo_excepcion === 'vencido' && 'El préstamo está vencido.'}
                                {solicitud.tipo_excepcion === 'score_bajo' && 'El score crediticio es bajo.'}
                            </p>
                            {solicitud.excepcion_aprobada_por && (
                                <p className="text-emerald-400 text-xs md:text-sm mt-1">
                                    ✅ Excepción aprobada por: {solicitud.aprobador_excepcion?.nombre_completo}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Observación / Rechazo */}
                {solicitud.observacion_supervisor && solicitud.estado_solicitud === 'en_correccion' && (
                    <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg md:rounded-xl p-3 md:p-4">
                        <h3 className="text-orange-400 font-semibold text-sm flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Observaciones del Supervisor
                        </h3>
                        <p className="text-slate-300 text-xs md:text-sm mt-2">{solicitud.observacion_supervisor}</p>
                    </div>
                )}

                {solicitud.motivo_rechazo && (
                    <div className="bg-red-900/20 border border-red-700/50 rounded-lg md:rounded-xl p-3 md:p-4">
                        <h3 className="text-red-400 font-semibold text-sm flex items-center gap-2">
                            <XCircle className="h-4 w-4" />
                            Motivo de Rechazo
                        </h3>
                        <p className="text-slate-300 text-xs md:text-sm mt-2">{solicitud.motivo_rechazo}</p>
                    </div>
                )}

                {/* Detalles */}
                <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                    {/* Préstamo Original */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-base md:text-lg text-slate-300 font-bold">Préstamo Actual</CardTitle>
                            {solicitud.prestamo_id && (
                                <Link 
                                    href={`/dashboard/prestamos/${solicitud.prestamo_id}`}
                                    className="text-[10px] md:text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-lg transition-colors border border-blue-500/20"
                                >
                                    Ver Préstamo
                                    <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-2 md:space-y-4 text-sm md:text-base">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Monto</span>
                                <span className="text-white font-bold text-sm md:text-base">S/ {formatMoney(solicitud.prestamo?.monto)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Interés</span>
                                <span className="text-white text-sm md:text-base font-semibold">{solicitud.prestamo?.interes}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Cuotas</span>
                                <span className="text-white text-sm md:text-base font-semibold">{solicitud.prestamo?.cuotas}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Valor Cuota</span>
                                <span className="text-emerald-400 font-bold text-sm md:text-base">S/ {solicitud.prestamo?.monto && solicitud.prestamo?.interes && solicitud.prestamo?.cuotas ? formatMoney(Math.ceil((solicitud.prestamo.monto * (1 + solicitud.prestamo.interes / 100)) / solicitud.prestamo.cuotas)) : '---'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Frecuencia</span>
                                <span className="text-white text-sm md:text-base font-semibold capitalize">{solicitud.prestamo?.frecuencia}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Fecha Inicio</span>
                                <span className="text-white text-sm md:text-base font-semibold">{formatDate(solicitud.prestamo?.fecha_inicio)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Fecha Fin</span>
                                <span className="text-white text-sm md:text-base font-semibold">{formatDate(solicitud.prestamo?.fecha_fin)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 md:pt-2">
                                <span className="text-slate-400 text-xs md:text-sm">Estado Mora</span>
                                <Badge variant="outline" className={`text-xs md:text-sm ${
                                    solicitud.prestamo?.estado_mora === 'normal' ? 'text-emerald-400 border-emerald-500/30' :
                                    solicitud.prestamo?.estado_mora === 'cpp' ? 'text-amber-400 border-amber-500/30' :
                                    'text-red-400 border-red-500/30'
                                }`}>
                                    {solicitud.prestamo?.estado_mora}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Renovación Solicitada */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base md:text-lg text-blue-300 font-bold">Renovación Solicitada</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 md:space-y-4 text-sm md:text-base">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Nuevo Monto</span>
                                <span className="text-white font-bold text-sm md:text-base">S/ {formatMoney(solicitud.monto_solicitado)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Interés</span>
                                <span className="text-white text-sm md:text-base font-semibold">{solicitud.interes}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Cuotas</span>
                                <span className="text-white text-sm md:text-base font-semibold">{solicitud.cuotas}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Valor Cuota</span>
                                <span className="text-emerald-400 font-bold text-sm md:text-base">S/ {formatMoney(valorCuota)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Total a Pagar</span>
                                <span className="text-white font-bold text-sm md:text-base">S/ {formatMoney(totalActualizado)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Modalidad</span>
                                <span className="text-white text-sm md:text-base font-semibold capitalize">{solicitud.modalidad}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Fecha Inicio</span>
                                <span className="text-white text-sm md:text-base font-semibold">{formatDate(solicitud.fecha_inicio_propuesta)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-xs md:text-sm">Fecha Fin (Proyectada)</span>
                                <span className="text-blue-300 font-bold text-sm md:text-base">{fechasProyectadas.fechaFin ? formatDate(fechasProyectadas.fechaFin.toISOString().split('T')[0]) : '---'}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Desglose de Entrega Neta al Cliente */}
                <Card className="bg-emerald-900/20 border-emerald-700/50 shadow-lg relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                    <CardHeader className="pb-0 md:pb-2 pt-3 md:pt-4">
                        <CardTitle className="text-sm md:text-lg text-emerald-300 font-bold">Entrega Neta al Cliente</CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10 pt-1 md:pt-2 pb-3 md:pb-6">
                        <div className="space-y-1 md:space-y-3">
                            <div className="flex justify-between items-center px-2 py-1.5 md:p-3 bg-emerald-950/30 rounded border border-emerald-700/30 text-[11px] md:text-sm">
                                <span className="text-emerald-200 font-semibold">Capital Solicitado</span>
                                <span className="text-white font-bold">S/ {formatMoney(solicitud.monto_solicitado)}</span>
                            </div>

                            <div className="flex items-center justify-center py-0.5">
                                <span className="text-slate-400 text-xs md:text-sm font-semibold">−</span>
                            </div>

                            <div className={`flex justify-between items-center px-2 py-1.5 md:p-3 rounded border text-[11px] md:text-sm ${saldoPendienteOriginal > 0 ? 'bg-amber-950/30 border-amber-700/30' : 'bg-slate-950/30 border-slate-700/30'}`}>
                                <div className="flex flex-col gap-0.5">
                                    <span className={`font-semibold ${saldoPendienteOriginal > 0 ? 'text-amber-200' : 'text-slate-400'}`}>Saldo Pendiente</span>
                                    <span className={`text-[9px] md:text-[11px] ${saldoPendienteOriginal > 0 ? 'text-amber-400/70' : 'text-emerald-500/70'}`}>
                                        {saldoPendienteOriginal > 0
                                            ? 'Se descontará del efectivo a entregar'
                                            : 'Préstamo anterior completamente saldado'}
                                    </span>
                                </div>
                                <span className={`font-bold ${saldoPendienteOriginal > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                                    S/ {formatMoney(Math.max(0, saldoPendienteOriginal))}
                                </span>
                            </div>

                            <div className="h-px bg-gradient-to-r from-emerald-500/20 via-emerald-500/5 to-transparent my-0.5 md:my-1.5" />

                            <div className="flex justify-between items-center px-2 py-1.5 md:p-3 bg-emerald-950/50 rounded border border-emerald-600/50">
                                <span className="text-emerald-100 text-xs md:text-base font-black">= Efectivo</span>
                                <span className="text-emerald-300 font-black text-lg md:text-2xl">
                                    S/ {formatMoney(Math.max(0, Number(solicitud.monto_solicitado) - Math.max(0, saldoPendienteOriginal)))}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Límites Dinámicos (Dual-Score Truth) */}
                <Card className="bg-blue-900/20 border-blue-700/50 shadow-lg relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                    <CardContent className="py-2 md:py-4 relative z-10">
                        <div className="flex flex-row flex-wrap justify-center gap-2 md:gap-8 text-center">
                            <div className="flex flex-col items-center gap-0.5 md:gap-1">
                                <p className="text-blue-400/60 text-[8px] md:text-[10px] font-black uppercase tracking-[0.15em]">Monto Mínimo</p>
                                <div className="flex items-baseline gap-0.5 md:gap-1">
                                    <span className="text-white text-base md:text-2xl font-black font-mono tracking-tighter">S/ {limitsAdjustment.montoMinimo}</span>
                                </div>
                                {limitsAdjustment.montoMinimo > Number(solicitud.prestamo?.monto || 0) * 0.5 && (
                                    <span className="text-[7px] md:text-[9px] text-amber-500/60 italic font-medium">Cap: Saldo</span>
                                )}
                            </div>

                            <div className="w-px h-6 md:h-10 bg-blue-500/10 self-center" />

                            <div className="flex flex-col items-center gap-0.5 md:gap-1">
                                <p className="text-blue-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.15em]">Monto Máximo</p>
                                <div className="flex items-baseline gap-1 md:gap-2">
                                    <span className="text-emerald-400 text-lg md:text-3xl font-black font-mono tracking-tighter shadow-emerald-500/10">S/ {limitsAdjustment.montoMaximo}</span>
                                    <span className={cn(
                                        "text-[7px] md:text-[9px] font-black uppercase tracking-widest px-1 py-0.5 rounded",
                                        limitsAdjustment.totalPotentialPct < 0 ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
                                    )}>
                                        {limitsAdjustment.totalPotentialPct > 0 ? `+${limitsAdjustment.totalPotentialPct}%` : `${limitsAdjustment.totalPotentialPct}%`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Información de Auditoría */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm md:text-base text-slate-400">Información de Auditoría</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 md:space-y-2 text-xs md:text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Asesor</span>
                            <span className="text-white text-right truncate">{solicitud.asesor?.nombre_completo}</span>
                        </div>
                        {solicitud.supervisor && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Supervisor</span>
                                <span className="text-white text-right truncate">{solicitud.supervisor?.nombre_completo}</span>
                            </div>
                        )}
                        {solicitud.admin && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Admin</span>
                                <span className="text-white text-right truncate">{solicitud.admin?.nombre_completo}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-slate-500">Creado</span>
                            <span className="text-white text-right text-xs">{new Date(solicitud.created_at).toLocaleString()}</span>
                        </div>
                        {solicitud.fecha_preaprobacion && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Pre-aprobado</span>
                                <span className="text-white text-right text-xs">{new Date(solicitud.fecha_preaprobacion).toLocaleString()}</span>
                            </div>
                        )}
                        {solicitud.fecha_aprobacion && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">{solicitud.estado_solicitud === 'rechazado' ? 'Rechazado' : 'Aprobado'}</span>
                                <span className="text-white text-right text-xs">{new Date(solicitud.fecha_aprobacion).toLocaleString()}</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <RenovacionesActions 
                    solicitud={solicitud}
                    userRole={perfil.rol}
                    userId={user.id}
                    cuentasAdmin={cuentasAdmin}
                />

                {/* Link al nuevo préstamo si fue aprobado */}
                {solicitud.prestamo_nuevo_id && (
                    <div className="grid gap-3 md:gap-6 md:grid-cols-2">
                        <Link
                            href={`/dashboard/prestamos/${solicitud.prestamo_nuevo_id}`}
                            className="flex flex-col items-center justify-center bg-emerald-900/20 border border-emerald-700/50 rounded-lg md:rounded-xl p-3 md:p-6 hover:bg-emerald-900/30 transition-colors h-full"
                        >
                            <CheckCircle2 className="h-9 md:h-12 w-9 md:w-12 text-emerald-500 mb-2 md:mb-3" />
                            <p className="text-emerald-400 font-bold text-sm md:text-lg mb-1.5 md:mb-2">Renovación Exitosa</p>
                            <p className="text-slate-300 text-center text-xs md:text-sm mb-3 md:mb-4">
                                El préstamo anterior ha sido liquidado y el nuevo crédito está activo.
                            </p>
                            <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs">
                                Ir al Nuevo Préstamo
                            </Button>
                        </Link>

                        <RenovacionTicket
                            solicitud={solicitud}
                            saldoAnterior={datosRenovacion?.saldo_pendiente_original || 0}
                            nuevoPrestamoId={solicitud.prestamo_nuevo_id}
                            clienteNombre={solicitud.cliente?.nombres}
                            logoUrl={logoUrl}
                        />
                    </div>
                )}
        </div>
    )
}
