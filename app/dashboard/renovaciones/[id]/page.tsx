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
import { ScoreIndicator, BehaviorSummary } from '@/components/ui/score-indicator'
import { 
    User, DollarSign, Calendar, AlertTriangle, 
    CheckCircle2, XCircle, Clock, MessageSquare 
} from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { RenovacionesActions } from '@/components/renovaciones/renovaciones-actions'

export const dynamic = 'force-dynamic'

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
        const { data: cuentas } = await supabaseAdmin
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo')
            .order('nombre')
        cuentasAdmin = cuentas || []
    }

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
                    </div>
                </div>

                {/* Score Card */}
                <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-white">Score Crediticio</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                            <ScoreIndicator score={solicitud.score_al_solicitar} size="lg" />
                            <div className="flex-1 w-full">
                                <BehaviorSummary data={solicitud.resumen_comportamiento} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

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
                                <span className="text-white font-bold">${formatMoney(solicitud.prestamo?.monto)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Interés</span>
                                <span className="text-white">{solicitud.prestamo?.interes}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Frecuencia</span>
                                <span className="text-white capitalize">{solicitud.prestamo?.frecuencia}</span>
                            </div>
                            <div className="flex justify-between">
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
                                <span className="text-white font-bold">${formatMoney(solicitud.monto_solicitado)}</span>
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
                                <span className="text-white">{formatDate(solicitud.fecha_inicio_propuesta)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Límites */}
                <Card className="bg-blue-900/20 border-blue-700/50">
                    <CardContent className="py-4">
                        <div className="flex flex-wrap justify-center gap-8 text-center">
                            <div>
                                <p className="text-blue-400 text-xs font-medium mb-1">Monto Mínimo</p>
                                <p className="text-white text-lg font-bold">${formatMoney(solicitud.monto_minimo_permitido)}</p>
                            </div>
                            <div>
                                <p className="text-blue-400 text-xs font-medium mb-1">Monto Máximo</p>
                                <p className="text-white text-lg font-bold">${formatMoney(solicitud.monto_maximo_permitido)}</p>
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
                        />
                    </div>
                )}
        </div>
    )
}
