
import Link from 'next/link'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { BackButton } from '@/components/ui/back-button'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { User, CreditCard, Phone, MapPin, Activity, DollarSign, Calendar, FileText, TrendingUp, Wallet, CheckCircle, Plus, FileStack, MessageSquare, Users, History, AlertTriangle, Lock, Info, AlertCircle } from 'lucide-react'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClienteTabs } from '@/components/clientes/cliente-tabs'
import { cn, getFrequencyBadgeStyles } from '@/lib/utils'
import { calculateLoanMetrics, getLoanStatusUI, calculateClientReputation, getComprehensiveEvaluation } from '@/lib/financial-logic'
import { ClientReputationGauge } from '@/components/ui/client-reputation-gauge'
import { ReputationBreakdown } from '@/components/ui/score-indicator'
import { ClientGestiones } from '@/components/clientes/client-gestiones'
import { ClientExpediente } from '@/components/clientes/client-expediente'
import { ClientProfileActions } from '@/components/clientes/client-profile-actions'
import { Edit, Scale, ShieldCheck, Award } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
    const supabaseAdmin = createAdminClient()
    const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('nombres')
        .eq('id', params.id)
        .single()
    return {
        title: cliente?.nombres || 'Detalle Cliente'
    }
}

export default async function ClienteProfilePage({ params }: { params: { id: string } }) {
    const { id } = params
    
    // Use admin client to bypass RLS
    const supabaseAdmin = createAdminClient()

    const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('*, solicitudes(documentos_evaluacion, created_at, gps_coordenadas, giro_negocio, fuentes_ingresos, ingresos_mensuales, motivo_prestamo), sectores(id, nombre), asesor:asesor_id(nombre_completo)')
        .eq('id', id)
        .single()

    if (!cliente) return notFound()

    // Process documents from latest request
    const latestSolicitud = cliente.solicitudes?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    const documentos = latestSolicitud?.documentos_evaluacion || {}

    // Fetch loans history with full relations for metrics calculation
    const { data: loans, error: loansError } = await supabaseAdmin
        .from('prestamos')
        .select(`
            *,
            cronograma_cuotas (
                *,
                pagos (created_at, monto_pagado, metodo_pago, registrado_por)
            )
        `)
        .eq('cliente_id', id)
        .order('created_at', { ascending: false })

    if (loansError) {
        console.error('❌ Error fetching loans for history:', loansError)
    }

    // [NUEVO] Obtener IDs de préstamos que son producto de una refinanciación directa
    const { data: renovacionesRefinanciamiento } = await supabaseAdmin
        .from('renovaciones')
        .select('prestamo_nuevo_id, prestamo_original:prestamo_original_id(estado)')
    const prestamoIdsProductoRefinanciamiento = (renovacionesRefinanciamiento || [])
        .filter((r: any) => (r.prestamo_original as any)?.estado === 'refinanciado')
        .map((r: any) => r.prestamo_nuevo_id as string)
        .filter(Boolean)

    // [NUEVO] Obtener configuración de reputación para evaluación precisa
    const { data: configRows } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', [
            'reputation_bonus_finalizado',
            'reputation_bonus_renovado',
            'reputation_bonus_salud_excelente',
            'reputation_penalty_refinanciado',
            'reputation_penalty_vencido',
            'reputation_penalty_salud_pobre',
            'reputation_bonus_antiguedad_mensual',
            'score_peso_puntual',
            'score_peso_tarde',
            'score_peso_cpp',
            'score_peso_moroso',
            'score_peso_vencido',
            'score_peso_diario_atraso',
            'score_tope_atraso_cuota',
            'score_mult_semanal',
            'score_mult_quincenal',
            'score_mult_mensual'
        ])
    
    const systemConfig = (configRows || []).reduce((acc: any, row: any) => ({ ...acc, [row.clave]: row.valor }), {})

    // [NUEVO] Evaluación Integral Centralizada
    const { 
        healthScore, 
        healthScoreData, 
        reputationData, 
        reputationScore, 
        paymentHabits 
    } = getComprehensiveEvaluation(cliente, loans || [], [], undefined, systemConfig)

    const { pctEfectivo, pctDigital, totalPayments } = paymentHabits

    // Fetch reassignment history
    const { data: reassignmentHistory } = await supabaseAdmin
        .from('historial_reasignaciones_clientes')
        .select(`
            *,
            asesor_anterior:asesor_anterior_id(nombre_completo),
            asesor_nuevo:asesor_nuevo_id(nombre_completo),
            administrador:creado_por(nombre_completo)
        `)
        .eq('cliente_id', id)
        .order('created_at', { ascending: false })

    // Get current user and role
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user?.id)
        .single()

    const userRole = perfil?.rol || 'asesor'

    return (
        <div className="page-container">
            {/* Premium Profile Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/20 border border-slate-800 shadow-xl">
                    <div className="relative p-3 md:p-5 flex flex-col md:flex-row gap-4 md:gap-5 items-center md:items-start text-center md:text-left">
                     <div className="relative shrink-0">
                        <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 p-[1px] shadow-lg shadow-blue-500/10">
                            <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                {cliente.foto_perfil ? (
                                    <ImageLightbox
                                        src={cliente.foto_perfil}
                                        alt={cliente.nombres}
                                        className="w-full h-full"
                                        thumbnail={
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img 
                                                    src={cliente.foto_perfil} 
                                                    alt={cliente.nombres} 
                                                    className="w-full h-full object-cover"
                                                />
                                            </>
                                        }
                                    />
                                ) : (
                                    <span className="text-4xl font-bold text-slate-200">
                                        {cliente.nombres.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 space-y-2 w-full">
                        <div>
                            <div className="flex flex-col md:flex-row items-center md:items-start lg:items-center gap-2 mb-0.5">
                                <div className="flex items-center gap-3 w-full justify-center md:justify-start">
                                    <BackButton />
                                    <h1 className="text-lg md:text-2xl font-bold text-white tracking-tight">{cliente.nombres}</h1>
                                </div>
                                <Badge className={`px-2 py-0 text-[9px] border h-4 ${
                                    cliente.estado === 'activo' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                    <div className={`w-1 h-1 rounded-full mr-1.5 ${cliente.estado === 'activo' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                                    {cliente.estado?.toUpperCase() || 'ACTIVO'}
                                </Badge>
                            </div>
                            <p className="text-slate-500 text-xs mt-0.5 flex items-center justify-center md:justify-start gap-2">
                                <span className="text-slate-600">DNI:</span> {cliente.dni}
                            </p>
                        </div>
 
                        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800/30 border border-slate-700/30 backdrop-blur-md max-w-full">
                                 <Phone className="w-3 h-3 text-blue-400 shrink-0" />
                                 <span className="text-[10px] text-slate-300 truncate">{cliente.telefono || 'Sin teléfono'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800/30 border border-slate-700/30 backdrop-blur-md max-w-full">
                                 <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                                 <span className="text-[10px] text-slate-300 truncate">{cliente.direccion || 'Sin dirección'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800/30 border border-slate-700/30 backdrop-blur-md max-w-full">
                                 <Users className="w-3 h-3 text-blue-400 shrink-0" />
                                 <span className="text-[10px] text-slate-300 truncate">Asesor: {cliente.asesor?.nombre_completo || 'No asignado'}</span>
                              </div>
                              {cliente.sectores?.nombre && (
                                <div className="flex items-center gap-2 px-2 py-0.5 rounded-lg bg-purple-900/20 border border-purple-500/20 backdrop-blur-md shrink-0">
                                    <span className="text-[10px] text-purple-300 uppercase tracking-wider font-semibold">{cliente.sectores.nombre}</span>
                                </div>
                              )}
                              
                              <div className="hidden md:flex items-center gap-3 ml-2 pl-3 border-l border-white/5">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none">Historial</span>
                                    <span className="text-sm font-bold text-white leading-none">{loans?.filter((l: any) => l.estado !== 'anulado').length || 0}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[8px] text-emerald-500/60 font-bold uppercase tracking-widest leading-none">Activos</span>
                                    <span className="text-sm font-bold text-emerald-400 leading-none">
                                        {loans?.filter((l: any) => {
                                            const isMigrado = (l.observacion_supervisor || '').includes('Préstamo migrado') || (l.observacion_supervisor || '').includes('[MIGRACIÓN]')
                                            const _saldo = l.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) ?? 0
                                            const isEffectivelyFinalized = isMigrado && (l.cronograma_cuotas?.length ?? 0) > 0 && _saldo <= 0.01
                                            return l.estado === 'activo' && !isEffectivelyFinalized
                                        }).length || 0}
                                    </span>
                                </div>
                              </div>
                        </div>
                    </div>
 
                    <div className="flex flex-col items-center md:items-end gap-3 min-w-[200px] w-full md:w-auto self-center">
                        {/* Mobile Metrics Inline */}
                        <div className="md:hidden flex items-center gap-6 py-1 px-4 bg-slate-950/40 rounded-xl border border-white/5">
                            <div className="flex flex-col items-center">
                                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">Historial</span>
                                <span className="text-sm font-black text-white leading-none">{loans?.filter((l: any) => l.estado !== 'anulado').length || 0}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-[8px] text-emerald-500/60 font-bold uppercase tracking-widest leading-none mb-1">Activos</span>
                                <span className="text-sm font-black text-emerald-400 leading-none">
                                    {loans?.filter((l: any) => {
                                        const isMigrado = (l.observacion_supervisor || '').includes('Préstamo migrado') || (l.observacion_supervisor || '').includes('[MIGRACIÓN]')
                                        const _saldo = l.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) ?? 0
                                        const isEffectivelyFinalized = isMigrado && (l.cronograma_cuotas?.length ?? 0) > 0 && _saldo <= 0.01
                                        return l.estado === 'activo' && !isEffectivelyFinalized
                                    }).length || 0}
                                </span>
                            </div>
                        </div>

                         
                         {(userRole === 'admin' || userRole === 'supervisor') && (
                             <div className="w-full">
                                <ClientProfileActions 
                                    cliente={{
                                        ...cliente, 
                                        documentos,
                                        giro_negocio: latestSolicitud?.giro_negocio,
                                        fuentes_ingresos: latestSolicitud?.fuentes_ingresos,
                                        ingresos_mensuales: latestSolicitud?.ingresos_mensuales,
                                        motivo_prestamo: latestSolicitud?.motivo_prestamo,
                                        gps_coordenadas: latestSolicitud?.gps_coordenadas,
                                    }} 
                                    userRole={userRole} 
                                />
                             </div>
                         )}
                    </div>
                 </div>
            </div>

            <div className={cn(
                "grid gap-4",
                (userRole === 'admin' || userRole === 'supervisor') ? "md:grid-cols-3" : "md:grid-cols-1"
            )}>
                 {/* Main Content Column */}
                 <div className={cn(
                    "space-y-6 overflow-x-hidden",
                    (userRole === 'admin' || userRole === 'supervisor') ? "md:col-span-2" : "md:col-span-1"
                 )}>
                    
                    <ClienteTabs defaultTab="historial" className="w-full">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
                            <div className="overflow-x-auto pb-1 scrollbar-none scroll-smooth w-full min-w-0">
                                <TabsList className="bg-slate-900/50 border border-slate-800 p-0.5 flex items-center w-max min-w-full md:min-w-0 md:w-fit gap-1">
                                    <TabsTrigger value="historial" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                        <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Historial
                                    </TabsTrigger>
                                    <TabsTrigger value="gestiones" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                        <MessageSquare className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Gestiones
                                    </TabsTrigger>
                                    <TabsTrigger value="expediente" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                        <FileStack className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Expediente
                                    </TabsTrigger>

                                    <TabsTrigger value="reputacion" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                        <Award className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Reputación
                                    </TabsTrigger>
                                    
                                    {userRole === 'admin' && (
                                        <TabsTrigger value="resumen" className="md:hidden h-7 px-2 text-[10px] data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                            <TrendingUp className="w-3 h-3 mr-1 md:mr-1.5" /> Resumen
                                        </TabsTrigger>
                                    )}
                                    
                                    {(userRole === 'admin' || userRole === 'supervisor') && (
                                        <TabsTrigger value="habitos" className="md:hidden h-7 px-2 text-[10px] data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                            <Wallet className="w-3 h-3 mr-1 md:mr-1.5" /> Hábitos
                                        </TabsTrigger>
                                    )}

                                    {userRole === 'admin' && (
                                        <TabsTrigger value="asignaciones" className="h-7 px-2 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white transition-all">
                                            <History className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" /> Asignaciones
                                        </TabsTrigger>
                                    )}
                                </TabsList>
                            </div>
                            
                        </div>

                        <TabsContent value="historial" className="space-y-3 m-0 animate-in fade-in duration-300 overflow-x-hidden">
                            {loans?.map((loan: any) => {
                                 const metrics = calculateLoanMetrics(loan)
                                 const statusUI = getLoanStatusUI({ ...loan, metrics })
                                 
                                 const isMigrado = (loan.observacion_supervisor || '').includes('Préstamo migrado') || (loan.observacion_supervisor || '').includes('[MIGRACIÓN]')
                                 const isPaid = metrics.saldoPendiente <= 0.01 || ['finalizado', 'pagado', 'renovado', 'refinanciado'].includes(loan.estado);
                                 
                                 return (
                                <Link key={loan.id} href={`/dashboard/prestamos/${loan.id}`} className="block">
                                    <div className={cn(
                                        "group relative overflow-hidden transition-all duration-200 shadow-sm rounded-xl border",
                                        // Card Base Style
                                        isPaid ? 
                                            "bg-slate-900/40 border-slate-800 opacity-60 grayscale-[0.8]" : 
                                            "bg-slate-900 border-slate-800/60 hover:shadow-md hover:border-slate-700",
                                        
                                        // Status Bar (Left Border)
                                        isPaid ? "border-l-[4px] border-l-slate-600" :
                                        loan.estado_mora === 'vencidom' || statusUI.label === 'VENCIDO' ? "border-l-[4px] border-l-rose-500" :
                                        loan.estado_mora === 'morosom' || statusUI.label === 'MOROSO' ? "border-l-[4px] border-l-red-600" :
                                        statusUI.label === 'CPP' || (metrics.deudaExigibleHoy > 0 && metrics.cuotasAtrasadas >= 3) ? "border-l-[4px] border-l-orange-500" :
                                        metrics.deudaExigibleHoy > 0 ? "border-l-[4px] border-l-amber-400" :
                                        "border-l-[4px] border-l-emerald-500"
                                    )}>
                                        <div className="flex flex-col py-1.5 px-3 gap-1 relative bg-gradient-to-br from-slate-900/50 to-slate-900/10 hover:bg-slate-800/20 transition-colors">
                                            {/* TOP ROW: ID, Monto and Badges (Unified Line) */}
                                            <div className="flex items-center justify-between gap-2 h-5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={cn(
                                                        "h-4 w-4 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0",
                                                        isPaid && "bg-emerald-500/10 text-emerald-500"
                                                    )}>
                                                        {isPaid ? <CheckCircle className="w-2.5 h-2.5" /> : <Wallet className="w-2.5 h-2.5" />}
                                                    </div>
                                                    
                                                    <div className="flex items-baseline gap-2 overflow-hidden">
                                                        <h3 className="text-sm font-black text-white leading-none shrink-0">
                                                            ${parseFloat(loan.monto).toFixed(0)}
                                                        </h3>
                                                        <div className="flex items-center gap-1.5 opacity-60 shrink-0">
                                                            <span className="text-[7px] font-mono text-slate-500 uppercase tracking-tighter">
                                                                #{loan.id.split('-')[0].toUpperCase()}
                                                            </span>
                                                            <span className="text-[7px] font-bold text-slate-600 border-l border-slate-800 pl-1.5 flex items-center gap-1 uppercase tracking-tighter">
                                                                <Calendar className="w-2 h-2" />
                                                                {format(new Date(loan.created_at), 'dd MMM yy', { locale: es })}
                                                            </span>
                                                        </div>
                                                        
                                                        <div className="flex items-center gap-1">
                                                            {loan.es_paralelo && (
                                                                <Badge variant="outline" className="text-[6.5px] h-3 border-purple-500/30 text-purple-400 bg-purple-500/5 px-1 uppercase font-black">P</Badge>
                                                            )}
                                                            {/* Badge de Refinanciamiento */}
                                                            {prestamoIdsProductoRefinanciamiento.includes(loan.id) && (
                                                                <span 
                                                                    className="flex items-center gap-0.5 text-[6.5px] font-black uppercase tracking-tight text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1 py-0 rounded shrink-0"
                                                                    title="Refinanciamiento"
                                                                >
                                                                    <AlertTriangle className="w-1.5 h-1.5 shrink-0" />
                                                                    REFIN.
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Badge 
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[7px] font-black uppercase tracking-wider px-1 h-3.5 rounded-md bg-slate-950/50",
                                                            statusUI.border,
                                                            statusUI.color,
                                                            statusUI.animate && "animate-pulse"
                                                        )}
                                                    >
                                                        {statusUI.label}
                                                    </Badge>
                                                    <span className={cn(
                                                        "text-[7px] font-bold uppercase tracking-wide border px-1 h-3.5 flex items-center rounded-md bg-slate-950/30 shadow-sm",
                                                        getFrequencyBadgeStyles(loan.frecuencia)
                                                    )}>
                                                        {loan.frecuencia}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* UNIFIED FINANCIAL ROW (Metrics Only) */}
                                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/40 mt-1">
                                                <div className="flex items-center gap-4 overflow-hidden">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] text-blue-500/60 uppercase font-black tracking-tighter">Interés</span>
                                                        <span className="text-[11px] font-black text-blue-400 opacity-90 leading-none">{loan.interes}%</span>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-4 border-l border-slate-700/30 pl-3">
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-slate-500 uppercase font-black tracking-tighter">Cuota</span>
                                                            <span className="font-mono text-slate-200 text-xs font-bold leading-none">
                                                                ${parseFloat(
                                                                    loan.valor_cuota || 
                                                                    loan.valorCuota || 
                                                                    loan.cuota || 
                                                                    loan.monto_cuota || 
                                                                    loan.cronograma_cuotas?.[0]?.monto_cuota || 
                                                                    0
                                                                ).toFixed(0)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-slate-800/40 pl-3">
                                                            <span className="text-[8px] text-red-500/60 uppercase font-black tracking-tighter">Mora</span>
                                                            <span className={cn(
                                                                "font-mono text-xs font-extrabold leading-none",
                                                                metrics.deudaExigibleHoy > 0 ? "text-red-500" : "text-slate-600"
                                                            )}>
                                                                ${metrics.deudaExigibleHoy.toFixed(0)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-slate-800/40 pl-3">
                                                            <span className="text-[8px] text-blue-500/60 uppercase font-black tracking-tighter">Saldo</span>
                                                            <span className={cn(
                                                                "font-mono text-xs font-extrabold leading-none",
                                                                metrics.saldoPendiente > 0 ? "text-blue-400" : "text-slate-600"
                                                            )}>
                                                                ${metrics.saldoPendiente.toFixed(0)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 shrink-0">
                                                    {metrics.cuotasAtrasadas > 0 && !isPaid && (
                                                        <div className="flex items-center gap-1 text-rose-500 font-black text-[9px] bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30 uppercase tracking-tight shadow-[0_0_10px_rgba(244,63,94,0.1)]">
                                                            <AlertTriangle className="w-3 h-3 animate-pulse" />
                                                            {metrics.cuotasAtrasadas} ATR
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-slate-500 font-black text-[8px] uppercase tracking-tighter">Progreso</span>
                                                        <span className="text-xs font-black text-slate-300 tracking-tighter leading-none">
                                                            {metrics.cuotasPagadas}/{metrics.totalCuotas}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            )})}
                            {(!loans || loans.length === 0) && (
                                <div className="text-center py-16 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
                                    <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Wallet className="w-8 h-8 text-slate-600" />
                                    </div>
                                    <h3 className="text-slate-400 font-medium">Sin historial</h3>
                                    <p className="text-slate-600 text-sm mt-1">Este cliente no tiene préstamos registrados</p>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="gestiones" className="m-0 animate-in fade-in duration-300 overflow-x-hidden">
                             <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
                                <CardContent className="p-0">
                                    <ClientGestiones 
                                        loans={loans || []} 
                                        clienteId={id}
                                        clienteNombre={cliente.nombres}
                                        userRol={userRole as any} 
                                    />
                                </CardContent>
                             </Card>
                        </TabsContent>

                            <TabsContent value="expediente" className="m-0 animate-in fade-in duration-300 overflow-x-hidden">
                                 <ClientExpediente documentos={documentos} />
                            </TabsContent>

                            <TabsContent value="reputacion" className="m-0 animate-in fade-in duration-300">
                                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm overflow-hidden relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />
                                    <CardHeader className="py-2.5 px-4 border-b border-white/5 relative">
                                        <CardTitle className="text-white text-sm flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Award className="w-4 h-4 text-blue-400" />
                                                Reputación y Comportamiento
                                            </div>
                                            <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-300 border-blue-500/20 px-2">Historial Consolidado</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 relative">
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8">
                                            {/* Left side: The Gauge */}
                                            <div className="flex flex-col items-center justify-center bg-slate-950/40 rounded-2xl p-6 border border-white/5 shadow-inner">
                                                <ClientReputationGauge 
                                                    score={reputationScore} 
                                                    size="lg" 
                                                    showLabel={true}
                                                />
                                                <div className="mt-4 text-center">
                                                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Estatus Global</p>
                                                    <p className="text-xs text-slate-300 font-medium max-w-[150px]">
                                                        {reputationScore >= 80 ? 'Cliente de excelente cumplimiento y trayectoria.' :
                                                         reputationScore >= 60 ? 'Cliente confiable con buen historial de pagos.' :
                                                         reputationScore >= 40 ? 'Cliente con cumplimiento regular.' :
                                                         'Cliente con factores de riesgo detectados.'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Right side: The Breakdown */}
                                            <div className="bg-slate-950/20 rounded-2xl p-4 border border-white/5">
                                                <ReputationBreakdown reputationData={reputationData} />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="resumen" className="md:hidden animate-in fade-in space-y-4 duration-300">
                                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
                                    <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                        <CardTitle className="text-white text-sm flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-purple-500" />
                                            Resumen Financiero
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2.5 p-3">
                                        <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-slate-700 transition-colors">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Total Prestado Histórico</div>
                                            <div className="text-xl font-bold text-white">${loans?.reduce((acc: number, l: any) => acc + (parseFloat(l.monto) || 0), 0).toLocaleString()}</div>
                                        </div>
                                        <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-emerald-500/20 transition-colors">
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Préstamos Activos</div>
                                            <div className="text-xl font-bold text-emerald-400">
                                                {loans?.filter((l: any) => {
                                                    const isMigrado = (l.observacion_supervisor || '').includes('Préstamo migrado') || (l.observacion_supervisor || '').includes('[MIGRACIÓN]')
                                                    const _saldo = l.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) ?? 0
                                                    const isEffectivelyFinalized = isMigrado && (l.cronograma_cuotas?.length ?? 0) > 0 && _saldo <= 0.01
                                                    return l.estado === 'activo' && !isEffectivelyFinalized
                                                }).length || 0}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="habitos" className="md:hidden animate-in fade-in space-y-4 duration-300">
                                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
                                    <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                        <CardTitle className="text-white text-sm flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-blue-500" />
                                            Hábito de Pago
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2.5 p-3 text-[11px]">
                                        {totalPayments > 0 ? (
                                            <>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-slate-300">
                                                        <span className="font-medium flex items-center gap-1.5"><DollarSign className="w-3 h-3 text-slate-400"/> Efectivo</span>
                                                        <span className="font-bold">{pctEfectivo}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-800 rounded-full h-1">
                                                        <div className="bg-slate-400 h-1 rounded-full" style={{ width: `${pctEfectivo}%` }}></div>
                                                    </div>
                                                </div>
                                                <div className="space-y-1 pt-1">
                                                    <div className="flex justify-between text-slate-300">
                                                        <span className="font-medium flex items-center gap-1.5">📱 Digital (Yape/Plin)</span>
                                                        <span className="font-bold text-blue-400">{pctDigital}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-800 rounded-full h-1">
                                                        <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${pctDigital}%` }}></div>
                                                    </div>
                                                </div>
                                                <div className="text-center text-[9px] text-slate-500 mt-2 pt-1.5 border-t border-slate-800/50">
                                                    Basado en {totalPayments} cobro(s) registrado(s)
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center text-slate-500 py-4">Sin datos de pagos suficientes</div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {userRole === 'admin' && (
                                <TabsContent value="asignaciones" className="m-0 animate-in fade-in duration-300 overflow-x-hidden">
                                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
                                        <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                            <CardTitle className="text-white text-sm flex items-center gap-2">
                                                <History className="w-4 h-4 text-blue-400" />
                                                Historial de Asignaciones
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 space-y-4">
                                            {reassignmentHistory && reassignmentHistory.length > 0 ? (
                                                <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-4 before:w-[1px] before:bg-slate-800">
                                                    {reassignmentHistory.map((item: any) => (
                                                        <div key={item.id} className="relative pl-10">
                                                            <div className="absolute left-[13px] top-1 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-slate-900 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                                            <div className="text-[10px] text-slate-500 font-mono mb-1">
                                                                {format(new Date(item.created_at), 'PPPp', { locale: es })}
                                                            </div>
                                                            <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 hover:border-slate-700/50 transition-colors">
                                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Transferencia</span>
                                                                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-blue-500/10 text-blue-400 border-blue-500/20">Auditado</Badge>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-xs">
                                                                            <span className="text-slate-400">{item.asesor_anterior?.nombre_completo || 'Origen Desconocido'}</span>
                                                                            <TrendingUp className="w-3 h-3 text-slate-600" />
                                                                            <span className="text-blue-400 font-bold">{item.asesor_nuevo?.nombre_completo}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <div className="text-[8px] text-slate-600 uppercase font-bold">Administrador</div>
                                                                        <div className="text-[10px] text-slate-300">{item.administrador?.nombre_completo || 'Sistema'}</div>
                                                                    </div>
                                                                </div>
                                                                {item.motivo && (
                                                                    <div className="mt-2 pt-2 border-t border-slate-800/30 text-[10px] text-slate-500 italic">
                                                                        &quot;{item.motivo}&quot;
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10 text-slate-500 italic text-xs">
                                                    No se registran cambios de asesor para este cliente.
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            )}
                    </ClienteTabs>
                 </div>

                  {/* Sidebar Stats column - Hidden on Mobile */}
                  <div className="hidden md:block space-y-6">
                    {/* Resumen - Only for Admin in Sidebar too */}
                    {userRole === 'admin' && (
                        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm sticky top-8">
                            <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-purple-500" />
                                    Resumen Financiero
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2.5 p-3">
                                <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-slate-700 transition-colors">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Total Prestado Histórico</div>
                                    <div className="text-xl font-bold text-white">
                                        ${loans?.reduce((acc: number, l: any) => acc + (parseFloat(l.monto) || 0), 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/50 hover:border-emerald-500/20 transition-colors">
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Préstamos Activos</div>
                                    <div className="text-xl font-bold text-emerald-400">
                                        {loans?.filter((l: any) => {
                                            const isMigrado = (l.observacion_supervisor || '').includes('Préstamo migrado') || (l.observacion_supervisor || '').includes('[MIGRACIÓN]')
                                            const _saldo = l.cronograma_cuotas?.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0) ?? 0
                                            const isEffectivelyFinalized = isMigrado && (l.cronograma_cuotas?.length ?? 0) > 0 && _saldo <= 0.01
                                            return l.estado === 'activo' && !isEffectivelyFinalized
                                        }).length || 0}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
 
                    {/* PAYMENT HABITS - Admin and Supervisor */}
                    {(userRole === 'admin' || userRole === 'supervisor') && (
                        <Card className={cn(
                            "bg-slate-900/40 border-slate-800 backdrop-blur-sm sticky",
                            userRole === 'admin' ? "top-[14rem]" : "top-8"
                        )}>
                            <CardHeader className="py-2.5 px-4 border-b border-white/5">
                                <CardTitle className="text-white text-sm flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-blue-500" />
                                    Hábito de Pago
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2.5 p-3 text-[11px]">
                                {totalPayments > 0 ? (
                                    <>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-slate-300">
                                                <span className="font-medium flex items-center gap-1.5"><DollarSign className="w-3 h-3 text-slate-400"/> Efectivo</span>
                                                <span className="font-bold">{pctEfectivo}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 rounded-full h-1">
                                                <div className="bg-slate-400 h-1 rounded-full" style={{ width: `${pctEfectivo}%` }}></div>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-1 pt-1">
                                            <div className="flex justify-between text-slate-300">
                                                <span className="font-medium flex items-center gap-1.5">📱 Digital (Yape/Plin)</span>
                                                <span className="font-bold text-blue-400">{pctDigital}%</span>
                                            </div>
                                            <div className="w-full bg-slate-800 rounded-full h-1">
                                                <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${pctDigital}%` }}></div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-center text-[9px] text-slate-500 mt-2 pt-1.5 border-t border-slate-800/50">
                                            Basado en {totalPayments} cobro(s) registrado(s)
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-slate-500 py-4">
                                        Sin datos de pagos suficientes
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                  </div>
            </div>
        </div>
    )
}
