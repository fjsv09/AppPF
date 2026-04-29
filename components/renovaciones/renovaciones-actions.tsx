'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, XCircle, MessageSquare, Loader2, AlertTriangle, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CorrectionForm } from './correction-form'
import { formatMoney } from '@/utils/format'
import { EditarSolicitudModal } from './editar-solicitud-modal'

interface RenovacionesActionsProps {
    solicitud: any
    userRole: 'asesor' | 'supervisor' | 'admin'
    userId: string
    cuentasAdmin?: any[]
}

export function RenovacionesActions({ solicitud, userRole, userId, cuentasAdmin = [] }: RenovacionesActionsProps) {
    const router = useRouter()
    const [actionDialog, setActionDialog] = useState<'preprobar' | 'observar' | 'aprobar' | 'rechazar' | null>(null)
    const [showSuccess, setShowSuccess] = useState(false)
    const [wasNotified, setWasNotified] = useState(false)
    const [loading, setLoading] = useState(false)
    const [inputText, setInputText] = useState('')
    const [cuentaOrigenId, setCuentaOrigenId] = useState<string>('')
    const [prestamoNuevoId, setPrestamoNuevoId] = useState<string | null>(null)

    const handleAction = async () => {
        if (!actionDialog) return
        
        setLoading(true)
        try {
            const endpoint = `/api/renovaciones/${solicitud.id}/${actionDialog}`
            const body: any = {}
            
            if (actionDialog === 'observar') {
                body.observacion = inputText
            } else if (actionDialog === 'rechazar') {
                body.motivo = inputText
            } else if (actionDialog === 'preprobar') {
                body.observacion = inputText || null
                if (solicitud.requiere_excepcion) {
                    body.aprobar_excepcion = true
                }
            } else if (actionDialog === 'aprobar') {
                if (!cuentaOrigenId && cuentasAdmin && cuentasAdmin.length > 0) {
                    throw new Error('Debe seleccionar una cuenta para el desembolso.')
                }
                body.cuentaOrigenId = cuentaOrigenId
            }

            const response = await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.error || 'Error procesando acción')
            }

            toast.success(
                actionDialog === 'preprobar' ? 'Solicitud pre-aprobada' :
                actionDialog === 'observar' ? 'Observación enviada' :
                actionDialog === 'aprobar' ? 'Renovación aprobada' :
                'Solicitud rechazada'
            )
            
            if (actionDialog === 'aprobar') {
                if (result.prestamo_nuevo_id) {
                    setPrestamoNuevoId(result.prestamo_nuevo_id)
                }
                setShowSuccess(true)
            } else {
                setActionDialog(null)
                setInputText('')
                router.refresh()
            }
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSendWhatsApp = () => {
        const phone = solicitud.cliente?.telefono?.replace(/\D/g, '') || ''
        const monto = formatMoney(solicitud.monto_solicitado)
        const message = encodeURIComponent(`Hola ${solicitud.cliente?.nombres}, le saludamos de ProFinanzas. Le informamos que su renovación por un monto de S/ ${monto} ha sido APROBADA. ¡Felicidades!`)
        
        window.open(`https://wa.me/51${phone}?text=${message}`, '_blank')
        setWasNotified(true)
    }

    const closeAndRefresh = () => {
        setShowSuccess(false)
        setWasNotified(false)
        setActionDialog(null)
        setInputText('')
        router.refresh()
    }

    // Determinar qué acciones mostrar
    // SOLO supervisor puede pre-aprobar (no admin, para evitar confusión de flujo)
    const canPreapprove = userRole === 'supervisor' && 
                         solicitud.estado_solicitud === 'pendiente_supervision'
    // SOLO supervisor puede observar/devolver al asesor
    const canObserve = userRole === 'supervisor' && 
                       solicitud.estado_solicitud === 'pendiente_supervision'
    // Admin solo aprueba DESPUÉS de pre-aprobación
    const canApprove = userRole === 'admin' && solicitud.estado_solicitud === 'pre_aprobado'
    // Admin puede rechazar en cualquier momento (pendiente o pre-aprobado)
    // Admin y Supervisor pueden rechazar
    const canReject = (userRole === 'admin' && ['pendiente_supervision', 'pre_aprobado'].includes(solicitud.estado_solicitud)) ||
                      (userRole === 'supervisor' && solicitud.estado_solicitud === 'pendiente_supervision')
    const canCorrect = userRole === 'asesor' && 
                       solicitud.estado_solicitud === 'en_correccion' && 
                       solicitud.asesor_id === userId
    
    // Admin puede editar si está en pre_aprobado o pendiente_supervision
    const canEdit = userRole === 'admin' && 
                    ['pre_aprobado', 'pendiente_supervision'].includes(solicitud.estado_solicitud)

    if (!canPreapprove && !canObserve && !canApprove && !canReject && !canCorrect && !canEdit) {
        return null
    }

    return (
        <>
            <div className="flex flex-wrap gap-3 justify-center">
                {/* Botón Editar para Admin */}
                {canEdit && (
                    <EditarSolicitudModal solicitud={solicitud} />
                )}
                
                {canObserve && (
                    <Button 
                        variant="outline"
                        className="border-orange-600 text-orange-400 hover:bg-orange-900/30"
                        onClick={() => setActionDialog('observar')}
                    >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Enviar Observaciones
                    </Button>
                )}
                
                {canPreapprove && (
                    <Button 
                        className="bg-blue-600 hover:bg-blue-500 text-white"
                        onClick={() => setActionDialog('preprobar')}
                    >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Pre-aprobar
                    </Button>
                )}
                
                {canReject && (
                    <Button 
                        variant="outline"
                        className="border-red-600 text-red-400 hover:bg-red-900/30"
                        onClick={() => setActionDialog('rechazar')}
                    >
                        <XCircle className="h-4 w-4 mr-2" />
                        Rechazar
                    </Button>
                )}
                
                {canApprove && (
                    <Button 
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={() => setActionDialog('aprobar')}
                    >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Aprobar Renovación
                    </Button>
                )}

                {/* Acción Corregir para Asesor */}
                {userRole === 'asesor' && solicitud.estado_solicitud === 'en_correccion' && solicitud.asesor_id === userId && (
                     <div className="w-full">
                        <CorrectionForm solicitud={solicitud} />
                     </div>
                )}
            </div>

            {/* Diálogo de acción */}
            <Dialog 
                open={actionDialog !== null} 
                onOpenChange={(open) => {
                    if (!open) {
                        if (showSuccess && !wasNotified) return
                        setActionDialog(null)
                        setShowSuccess(false)
                        setWasNotified(false)
                    }
                }}
            >
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle>
                            {actionDialog === 'preprobar' && 'Pre-aprobar Solicitud'}
                            {actionDialog === 'observar' && 'Enviar Observaciones'}
                            {actionDialog === 'aprobar' && 'Aprobar Renovación'}
                            {actionDialog === 'rechazar' && 'Rechazar Solicitud'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            {solicitud.cliente?.nombres} - S/ {formatMoney(solicitud.monto_solicitado)}
                        </DialogDescription>
                    </DialogHeader>

                    {solicitud.requiere_excepcion && actionDialog === 'preprobar' && (
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-amber-400 font-medium text-sm">Esta solicitud requiere excepción</p>
                                <p className="text-slate-400 text-xs mt-0.5">
                                    Tipo: {solicitud.tipo_excepcion}. Al pre-aprobar, estarás autorizando la excepción.
                                </p>
                            </div>
                        </div>
                    )}

                    {(actionDialog === 'observar' || actionDialog === 'rechazar') && (
                        <div className="grid gap-2">
                            <Label>
                                {actionDialog === 'observar' ? 'Observaciones' : 'Motivo de rechazo'}
                            </Label>
                            <Textarea
                                value={inputText}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                                placeholder={
                                    actionDialog === 'observar' 
                                        ? 'Describe las correcciones necesarias...'
                                        : 'Explica el motivo del rechazo...'
                                }
                                className="bg-slate-950 border-slate-800 min-h-[100px]"
                            />
                        </div>
                    )}

                    {actionDialog === 'preprobar' && (
                        <div className="grid gap-2">
                            <Label>Observaciones (opcional)</Label>
                            <Textarea
                                value={inputText}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                                placeholder="Agregar comentarios para el admin..."
                                className="bg-slate-950 border-slate-800 min-h-[80px]"
                            />
                        </div>
                    )}

                    {actionDialog === 'aprobar' && !showSuccess && (
                        <div className="text-center py-4 space-y-4">
                            <div>
                                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                                <p className="text-slate-300">
                                    ¿Confirmas aprobar esta renovación?
                                </p>
                                <p className="text-slate-500 text-sm mt-1 mb-2">
                                    Se creará el nuevo préstamo y se cerrará el anterior.
                                </p>
                            </div>

                            {cuentasAdmin && cuentasAdmin.length > 0 ? (
                                <div className="space-y-2 p-3 bg-slate-950/50 border border-slate-800 rounded-lg text-left">
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
                                                        <span className="text-emerald-400 font-mono text-xs">S/ {formatMoney(cuenta.saldo)}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="bg-rose-900/20 border border-rose-500/30 rounded-lg p-3 flex flex-col items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                                    <p className="text-rose-400 text-sm font-medium text-center">
                                        No se encontraron cuentas financieras disponibles. Contacte a soporte o cree una cuenta primero.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {showSuccess && (
                        <div className="text-center py-6 space-y-6 animate-in zoom-in-95 duration-300">
                            <div className="space-y-2">
                                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                                </div>
                                <h3 className="text-2xl font-bold text-white">¡Renovación Aprobada!</h3>
                                <p className="text-slate-400 max-w-xs mx-auto">
                                    El proceso se completó correctamente y el nuevo préstamo ya está activo.
                                </p>
                            </div>

                            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 space-y-4">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Comunicación con el Cliente</p>
                                <Button 
                                    onClick={handleSendWhatsApp}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
                                >
                                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.565.928 3.178 1.416 4.856 1.417 5.341 0 9.69-4.348 9.693-9.691.002-2.59-1.01-5.025-2.847-6.865-1.838-1.837-4.271-2.847-6.863-2.848-5.341 0-9.69 4.349-9.692 9.691-.001 1.831.515 3.614 1.491 5.162l-.994 3.63 3.712-.974zm11.367-7.46c-.066-.11-.244-.176-.511-.309-.267-.133-1.583-.781-1.827-.87-.245-.089-.423-.133-.6.133-.177.266-.689.87-.845 1.047-.156.177-.311.199-.578.066-.267-.133-1.127-.416-2.146-1.326-.793-.707-1.329-1.58-1.485-1.847-.156-.266-.016-.411.117-.544.12-.119.267-.31.4-.466.133-.155.177-.266.267-.443.089-.178.044-.333-.022-.466-.067-.133-.6-1.446-.822-1.979-.217-.518-.434-.447-.6-.456-.153-.008-.328-.01-.502-.01-.174 0-.457.065-.696.327-.24.262-.915.894-.915 2.178 0 1.284.934 2.525 1.065 2.702.131.177 1.836 2.805 4.448 3.931.621.267 1.106.427 1.484.547.623.198 1.19.17 1.637.104.498-.074 1.583-.647 1.805-1.27.222-.623.222-1.157.156-1.27z" />
                                    </svg>
                                    Notificar por WhatsApp
                                </Button>


                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {!showSuccess ? (
                            <>
                                <Button 
                                    variant="outline" 
                                    onClick={() => setActionDialog(null)}
                                    disabled={loading}
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    onClick={handleAction}
                                    disabled={loading || ((actionDialog === 'observar' || actionDialog === 'rechazar') && !inputText.trim())}
                                    className={cn(
                                        actionDialog === 'rechazar' ? 'bg-red-600 hover:bg-red-500' :
                                        actionDialog === 'aprobar' ? 'bg-emerald-600 hover:bg-emerald-500' :
                                        'bg-blue-600 hover:bg-blue-500'
                                    )}
                                >
                                    {loading ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                                    ) : (
                                        <>
                                            {actionDialog === 'preprobar' && 'Pre-aprobar'}
                                            {actionDialog === 'observar' && 'Enviar Observaciones'}
                                            {actionDialog === 'aprobar' && 'Aprobar'}
                                            {actionDialog === 'rechazar' && 'Rechazar'}
                                        </>
                                    )}
                                </Button>
                            </>
                        ) : (
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
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
