
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
import { User, CreditCard, Phone, MapPin, Activity, DollarSign, Calendar, FileText, TrendingUp, Wallet, CheckCircle, Plus, FileStack, MessageSquare, Users, History } from 'lucide-react'
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClienteTabs } from '@/components/clientes/cliente-tabs'
import { cn } from '@/lib/utils'
import { ClientGestiones } from '@/components/clientes/client-gestiones'
import { ClientExpediente } from '@/components/clientes/client-expediente'
import { ClientProfileActions } from '@/components/clientes/client-profile-actions'
import { Edit } from 'lucide-react'

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

    // Fetch loans history...
    const { data: loans } = await supabaseAdmin.from('prestamos').select('*').eq('cliente_id', id).order('created_at', { ascending: false })

    // Fetch payments to calculate payment habits
    const prestamoIds = loans?.map((l: any) => l.id) || []
    
    let countEfectivo = 0
    let countDigital = 0
    let totalPayments = 0

    if (prestamoIds.length > 0) {
        // Query payments associated with these loans via cronograma_cuotas
        const { data: pagos } = await supabaseAdmin
            .from('pagos')
            .select('metodo_pago, cronograma_cuotas!inner(prestamo_id)')
            .in('cronograma_cuotas.prestamo_id', prestamoIds)
            
        if (pagos) {
            pagos.forEach((p: any) => {
                totalPayments++
                // Legacy payments (null) default to Efectivo
                const method = p.metodo_pago || 'Efectivo'
                if (method === 'Efectivo') {
                    countEfectivo++
                } else {
                    countDigital++
                }
            })
        }
    }

    const pctEfectivo = totalPayments > 0 ? Math.round((countEfectivo / totalPayments) * 100) : 0
    const pctDigital = totalPayments > 0 ? Math.round((countDigital / totalPayments) * 100) : 0

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
 
                        <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
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
                        </div>
                    </div>
 
                    <div className="flex flex-col gap-1.5 min-w-[170px] w-full md:w-auto">
                        <div className="grid grid-cols-2 gap-1.5">
                             <div className="p-1.5 rounded-lg bg-slate-900/40 border border-slate-800/40 flex flex-col items-center justify-center group">
                                <div className="text-[7px] text-slate-500 uppercase tracking-widest font-bold mb-0.5">Historial</div>
                                <div className="text-base font-bold text-white leading-none">
                                    {loans?.filter((l: any) => {
                                        const isMigrado = l.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
                                        const isEffectivelyFinalized = l.estado === 'finalizado' || (isMigrado && l.saldo_pendiente <= 0.01)
                                        return l.estado === 'completado' || l.estado === 'renovado' || isEffectivelyFinalized || (l.saldo_pendiente !== null && l.saldo_pendiente <= 0.01 && l.estado !== 'anulado')
                                    }).length || 0}
                                </div>
                            </div>
                             <div className="p-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10 flex flex-col items-center justify-center group">
                                <div className="text-[7px] text-blue-400/80 uppercase tracking-widest font-bold mb-0.5">Activos</div>
                                <div className="text-base font-bold text-blue-100 leading-none">
                                    {loans?.filter((l: any) => {
                                        const isMigrado = l.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
                                        const isEffectivelyFinalized = isMigrado && l.saldo_pendiente <= 0.01
                                        return l.estado === 'activo' && !isEffectivelyFinalized
                                    }).length || 0}
                                </div>
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

                        <TabsContent value="historial" className="space-y-4 m-0 animate-in fade-in duration-300 overflow-x-hidden">
                            {loans?.map((loan: any) => {
                                 const isMigrado = loan.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
                                 const isEffectivelyFinalized = loan.estado === 'finalizado' || (isMigrado && loan.saldo_pendiente <= 0.01)
                                 const isPaid = loan.estado === 'pagado' || isEffectivelyFinalized;
                                 
                                 return (
                                <Link key={loan.id} href={`/dashboard/prestamos/${loan.id}`}>
                                    <div className="group relative overflow-hidden bg-slate-900/40 border border-slate-800 rounded-lg p-2.5 hover:border-blue-500/30 hover:bg-slate-900/60 transition-all duration-300">
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                                    isPaid ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20'
                                                }`}>
                                                    {isPaid ? <CheckCircle className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                                                </div>
                                                <div>
                                                    <div className="text-base font-bold text-white group-hover:text-blue-200 transition-colors">
                                                        ${loan.monto}
                                                    </div>
                                                    <div className="text-[9px] text-slate-500 flex items-center gap-1 font-mono mt-0.5">
                                                        <Calendar className="w-2.5 h-2.5" />
                                                        {format(new Date(loan.created_at), 'dd MMM yyyy', { locale: es })}
                                                    </div>
                                                </div>
                                            </div>
 
                                            <div className="flex items-center justify-between w-full sm:w-auto gap-4 sm:gap-6 border-t border-slate-800 sm:border-0 pt-1.5 sm:pt-0">
                                                <div className="text-left sm:text-right">
                                                    <div className="text-[7px] text-slate-500 uppercase tracking-wider font-bold">Interés</div>
                                                    <div className="text-[11px] font-medium text-slate-300">{loan.interes}%</div>
                                                </div>
                                                <Badge variant="outline" className={`px-1.5 py-0 text-[8px] h-4 border ${
                                                    !isEffectivelyFinalized && loan.estado === 'activo' ? 'bg-blue-950/30 text-blue-400 border-blue-900/50' : 
                                                    isPaid ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50' : 
                                                    'bg-slate-800.50 text-slate-400 border-slate-700'
                                                }`}>
                                                    {isEffectivelyFinalized ? 'FINALIZADO' : loan.estado.toUpperCase()}
                                                </Badge>
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
                                                    const isMigrado = l.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
                                                    const isEffectivelyFinalized = isMigrado && l.saldo_pendiente <= 0.01
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
                                            const isMigrado = l.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
                                            const isEffectivelyFinalized = isMigrado && l.saldo_pendiente <= 0.01
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
