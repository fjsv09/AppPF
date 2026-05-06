'use client'

import { useState } from "react"
import { MapIcon, Save, X, Loader2, AlertCircle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { GpsInput } from "@/components/wizard/gps-input"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface ClientAddGpsModalProps {
    cliente: any
    isOpen: boolean
    onClose: () => void
    onSuccess: (clienteId: string, newGps: string) => void
}

export function ClientAddGpsModal({ cliente, isOpen, onClose, onSuccess }: ClientAddGpsModalProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [gpsCoords, setGpsCoords] = useState<string>("")

    const handleSubmit = async () => {
        if (!gpsCoords) {
            setError("Debe seleccionar una ubicación GPS")
            return
        }

        setIsSubmitting(true)
        setError(null)
        try {
            const response = await fetch('/api/clientes/gps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cliente_id: cliente.id,
                    gps_coordenadas: gpsCoords
                })
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Error al guardar las coordenadas')
            }

            toast.success("Ubicación guardada exitosamente")
            onSuccess(cliente.id, gpsCoords)
            router.refresh()
            onClose()
        } catch (err: any) {
            setError(err.message || "Error al actualizar el GPS")
            toast.error("Error al guardar la ubicación")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-white/5 bg-slate-900/50">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <MapIcon className="w-5 h-5 text-blue-400" />
                        Agregar Ubicación GPS
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs">
                        Registre las coordenadas del domicilio o negocio de <strong className="text-slate-200">{cliente?.nombres}</strong>. 
                        Este cliente es migrado y aún no cuenta con ubicación registrada.
                    </DialogDescription>
                </DialogHeader>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1 font-bold uppercase tracking-wider flex items-center gap-2">
                            <MapIcon className="w-3 h-3 text-emerald-400" /> Coordenadas Actuales
                        </label>
                        <GpsInput value={gpsCoords} onChange={setGpsCoords} disabled={isSubmitting} />
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 mt-4">
                        <p className="text-[10px] text-blue-400/80 leading-relaxed italic">
                            * Al guardar, los administradores serán notificados de este registro para mantener el control sobre la ubicación de la cartera.
                        </p>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-slate-900/50 border-t border-white/5 gap-3 flex flex-row justify-end">
                    <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        className="bg-blue-600 hover:bg-blue-500 text-white min-w-[140px] shadow-lg shadow-blue-900/20"
                        disabled={isSubmitting || !gpsCoords}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Confirmar GPS
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
