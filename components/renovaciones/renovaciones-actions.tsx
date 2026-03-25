'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, XCircle, MessageSquare, Loader2, AlertTriangle } from 'lucide-react'
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
    const [loading, setLoading] = useState(false)
    const [inputText, setInputText] = useState('')
    const [cuentaOrigenId, setCuentaOrigenId] = useState<string>('')

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
                    throw new Error('Debe seleccionar una cuenta de origen (Renovaciones).')
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
            
            setActionDialog(null)
            setInputText('')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
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
                onOpenChange={(open) => !open && setActionDialog(null)}
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
                            {solicitud.cliente?.nombres} - ${formatMoney(solicitud.monto_solicitado)}
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

                    {actionDialog === 'aprobar' && (
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
                                        Seleccionar cuenta origen (Renovaciones): <span className="text-rose-500">*</span>
                                    </label>
                                    <Select value={cuentaOrigenId} onValueChange={setCuentaOrigenId}>
                                        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-slate-200">
                                            <SelectValue placeholder="Seleccione una cuenta" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                            {cuentasAdmin.map(cuenta => (
                                                <SelectItem key={cuenta.id} value={cuenta.id} className="focus:bg-slate-800 focus:text-white cursor-pointer">
                                                    <div className="flex justify-between items-center w-full min-w-[200px] gap-4">
                                                        <span>{cuenta.nombre}</span>
                                                        <span className="text-emerald-400 font-mono text-xs">${formatMoney(cuenta.saldo)}</span>
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

                    <DialogFooter>
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
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
