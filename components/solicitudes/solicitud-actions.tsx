'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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
    const [showSuccess, setShowSuccess] = useState(false)
    const [wasNotified, setWasNotified] = useState(false)
    const [observacion, setObservacion] = useState('')
    const [motivoRechazo, setMotivoRechazo] = useState('')
    const [cuentaOrigenId, setCuentaOrigenId] = useState<string>('')
    const [prestamoId, setPrestamoId] = useState<string | null>(null)
    
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

            if (action === 'aprobar') {
                if (result.prestamo?.id) {
                    setPrestamoId(result.prestamo.id)
                }
                setShowSuccess(true)
            } else {
                toast.success(
                    action === 'preprobar' ? 'Solicitud pre-aprobada' :
                    action === 'rechazar' ? 'Solicitud rechazada' :
                    action === 'observar' ? 'Observación enviada' : 'Acción completada'
                )
                router.refresh()
                setShowObservacion(false)
                setShowRechazo(false)
            }

        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setLoading(null)
        }
    }

    const handleSendWhatsApp = () => {
        const phone = (solicitud.cliente?.telefono || solicitud.prospecto_telefono)?.replace(/\D/g, '') || ''
        const monto = solicitud.monto_solicitado.toLocaleString('en-US')
        const clienteNombre = solicitud.cliente?.nombres || solicitud.prospecto_nombres
        const message = encodeURIComponent(`Hola ${clienteNombre}, le saludamos de ProFinanzas. Le informamos que su solicitud de préstamo por un monto de S/ ${monto} ha sido APROBADA y desembolsada. ¡Felicidades!`)
        
        window.open(`https://wa.me/51${phone}?text=${message}`, '_blank')
        setWasNotified(true)
    }

    const closeAndRefresh = () => {
        setShowSuccess(false)
        setWasNotified(false)
        router.refresh()
    }

    // Si ya está aprobada o rechazada, no mostrar acciones (a menos que estemos en éxito)
    if (['aprobado', 'rechazado'].includes(solicitud.estado_solicitud) && !showSuccess) {
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
            <>
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
                                                <span className="text-emerald-400 font-mono text-xs">S/ {cuenta.saldo}</span>
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

                <Dialog 
                    open={showSuccess} 
                    onOpenChange={(open) => {
                        if (!open) {
                            if (showSuccess && !wasNotified) return
                            setShowSuccess(false)
                            setWasNotified(false)
                        }
                    }}
                >
                    <DialogContent 
                        className={cn(
                            "bg-slate-900 border-slate-800 text-white max-w-md",
                            (showSuccess && !wasNotified) && "[&>button:last-child]:hidden"
                        )}
                        onInteractOutside={(e) => {
                            if (showSuccess && !wasNotified) e.preventDefault()
                        }}
                        onEscapeKeyDown={(e) => {
                            if (showSuccess && !wasNotified) e.preventDefault()
                        }}
                    >
                        <DialogHeader>
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                <CheckCircle className="h-10 w-10 text-emerald-500" />
                            </div>
                            <DialogTitle className="text-2xl font-black text-center uppercase tracking-tighter">¡Desembolso Exitoso!</DialogTitle>
                            <DialogDescription className="text-slate-400 text-center">
                                La solicitud de <span className="text-white font-bold">{solicitud.cliente?.nombres || solicitud.prospecto_nombres}</span> ha sido aprobada y el préstamo ha sido creado.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4 space-y-4">
                            <Button 
                                onClick={handleSendWhatsApp}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-12 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all group"
                            >
                                <svg className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.565.928 3.178 1.416 4.856 1.417 5.341 0 9.69-4.348 9.693-9.691.002-2.59-1.01-5.025-2.847-6.865-1.838-1.837-4.271-2.847-6.863-2.848-5.341 0-9.69 4.349-9.692 9.691-.001 1.831.515 3.614 1.491 5.162l-.994 3.63 3.712-.974zm11.367-7.46c-.066-.11-.244-.176-.511-.309-.267-.133-1.583-.781-1.827-.87-.245-.089-.423-.133-.6.133-.177.266-.689.87-.845 1.047-.156.177-.311.199-.578.066-.267-.133-1.127-.416-2.146-1.326-.793-.707-1.329-1.58-1.485-1.847-.156-.266-.016-.411.117-.544.12-.119.267-.31.4-.466.133-.155.177-.266.267-.443.089-.178.044-.333-.022-.466-.067-.133-.6-1.446-.822-1.979-.217-.518-.434-.447-.6-.456-.153-.008-.328-.01-.502-.01-.174 0-.457.065-.696.327-.24.262-.915.894-.915 2.178 0 1.284.934 2.525 1.065 2.702.131.177 1.836 2.805 4.448 3.931.621.267 1.106.427 1.484.547.623.198 1.19.17 1.637.104.498-.074 1.583-.647 1.805-1.27.222-.623.222-1.157.156-1.27z" />
                                </svg>
                                Notificar por WhatsApp
                            </Button>
                            
                            {prestamoId && (
                                <Button 
                                    onClick={() => router.push(`/dashboard/prestamos/${prestamoId}`)}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-10 rounded-xl flex items-center justify-center gap-2 mb-2"
                                >
                                    <DollarSign className="w-4 h-4" />
                                    Ir al Préstamo Aprobado
                                </Button>
                            )}

                            <Button 
                                onClick={closeAndRefresh}
                                disabled={!wasNotified}
                                className={cn(
                                    "w-full font-bold h-10 rounded-xl transition-all",
                                    wasNotified 
                                        ? "bg-slate-800 hover:bg-slate-700 text-white" 
                                        : "bg-slate-800/50 text-slate-500 cursor-not-allowed"
                                )}
                            >
                                {wasNotified ? 'Finalizar y Continuar' : 'Debe notificar para finalizar'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    return null
}
