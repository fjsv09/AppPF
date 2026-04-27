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
    Activity
} from 'lucide-react'
import { calculateRenovationAdjustment } from '@/lib/financial-logic'
import { BackButton } from '@/components/ui/back-button'
import { RenovacionesActions } from '@/components/renovaciones/renovaciones-actions'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

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
        getFinancialConfig
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
    if (solicitud.estado_solicitud === 'aprobado' && solicitud.prestamo_nuevo_id) {
        const { data: ren } = await supabaseAdmin
            .from('renovaciones')
            .select('saldo_pendiente_original')
            .eq('prestamo_nuevo_id', solicitud.prestamo_nuevo_id)
            .single()
        datosRenovacion = ren
    }

    const estado = estadoConfig[solicitud.estado_solicitud] || estadoConfig['pendiente_supervision']

    let cuentasAdmin: any[] = []
    if (perfil?.rol === 'admin' && ['pre_aprobado', 'pendiente_supervision'].includes(solicitud.estado_solicitud)) {
        // [NUEVO] Solo cuentas de la cartera del admin (Cartera Global)
        const { data: globalCartera } = await supabaseAdmin
            .from('carteras')
            .select('id')
            .ilike('nombre', '%Global%')
            .single()

        const { data: cuentas } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo, cartera_id, usuarios_autorizados')
            .eq('cartera_id', globalCartera?.id || '8d6abe49-cc8a-4428-a089-86e0aa4edee0')
            .order('nombre')
        
        cuentasAdmin = cuentas || []
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
    const feriadosSet = new Set(feriadosData?.map(f => f.fecha) || [])

    const { 
        calcularFechasProyectadas,
    } = await import('@/lib/financial-logic')

    const fechasProyectadas = calcularFechasProyectadas(
        solicitud.fecha_inicio_propuesta,
        solicitud.cuotas,
        solicitud.modalidad as any,
        feriadosSet
    )

    return (
        <div className="page-container max-w-4xl mx-auto">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <div className="flex items-center gap-3">
                            <BackButton />
                            <div>
                                <h1 className="page-title flex items-center gap-3">
                                    Solicitud de Renovación
                                    <Badge className={`${estado.bg} ${estado.color} text-sm`}>
                                        {estado.label}
                                    </Badge>
                                </h1>
                                <p className="page-subtitle">
                                    #{id.split('-')[0]} • {formatDate(solicitud.created_at)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                        <ClientMiniCard 
                            clienteId={solicitud.cliente?.id}
                            nombres={solicitud.cliente?.nombres}
                            fotoPerfil={solicitud.cliente?.foto_perfil}
                            className="bg-slate-800/50 border-slate-700"
                        />
                        {solicitud.prestamo_nuevo_id && (
                            <Link 
                                href={`/dashboard/prestamos/${solicitud.prestamo_nuevo_id}`}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all"
                            >
                                <DollarSign className="w-4 h-4" />
                                Ir al Préstamo
                            </Link>
                        )}
                    </div>
                </div>

                {/* Dashboard de Evaluación Dual (NUEVO) */}
                <div className="grid md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-slate-700/50 relative overflow-hidden group shadow-2xl">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[60px] pointer-events-none" />
                        <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-lg text-white flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" />
                                Evaluación Integral
                            </CardTitle>
                            {solicitud.score_al_solicitar !== undefined && (
                                <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-800">
                                    Score inicial: {solicitud.score_al_solicitar}
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="grid sm:grid-cols-2 gap-6 items-center">
                                {/* Salud del Préstamo */}
                                <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/5 flex flex-col items-center gap-4 relative">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Salud Préstamo</span>
                                    <ScoreIndicator score={atomicHealth.loanScore.score} size="lg" />
                                    <div className="mt-2 w-full">
                                        <Accordion type="single" collapsible>
                                            <AccordionItem value="health" className="border-none">
                                                <AccordionTrigger className="hover:no-underline py-0 h-6 flex justify-center text-[10px] font-black uppercase text-blue-400/70 tracking-widest">
                                                    Ver Auditoría
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-4">
                                                    <ScoreBreakdown loanScore={atomicHealth.loanScore} />
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </div>
                                </div>

                                {/* Reputación del Cliente */}
                                <div className="bg-white/[0.03] rounded-3xl p-6 border border-white/5 flex flex-col items-center gap-4 relative">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Reputación Cliente</span>
                                    <ScoreIndicator score={evaluation.reputationScore} size="lg" />
                                    <div className="mt-2 w-full">
                                        <Accordion type="single" collapsible>
                                            <AccordionItem value="reputation" className="border-none">
                                                <AccordionTrigger className="hover:no-underline py-0 h-6 flex justify-center text-[10px] font-black uppercase text-purple-400/70 tracking-widest">
                                                    Ver Auditoría
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-4">
                                                    <ReputationBreakdown reputationData={evaluation.reputationData} />
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <Card className="bg-slate-900/50 border-slate-800 h-full">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-widest">Resumen del Préstamo</CardTitle>
                            </CardHeader>
                            <CardContent>
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
                                        refinanciamientos: 0
                                    } as any} 
                                />
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="mt-6 mb-8">
                    <ScoreLimitRules 
                        healthScore={atomicHealth.loanScore.score} 
                        reputationScore={evaluation.reputationScore} 
                        config={systemConfig}
                    />
                </div>

                {/* Excepción Alert */}
                {solicitud.requiere_excepcion && (
                    <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
                        <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
                        <div>
                            <h3 className="text-amber-400 font-semibold">Requiere Excepción</h3>
                            <p className="text-slate-400 text-sm mt-1">
                                {solicitud.tipo_excepcion === 'mora' && 'El préstamo está en estado de mora.'}
                                {solicitud.tipo_excepcion === 'vencido' && 'El préstamo está vencido.'}
                                {solicitud.tipo_excepcion === 'score_bajo' && 'El score crediticio es bajo.'}
                            </p>
                            {solicitud.excepcion_aprobada_por && (
                                <p className="text-emerald-400 text-sm mt-2">
                                    ✅ Excepción aprobada por: {solicitud.aprobador_excepcion?.nombre_completo}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Observación / Rechazo */}
                {solicitud.observacion_supervisor && solicitud.estado_solicitud === 'en_correccion' && (
                    <div className="bg-orange-900/20 border border-orange-700/50 rounded-xl p-4">
                        <h3 className="text-orange-400 font-semibold flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Observaciones del Supervisor
                        </h3>
                        <p className="text-slate-300 mt-2">{solicitud.observacion_supervisor}</p>
                    </div>
                )}

                {solicitud.motivo_rechazo && (
                    <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
                        <h3 className="text-red-400 font-semibold flex items-center gap-2">
                            <XCircle className="h-4 w-4" />
                            Motivo de Rechazo
                        </h3>
                        <p className="text-slate-300 mt-2">{solicitud.motivo_rechazo}</p>
                    </div>
                )}

                {/* Detalles */}
                <div className="grid md:grid-cols-2 gap-4">
                    {/* Préstamo Original */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-slate-400">Préstamo Actual</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Monto</span>
                                <span className="text-white font-bold">S/ {formatMoney(solicitud.prestamo?.monto)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Interés</span>
                                <span className="text-white">{solicitud.prestamo?.interes}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Cuotas</span>
                                <span className="text-white">{solicitud.prestamo?.cuotas}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Frecuencia</span>
                                <span className="text-white capitalize">{solicitud.prestamo?.frecuencia}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Fecha Inicio</span>
                                <span className="text-white">{formatDate(solicitud.prestamo?.fecha_inicio)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Fecha Fin</span>
                                <span className="text-white">{formatDate(solicitud.prestamo?.fecha_fin)}</span>
                            </div>
                            <div className="flex justify-between pt-1">
                                <span className="text-slate-500">Estado Mora</span>
                                <Badge variant="outline" className={
                                    solicitud.prestamo?.estado_mora === 'normal' ? 'text-emerald-400 border-emerald-500/30' :
                                    solicitud.prestamo?.estado_mora === 'cpp' ? 'text-amber-400 border-amber-500/30' :
                                    'text-red-400 border-red-500/30'
                                }>
                                    {solicitud.prestamo?.estado_mora}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Renovación Solicitada */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-blue-400">Renovación Solicitada</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Nuevo Monto</span>
                                <span className="text-white font-bold">S/ {formatMoney(solicitud.monto_solicitado)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Interés</span>
                                <span className="text-white">{solicitud.interes}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Cuotas</span>
                                <span className="text-white">{solicitud.cuotas}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Modalidad</span>
                                <span className="text-white capitalize">{solicitud.modalidad}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Fecha Inicio</span>
                                <span className="text-white font-medium">{formatDate(solicitud.fecha_inicio_propuesta)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Fecha Fin (Proyectada)</span>
                                <span className="text-blue-400 font-bold">{fechasProyectadas.fechaFin ? formatDate(fechasProyectadas.fechaFin.toISOString().split('T')[0]) : '---'}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Límites Dinámicos (Dual-Score Truth) */}
                <Card className="bg-blue-900/20 border-blue-700/50 shadow-lg relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                    <CardContent className="py-5 relative z-10">
                        <div className="flex flex-wrap justify-center gap-12 text-center">
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-blue-400/60 text-[10px] font-black uppercase tracking-[0.2em]">Monto Mínimo</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-white text-2xl font-black font-mono tracking-tighter">${limitsAdjustment.montoMinimo}</span>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">usd</span>
                                </div>
                                {limitsAdjustment.montoMinimo > Number(solicitud.prestamo?.monto || 0) * 0.5 && (
                                    <span className="text-[9px] text-amber-500/60 italic font-medium">Cap: Saldo Pendiente</span>
                                )}
                            </div>

                            <div className="w-px h-10 bg-blue-500/10 self-center hidden sm:block" />

                            <div className="flex flex-col items-center gap-1">
                                <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em]">Monto Máximo</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-emerald-400 text-3xl font-black font-mono tracking-tighter shadow-emerald-500/10">${limitsAdjustment.montoMaximo}</span>
                                    <span className="text-[10px] text-emerald-600 font-bold uppercase">usd</span>
                                </div>
                                <span className={cn(
                                    "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                                    limitsAdjustment.totalPotentialPct < 0 ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
                                )}>
                                    {limitsAdjustment.totalPotentialPct > 0 ? `+${limitsAdjustment.totalPotentialPct}%` : `${limitsAdjustment.totalPotentialPct}%`} (D-SCORE)
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Información de Auditoría */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-slate-400">Información de Auditoría</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Asesor</span>
                            <span className="text-white">{solicitud.asesor?.nombre_completo}</span>
                        </div>
                        {solicitud.supervisor && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Supervisor</span>
                                <span className="text-white">{solicitud.supervisor?.nombre_completo}</span>
                            </div>
                        )}
                        {solicitud.admin && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Admin</span>
                                <span className="text-white">{solicitud.admin?.nombre_completo}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-slate-500">Creado</span>
                            <span className="text-white">{new Date(solicitud.created_at).toLocaleString()}</span>
                        </div>
                        {solicitud.fecha_preaprobacion && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">Pre-aprobado</span>
                                <span className="text-white">{new Date(solicitud.fecha_preaprobacion).toLocaleString()}</span>
                            </div>
                        )}
                        {solicitud.fecha_aprobacion && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">{solicitud.estado_solicitud === 'rechazado' ? 'Rechazado' : 'Aprobado'}</span>
                                <span className="text-white">{new Date(solicitud.fecha_aprobacion).toLocaleString()}</span>
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
                    <div className="grid gap-6 md:grid-cols-2">
                        <Link 
                            href={`/dashboard/prestamos/${solicitud.prestamo_nuevo_id}`}
                            className="flex flex-col items-center justify-center bg-emerald-900/20 border border-emerald-700/50 rounded-xl p-8 hover:bg-emerald-900/30 transition-colors h-full"
                        >
                            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
                            <p className="text-emerald-400 font-bold text-lg mb-2">Renovación Exitosa</p>
                            <p className="text-slate-300 text-center mb-6 max-w-xs">
                                El préstamo anterior ha sido liquidado y el nuevo crédito está activo.
                            </p>
                            <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
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
