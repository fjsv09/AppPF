'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea'

interface RejectEvidenceButtonProps {
    tareaId: string;
}

export function RejectEvidenceButton({ tareaId }: RejectEvidenceButtonProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [motivo, setMotivo] = useState('')
    const router = useRouter()

    const handleReject = async () => {
        if (!motivo.trim()) {
            toast.error("Debes ingresar un motivo")
            return
        }

        try {
            setLoading(true)
            const response = await fetch(`/api/tareas/${tareaId}/rechazar`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ motivo })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Error al rechazar la evidencia')
            }

            toast.success("Evidencia rechazada y asesor notificado")
            setOpen(false)
            setMotivo('')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button 
                    variant="outline" 
                    size="icon"
                    className="h-8 w-8 text-rose-400 bg-rose-950/20 border-rose-900/50 hover:bg-rose-900/40 hover:text-rose-300 transition-all flex flex-shrink-0 ml-2"
                    title="Mandar a corregir"
                >
                    <XCircle className="w-4 h-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-rose-500" />
                        Rechazar Evidencia
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Se enviará una notificación al asesor para que corrija y vuelva a subir la evidencia fotográfica.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                        Motivo del rechazo <span className="text-rose-500">*</span>
                    </label>
                    <Textarea 
                        placeholder="Ej: La foto está borrosa, por favor tomarla de nuevo..."
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-slate-200 resize-none min-h-[100px] focus-visible:ring-rose-500/50"
                    />
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button 
                        variant="ghost" 
                        onClick={() => setOpen(false)}
                        className="text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleReject} 
                        disabled={loading || !motivo.trim()}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {loading ? 'Procesando...' : 'Confirmar Rechazo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
