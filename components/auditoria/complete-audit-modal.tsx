import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Phone, CheckCircle2, ShieldCheck, AlertTriangle, Loader2, MessageSquare } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface CompleteAuditModalProps {
    tareaId: string
    clienteNombre: string
    clienteTelefono?: string
    onSuccess?: () => void
}

export function CompleteAuditModal({ tareaId, clienteNombre, clienteTelefono, onSuccess }: CompleteAuditModalProps) {
    const [open, setOpen] = useState(false)
    const [resultado, setResultado] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const router = useRouter()

    const handleComplete = async (puntuacion: 'ok' | 'alerta') => {
        if (!resultado.trim()) {
            toast.error('Por favor registre el resultado de la llamada')
            return
        }
        
        setSubmitting(true)
        try {
            // Guardamos el resultado en evidencia_url como un string informativo por ahora si no hay columnas
            // Si el sistema soporta auditoria, usará el campo adecuado en el futuro.
            const response = await fetch(`/api/tareas/${tareaId}/completar`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    evidencia_url: `[AUDITORÍA ${puntuacion.toUpperCase()}] ${resultado}`,
                    puntuacion_auditoria: puntuacion === 'ok' ? 100 : 0, 
                    resultado_auditoria: resultado
                })
            })

            if (!response.ok) throw new Error('Error al guardar auditoría')

            toast.success(`Auditoría guardada como ${puntuacion.toUpperCase()}`)
            setOpen(false)
            if (onSuccess) onSuccess()
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <Button 
                onClick={() => setOpen(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 text-[10px] h-7 px-3 md:text-xs font-bold"
                size="sm"
            >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                Realizar Auditoria
            </Button>

            <Dialog open={open} onOpenChange={(val) => !val && !submitting && setOpen(false)}>
                <DialogContent className="bg-[#0b1121] border-slate-800/60 shadow-2xl sm:max-w-[450px]">
                    <DialogHeader className="space-y-3">
                        <DialogTitle className="text-xl text-white font-bold flex items-center gap-2">
                            <ShieldCheck className="w-6 h-6 text-emerald-500" />
                            Auditoría de Pago
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Estás auditando el préstamo de <strong className="text-white">{clienteNombre}</strong>.
                            Debes contactar al cliente para verificar el cobro informado por el asesor.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        {clienteTelefono && (
                            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                                <div className="flex items-center gap-3">
                                    <Phone className="w-5 h-5 text-emerald-400" />
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Teléfono Cliente</p>
                                        <p className="text-white font-mono">{clienteTelefono}</p>
                                    </div>
                                </div>
                                <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 px-4"
                                    onClick={() => window.location.href = `tel:${clienteTelefono}`}
                                >
                                    Llamar
                                </Button>
                            </div>
                        )}

                        <div className="space-y-2">
                             <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <MessageSquare className="w-3.5 h-3.5" />
                                Resultado de la llamada
                             </label>
                             <Textarea 
                                placeholder="Ej: El cliente confirma que pagó el monto completo y el asesor le dio recibo..."
                                value={resultado}
                                onChange={(e) => setResultado(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-slate-300 min-h-[120px] focus:ring-emerald-500/50"
                             />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button 
                            variant="destructive" 
                            disabled={submitting}
                            className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 gap-2"
                            onClick={() => handleComplete('alerta')}
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Reportar Alerta
                        </Button>
                        <Button 
                            disabled={submitting}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
                            onClick={() => handleComplete('ok')}
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Confirmar OK
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
