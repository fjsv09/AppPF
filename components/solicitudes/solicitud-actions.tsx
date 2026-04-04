'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle, MessageSquare, AlertTriangle, Send, Edit, DollarSign, Percent, Hash } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SolicitudActionsProps {
    solicitud: any
    userRole: string
    userId?: string
    cuentasAdmin?: any[]
}

export function SolicitudActions({ solicitud, userRole, userId, cuentasAdmin = [] }: SolicitudActionsProps) {
    const [loading, setLoading] = useState<string | null>(null)
    const [showObservacion, setShowObservacion] = useState(false)
    const [showRechazo, setShowRechazo] = useState(false)
    const [observacion, setObservacion] = useState('')
    const [motivoRechazo, setMotivoRechazo] = useState('')
    const [cuentaOrigenId, setCuentaOrigenId] = useState<string>('')
    
    const router = useRouter()

    const handleAction = async (action: string, body: any = {}) => {
        setLoading(action)
        try {
            if (action === 'aprobar') {
                if (!cuentaOrigenId && cuentasAdmin && cuentasAdmin.length > 0) {
                    throw new Error('Debe seleccionar una cuenta de origen para el desembolso.')
                }
                body.cuentaOrigenId = cuentaOrigenId
            }

            const response = await fetch(`/api/solicitudes/${solicitud.id}/${action}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || `Error al ${action}`)
            }

            toast.success(
                action === 'preprobar' ? 'Solicitud pre-aprobada' :
                action === 'aprobar' ? 'Solicitud aprobada - Préstamo creado' :
                action === 'rechazar' ? 'Solicitud rechazada' :
                action === 'observar' ? 'Observación enviada' : 'Acción completada'
            )

            router.refresh()
            setShowObservacion(false)
            setShowRechazo(false)

        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setLoading(null)
        }
    }

    // Si ya está aprobada o rechazada, no mostrar acciones
    if (['aprobado', 'rechazado'].includes(solicitud.estado_solicitud)) {
        return null
    }

    // Acciones para Asesor - Corregir solicitud observada
    if (userRole === 'asesor' && solicitud.estado_solicitud === 'en_correccion' && solicitud.asesor_id === userId) {
        return (
            <div className="space-y-4 p-4 rounded-xl bg-slate-900/50 border border-orange-500/30">
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                        <Edit className="w-6 h-6 text-orange-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-bold text-orange-400 mb-1">Solicitud Observada</h3>
                        <p className="text-sm text-slate-300 mb-4">
                            El supervisor ha devuelto esta solicitud con observaciones. 
                            Puedes editar todos los datos (montos, cliente, documentos) y volver a enviarla.
                        </p>
                        <Button
                            onClick={() => router.push(`/dashboard/solicitudes/nueva?mode=edit&id=${solicitud.id}`)}
                            className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-medium shadow-lg shadow-orange-500/20"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar Solicitud Completa
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    // Acciones para Supervisor
    if (userRole === 'supervisor' && solicitud.estado_solicitud === 'pendiente_supervision') {
        return (
            <div className="space-y-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <p className="text-sm font-bold text-slate-400 uppercase">Acciones de Supervisor</p>
                
                {showObservacion ? (
                    <div className="space-y-3">
                        <textarea
                            value={observacion}
                            onChange={(e) => setObservacion(e.target.value)}
                            placeholder="Escriba la observación para el asesor..."
                            className="w-full p-3 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                            rows={3}
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={() => handleAction('observar', { observacion })}
                                disabled={!observacion || loading === 'observar'}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                {loading === 'observar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                                Enviar Observación
                            </Button>
                            <Button variant="ghost" onClick={() => setShowObservacion(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                ) : showRechazo ? (
                    <div className="space-y-3">
                        <textarea
                            value={motivoRechazo}
                            onChange={(e) => setMotivoRechazo(e.target.value)}
                            placeholder="Motivo del rechazo..."
                            className="w-full p-3 rounded-lg bg-slate-950 border border-red-700/50 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                            rows={3}
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={() => handleAction('rechazar', { motivo: motivoRechazo })}
                                disabled={!motivoRechazo || loading === 'rechazar'}
                                variant="destructive"
                            >
                                {loading === 'rechazar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                                Confirmar Rechazo
                            </Button>
                            <Button variant="ghost" onClick={() => setShowRechazo(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={() => handleAction('preprobar')}
                            disabled={loading === 'preprobar'}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            {loading === 'preprobar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Pre-Aprobar
                        </Button>
                        <Button
                            onClick={() => setShowObservacion(true)}
                            variant="outline"
                            className="border-orange-500/50 text-orange-400 hover:bg-orange-950"
                        >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Observar
                        </Button>
                        <Button
                            onClick={() => setShowRechazo(true)}
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-950"
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Rechazar
                        </Button>
                    </div>
                )}
            </div>
        )
    }

    // Acciones para Admin
    if (userRole === 'admin' && solicitud.estado_solicitud === 'pre_aprobado') {
        return (
            <div className="space-y-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <p className="text-sm font-bold text-slate-400 uppercase">Aprobación Final (Admin)</p>
                
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-blue-400">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        Al aprobar, se creará automáticamente el préstamo y el cronograma de pagos.
                    </p>
                </div>

                {cuentasAdmin && cuentasAdmin.length > 0 && !showRechazo && (
                    <div className="space-y-2 p-3 bg-slate-950/50 border border-slate-800 rounded-lg">
                        <label className="text-xs font-semibold text-slate-400 uppercase">
                            Seleccionar cuenta de desembolso (Salida de dinero): <span className="text-rose-500">*</span>
                        </label>
                        <Select value={cuentaOrigenId} onValueChange={setCuentaOrigenId} required>
                            <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-slate-200">
                                <SelectValue placeholder="Seleccione una cuenta" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                {cuentasAdmin.map(cuenta => (
                                    <SelectItem key={cuenta.id} value={cuenta.id} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                                        <div className="flex justify-between items-center w-full min-w-[200px] gap-4">
                                            <span>{cuenta.nombre}</span>
                                            <span className="text-emerald-400 font-mono text-xs">${cuenta.saldo}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {showObservacion ? (
                    <div className="space-y-3">
                        <textarea
                            value={observacion}
                            onChange={(e) => setObservacion(e.target.value)}
                            placeholder="Escriba la observación para el asesor..."
                            className="w-full p-3 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                            rows={3}
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={() => handleAction('observar', { observacion })}
                                disabled={!observacion || loading === 'observar'}
                                className="bg-orange-600 hover:bg-orange-700 font-bold"
                            >
                                {loading === 'observar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                                Enviar a Corrección (Asesor)
                            </Button>
                            <Button variant="ghost" onClick={() => setShowObservacion(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                ) : showRechazo ? (
                    <div className="space-y-3">
                        <textarea
                            value={motivoRechazo}
                            onChange={(e) => setMotivoRechazo(e.target.value)}
                            placeholder="Motivo del rechazo..."
                            className="w-full p-3 rounded-lg bg-slate-950 border border-red-700/50 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                            rows={3}
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={() => handleAction('rechazar', { motivo: motivoRechazo })}
                                disabled={!motivoRechazo || loading === 'rechazar'}
                                variant="destructive"
                                className="font-bold"
                            >
                                {loading === 'rechazar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                                Confirmar Rechazo
                            </Button>
                            <Button variant="ghost" onClick={() => setShowRechazo(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={() => handleAction('aprobar')}
                            disabled={loading === 'aprobar'}
                            className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 font-bold"
                        >
                            {loading === 'aprobar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Aprobar y Crear Préstamo
                        </Button>
                        <Button
                            onClick={() => setShowObservacion(true)}
                            variant="outline"
                            className="border-orange-500/50 text-orange-400 hover:bg-orange-950 font-bold"
                        >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Observar / Devolver
                        </Button>
                        <Button
                            onClick={() => setShowRechazo(true)}
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-950 font-bold"
                        >
                            <XCircle className="w-4 h-4 mr-2" />
                            Rechazar
                        </Button>
                    </div>
                )}
            </div>
        )
    }

    return null
}

