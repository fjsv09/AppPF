import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { User, DollarSign, Calendar, Hash, RefreshCw, FileText, CheckCircle, Clock, AlertCircle, XCircle, MapPin, Eye } from 'lucide-react'

import { SolicitudActions } from '@/components/solicitudes/solicitud-actions'
import { SolicitudRealtime } from '@/components/solicitudes/solicitud-realtime'
import { formatMoney, formatDate } from '@/utils/format'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'

export const dynamic = 'force-dynamic'

const estadoConfig: Record<string, { label: string, color: string, icon: any }> = {
    'pendiente_supervision': { label: 'Pendiente Supervisión', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
    'en_correccion': { label: 'En Corrección', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: AlertCircle },
    'pre_aprobado': { label: 'Pre-Aprobado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: CheckCircle },
    'aprobado': { label: 'Aprobado', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
    'rechazado': { label: 'Rechazado', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export default async function SolicitudDetailPage({ params }: { params: { id: string } }) {
    const { id } = params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol')
        .eq('id', user?.id)
        .single()

    const { data: solicitud } = await supabaseAdmin
        .from('solicitudes')
        .select(`
            *,
            cliente:cliente_id(id, nombres, dni, telefono, direccion),
            asesor:asesor_id(id, nombre_completo),
            supervisor:supervisor_id(id, nombre_completo),
            admin:admin_id(id, nombre_completo)
        `)
        .eq('id', id)
        .single()

    if (!solicitud) {
        notFound()
    }

    const config = estadoConfig[solicitud.estado_solicitud] || estadoConfig['pendiente_supervision']
    const IconComponent = config.icon

    // Obtener cuentas administrativas (Cartera Global) si es admin y está pre-aprobado
    let cuentasAdmin: any[] = []
    if (perfil?.rol === 'admin' && solicitud.estado_solicitud === 'pre_aprobado') {
        const { data: globalCartera } = await supabaseAdmin
            .from('carteras')
            .select('id')
            .is('asesor_id', null)
            .limit(1)
            .single()

        if (globalCartera) {
            const { data: cuentas } = await supabaseAdmin
                .from('cuentas_financieras')
                .select('id, nombre, saldo, tipo')
                .eq('cartera_id', globalCartera.id)
            cuentasAdmin = cuentas || []
        }
    }

    // Calcular total estimado
    const total = solicitud.monto_solicitado * (1 + solicitud.interes / 100)
    const cuotaEstimada = total / solicitud.cuotas

    return (
        <div className="page-container max-w-4xl mx-auto">
            {/* Componente para actualización en tiempo real */}
            <SolicitudRealtime solicitudId={id} currentEstado={solicitud.estado_solicitud} />
            
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="page-title">Solicitud de Crédito</h1>
                                <Badge className={`${config.color} border flex items-center gap-1`}>
                                    <IconComponent className="w-3 h-3" />
                                    {config.label}
                                </Badge>
                            </div>
                            <p className="page-subtitle">
                                Creada el {format(new Date(solicitud.created_at), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Alert for pending action */}
            {solicitud.estado_solicitud === 'en_correccion' && solicitud.observacion_supervisor && (
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
                    <p className="text-sm font-bold text-orange-400 mb-1">⚠️ Observación del Supervisor</p>
                    <p className="text-orange-200">{solicitud.observacion_supervisor}</p>
                </div>
            )}

            {solicitud.estado_solicitud === 'rechazado' && solicitud.motivo_rechazo && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                    <p className="text-sm font-bold text-red-400 mb-1">❌ Motivo de Rechazo</p>
                    <p className="text-red-200">{solicitud.motivo_rechazo}</p>
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                {/* Datos del Cliente o Prospecto */}
                {/* Datos del Cliente o Prospecto */}
                <Card className="bg-slate-900 border-slate-800 shadow-sm overflow-hidden rounded-2xl">
                    <CardHeader className="bg-slate-950/40 pb-4 border-b border-slate-800/60 px-6">
                        <CardTitle className="text-base text-slate-100 flex items-center gap-2.5 font-bold tracking-tight">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <User className="w-4 h-4 text-purple-400" />
                            </div>
                            {solicitud.cliente ? 'Datos del Cliente' : 'Nuevo Prospecto'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Nombre</span>
                            <span className="text-sm font-medium text-slate-200">
                                {solicitud.cliente?.nombres || solicitud.prospecto_nombres}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">DNI</span>
                            <span className="text-sm font-mono text-slate-300">
                                {solicitud.cliente?.dni || solicitud.prospecto_dni}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Teléfono</span>
                            <span className="text-sm font-mono text-slate-300">
                                {solicitud.cliente?.telefono || solicitud.prospecto_telefono || '-'}
                            </span>
                        </div>
                        {(solicitud.cliente?.direccion || solicitud.prospecto_direccion) && (
                            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800/50">
                                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Dirección</span>
                                <span className="text-sm text-slate-300 leading-relaxed text-right">{solicitud.cliente?.direccion || solicitud.prospecto_direccion}</span>
                            </div>
                        )}
                        {!solicitud.cliente && solicitud.prospecto_ocupacion && (
                            <div className="flex justify-between items-center py-1">
                                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Ocupación</span>
                                <span className="text-sm text-slate-300">{solicitud.prospecto_ocupacion}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Asesor a Cargo</span>
                            <span className="text-sm text-blue-400 font-medium">{solicitud.asesor?.nombre_completo}</span>
                        </div>
                        {!solicitud.cliente && (
                            <div className="mt-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex gap-3 items-center">
                                <div className="text-xl">✨</div>
                                <p className="text-[11px] leading-tight text-purple-300">
                                    El cliente se registrará automáticamente en Solicitudes al <strong>aprobar</strong> esta solicitud.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Datos del Préstamo Solicitado */}
                {/* Datos del Préstamo Solicitado */}
                <Card className="bg-slate-900 border-slate-800 shadow-sm overflow-hidden rounded-2xl">
                    <CardHeader className="bg-slate-950/40 pb-4 border-b border-slate-800/60 px-6">
                        <CardTitle className="text-base text-slate-100 flex items-center gap-2.5 font-bold tracking-tight">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <DollarSign className="w-4 h-4 text-emerald-400" />
                            </div>
                            Detalles del Préstamo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Monto Solicitado</span>
                            <span className="text-2xl font-black text-emerald-400 tracking-tight">${solicitud.monto_solicitado.toLocaleString('en-US')}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Tasa de Interés</span>
                            <span className="text-sm font-medium text-slate-200">{solicitud.interes}%</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Plazo / Cuotas</span>
                            <span className="text-sm font-medium text-slate-200">{solicitud.cuotas} cuotas</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Modalidad</span>
                            <span className="text-sm font-medium text-slate-200 capitalize bg-slate-800 px-2.5 py-0.5 rounded-md">{solicitud.modalidad}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                            <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Fecha Propuesta</span>
                            <span className="text-sm text-slate-300 font-mono">{formatDate(solicitud.fecha_inicio_propuesta)}</span>
                        </div>
                        <div className="pt-4 mt-2 border-t border-slate-800/50 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Total a Devolver</span>
                                <span className="text-base text-slate-200 font-mono font-bold">${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                <span className="text-xs uppercase font-bold tracking-wider text-purple-400">Cuota Estimada</span>
                                <span className="text-lg text-purple-400 font-black font-mono tracking-tight">${cuotaEstimada.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} / {solicitud.modalidad === 'diario' ? 'día' : solicitud.modalidad === 'semanal' ? 'semana' : solicitud.modalidad === 'quincenal' ? 'quincena' : 'mes'}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Evaluación Financiera */}
            {(solicitud.giro_negocio || solicitud.fuentes_ingresos || solicitud.ingresos_mensuales) && (
                <Card className="bg-slate-900 border-slate-800 shadow-sm overflow-hidden rounded-2xl">
                    <CardHeader className="bg-slate-950/40 pb-4 border-b border-slate-800/60 px-6">
                        <CardTitle className="text-base text-slate-100 flex items-center gap-2.5 font-bold tracking-tight">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <FileText className="w-4 h-4 text-blue-400" />
                            </div>
                            Evaluación Comercial
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                            <div className="space-y-4">
                                {solicitud.giro_negocio && (
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Giro de Negocio</span>
                                        <span className="text-sm text-slate-200">{solicitud.giro_negocio}</span>
                                    </div>
                                )}
                                {solicitud.fuentes_ingresos && (
                                    <div className="flex flex-col gap-1.5 pt-4 md:pt-0 md:border-t-0 border-t border-slate-800/50">
                                        <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Fuentes de Ingresos</span>
                                        <span className="text-sm text-slate-200">{solicitud.fuentes_ingresos}</span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                {solicitud.ingresos_mensuales && (
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Ingresos Mensuales Aprox.</span>
                                        <span className="text-lg text-emerald-400 font-bold font-mono tracking-tight">S/ {solicitud.ingresos_mensuales.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                                    </div>
                                )}
                                {solicitud.motivo_prestamo && (
                                    <div className="flex flex-col gap-1.5 pt-4 md:pt-0 md:border-t-0 border-t border-slate-800/50">
                                        <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Motivo del Préstamo</span>
                                        <span className="text-sm text-slate-200 italic">"{solicitud.motivo_prestamo}"</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {solicitud.gps_coordenadas && (
                            <div className="mt-6 pt-4 border-t border-slate-800/50 flex flex-col gap-2">
                                <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Ubicación GPS (Negocio / Casa)</span>
                                <a 
                                    href={`https://www.google.com/maps?q=${solicitud.gps_coordenadas}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 w-max px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-colors text-sm font-medium"
                                >
                                    <MapPin className="w-4 h-4" />
                                    Ver ubicación en Google Maps
                                </a>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Documentos de Evaluación */}
            {solicitud.documentos_evaluacion && Object.keys(solicitud.documentos_evaluacion).length > 0 && (
                <Card className="bg-slate-900 border-slate-800 shadow-sm overflow-hidden rounded-2xl">
                    <CardHeader className="bg-slate-950/40 pb-4 border-b border-slate-800/60 px-6">
                        <CardTitle className="text-base text-slate-100 flex items-center gap-2.5 font-bold tracking-tight">
                            <div className="p-2 bg-pink-500/10 rounded-lg">
                                <FileText className="w-4 h-4 text-pink-400" />
                            </div>
                            Expediente y Documentos ({Object.keys(solicitud.documentos_evaluacion).length}/8)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { key: 'negocio', label: 'Foto del Negocio' },
                                { key: 'frontis_casa', label: 'Frontis de Casa' },
                                { key: 'recibo_luz_agua', label: 'Recibo Luz/Agua' },
                                { key: 'documentos_negocio', label: 'Docs Negocio' },
                                { key: 'foto_cliente', label: 'Foto Cliente' },
                                { key: 'filtro_sentinel', label: 'Filtro Crediticio' },
                                { key: 'dni_frontal', label: 'DNI Frontal' },
                                { key: 'dni_posterior', label: 'DNI Posterior' }
                            ].map((doc) => {
                                const hasDoc = solicitud.documentos_evaluacion?.[doc.key]
                                return (
                                    <div 
                                        key={doc.key}
                                        className={`p-3 rounded-2xl border transition-colors ${
                                            hasDoc 
                                                ? 'bg-slate-800/40 border-slate-700/50 hover:border-emerald-500/50' 
                                                : 'bg-slate-950/50 border-slate-800/50 border-dashed'
                                        }`}
                                    >
                                        {hasDoc ? (
                                            <div className="group relative">
                                                <ImageLightbox
                                                    src={solicitud.documentos_evaluacion[doc.key]}
                                                    alt={doc.label}
                                                    thumbnail={
                                                        <div className="cursor-pointer">
                                                            <div className="aspect-square bg-slate-950 rounded-xl mb-3 overflow-hidden border border-slate-700 relative">
                                                                <img 
                                                                    src={solicitud.documentos_evaluacion[doc.key]}
                                                                    alt={doc.label}
                                                                    className="w-full h-full object-cover group-hover:scale-105 group-hover:opacity-80 transition-all duration-300"
                                                                />
                                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Eye className="w-6 h-6 text-white" />
                                                                </div>
                                                            </div>
                                                            <p className="text-[11px] uppercase font-bold tracking-wider text-slate-300 truncate text-center flex items-center justify-center gap-1.5">
                                                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                                                                {doc.label}
                                                            </p>
                                                        </div>
                                                    }
                                                />
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center min-h-[140px] opacity-40">
                                                <div className="w-10 h-10 rounded-full bg-slate-800 mb-3 flex items-center justify-center">
                                                    <FileText className="w-4 h-4 text-slate-500" />
                                                </div>
                                                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 text-center px-2">{doc.label}</p>
                                                <span className="text-[9px] text-slate-600 font-medium mt-1">Faltante</span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Timeline de Aprobación */}
            <Card className="bg-slate-900 border-slate-800 shadow-sm overflow-hidden rounded-2xl">
                <CardHeader className="bg-slate-950/40 pb-4 border-b border-slate-800/60 px-6">
                    <CardTitle className="text-base text-slate-100 flex items-center gap-2.5 font-bold tracking-tight">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Clock className="w-4 h-4 text-blue-400" />
                        </div>
                        Historial de Aprobación
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700/50 before:to-transparent">
                        
                        {/* Paso 1: Creación */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 bg-emerald-500/20 text-emerald-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10">
                                <CheckCircle className="w-4 h-4" />
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-800/60 bg-slate-950/50 shadow-sm relative z-10">
                                <div className="flex items-center justify-between space-x-2 mb-1">
                                    <div className="font-bold text-slate-200 text-sm">Solicitud Creada</div>
                                    <div className="text-[10px] font-mono text-slate-500">{format(new Date(solicitud.created_at), "HH:mm", { locale: es })}</div>
                                </div>
                                 <div className="text-xs text-slate-400 leading-relaxed">
                                    Generada el {format(new Date(solicitud.created_at), "d MMM yyyy", { locale: es })} por <span className="font-medium text-slate-300">
                                        {(solicitud.observacion_supervisor?.includes('Administración') && solicitud.admin) 
                                            ? solicitud.admin.nombre_completo 
                                            : solicitud.asesor?.nombre_completo}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Paso 2: Supervisión */}
                        <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 ${
                                solicitud.fecha_preaprobacion ? 'bg-emerald-500/20 text-emerald-400' : 
                                (solicitud.estado_solicitud === 'rechazado' && !solicitud.fecha_preaprobacion) ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'
                            }`}>
                                {solicitud.fecha_preaprobacion ? (
                                    <CheckCircle className="w-4 h-4" />
                                ) : (solicitud.estado_solicitud === 'rechazado' && !solicitud.fecha_preaprobacion) ? (
                                    <XCircle className="w-4 h-4" />
                                ) : (
                                    <Clock className="w-4 h-4" />
                                )}
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-800/60 bg-slate-950/50 shadow-sm relative z-10">
                                <div className="flex items-center justify-between space-x-2 mb-1">
                                    <div className={`font-bold text-sm ${
                                        solicitud.fecha_preaprobacion ? 'text-slate-200' : 
                                        (solicitud.estado_solicitud === 'rechazado' && !solicitud.fecha_preaprobacion) ? 'text-red-400' : 'text-slate-400'
                                    }`}>
                                        {(solicitud.estado_solicitud === 'rechazado' && !solicitud.fecha_preaprobacion) ? 'Rechazado por Supervisor' : 'Revisión Supervisor'}
                                    </div>
                                    {solicitud.fecha_preaprobacion && (
                                        <div className="text-[10px] font-mono text-slate-500">{format(new Date(solicitud.fecha_preaprobacion), "HH:mm", { locale: es })}</div>
                                    )}
                                </div>
                                {solicitud.fecha_preaprobacion ? (
                                    <div className="text-xs text-slate-400 leading-relaxed">
                                        Revisado el {format(new Date(solicitud.fecha_preaprobacion), "d MMM yyyy", { locale: es })} por <span className="font-medium text-slate-300">{solicitud.supervisor?.nombre_completo}</span>
                                    </div>
                                ) : (solicitud.estado_solicitud === 'rechazado' && !solicitud.fecha_preaprobacion && solicitud.fecha_rechazo) ? (
                                    <div className="text-xs text-red-300/80 leading-relaxed">
                                        Rechazado el {format(new Date(solicitud.fecha_rechazo), "d MMM yyyy", { locale: es })} por {solicitud.supervisor?.nombre_completo || solicitud.admin?.nombre_completo}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500 italic">En espera de revisión</div>
                                )}
                            </div>
                        </div>

                        {/* Paso 3: Aprobación Admin o Rechazo Final */}
                        {solicitud.estado_solicitud === 'rechazado' && solicitud.fecha_preaprobacion ? (
                            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 bg-red-500/20 text-red-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10">
                                    <XCircle className="w-4 h-4" />
                                </div>
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-red-500/20 bg-red-500/5 shadow-sm relative z-10">
                                    <div className="font-bold text-red-400 text-sm mb-1">Rechazado</div>
                                    <div className="text-xs text-red-300/80 leading-relaxed">
                                        Rechazado el {format(new Date(solicitud.fecha_rechazo || solicitud.updated_at), "d MMM yyyy, HH:mm", { locale: es })} por <span className="font-medium text-red-300">{solicitud.admin?.nombre_completo || solicitud.supervisor?.nombre_completo || 'Administrador'}</span>
                                    </div>
                                </div>
                            </div>
                        ) : solicitud.estado_solicitud === 'rechazado' && !solicitud.fecha_preaprobacion ? (
                            null // Si fue rechazado en etapa inicial, no pintamos aprobación final
                        ) : (
                            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 ${
                                    solicitud.fecha_aprobacion ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                                }`}>
                                    {solicitud.fecha_aprobacion ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <Clock className="w-4 h-4" />
                                    )}
                                </div>
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-800/60 bg-slate-950/50 shadow-sm relative z-10">
                                    <div className="flex items-center justify-between space-x-2 mb-1">
                                        <div className={`font-bold text-sm ${solicitud.fecha_aprobacion ? 'text-slate-200' : 'text-slate-400'}`}>
                                            Aprobación Final
                                        </div>
                                        {solicitud.fecha_aprobacion && (
                                            <div className="text-[10px] font-mono text-slate-500">{format(new Date(solicitud.fecha_aprobacion), "HH:mm", { locale: es })}</div>
                                        )}
                                    </div>
                                    {solicitud.fecha_aprobacion ? (
                                        <div className="text-xs text-slate-400 leading-relaxed">
                                            Aprobado el {format(new Date(solicitud.fecha_aprobacion), "d MMM yyyy", { locale: es })} por <span className="font-medium text-slate-300">{solicitud.admin?.nombre_completo}</span>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-slate-500 italic">En espera de resolución</div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                    </div>
                </CardContent>
            </Card>

            {/* Acciones según rol */}
            <SolicitudActions 
                solicitud={solicitud} 
                userRole={perfil?.rol || 'asesor'}
                userId={user?.id}
                cuentasAdmin={cuentasAdmin}
            />
        </div>
    )
}
