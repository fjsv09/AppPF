'use client'

import { useState, useEffect } from "react"
import { MapPin, Save, X, Loader2, AlertCircle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateClientAction } from "@/actions/clientes"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface ClientEditSectorModalProps {
    cliente: any
    isOpen: boolean
    onClose: () => void
    onSuccess: (updatedClient: any) => void
}

export function ClientEditSectorModal({ cliente, isOpen, onClose, onSuccess }: ClientEditSectorModalProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sectores, setSectores] = useState<any[]>([])
    const [selectedSectorId, setSelectedSectorId] = useState<string>(cliente?.sector_id || "")

    useEffect(() => {
        if (cliente) {
            setSelectedSectorId(cliente.sector_id || "")
        }
    }, [cliente])

    useEffect(() => {
        async function loadSectores() {
            try {
                const response = await fetch('/api/sectores')
                if (response.ok) {
                    const data = await response.json()
                    setSectores(data)
                }
            } catch (err) {
                console.error("Error loading sectores:", err)
            }
        }
        if (isOpen) loadSectores()
    }, [isOpen])

    const handleSubmit = async () => {
        if (!selectedSectorId) {
            setError("Debe seleccionar un sector")
            return
        }

        setIsSubmitting(true)
        setError(null)
        try {
            const payload = {
                id: cliente.id,
                sector_id: selectedSectorId,
                // Conservamos el resto de campos enviando solo lo necesario si el action lo permite, 
                // pero updateClientAction parece requerir más o al menos actualizar campos específicos.
                // Basado en client-edit-modal.tsx, enviamos lo que queremos cambiar.
                nombres: cliente.nombres,
                dni: cliente.dni,
                telefono: cliente.telefono,
                direccion: cliente.direccion,
                giro_negocio: cliente.giro_negocio || cliente.ocupacion || "Negocio",
                fuentes_ingresos: cliente.fuentes_ingresos || "Ventas",
                ingresos_mensuales: cliente.ingresos_mensuales || 0,
                motivo_prestamo: cliente.motivo_prestamo || "Capital de trabajo",
            }
            
            const updated = await updateClientAction(payload)
            toast.success("Sector actualizado exitosamente")
            onSuccess({ ...cliente, ...payload, ...updated })
            router.refresh()
            onClose()
        } catch (err: any) {
            setError(err.message || "Error al actualizar el sector")
            toast.error("Error al actualizar el sector")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-white/5 bg-slate-900/50">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-purple-400" />
                        Editar Sector del Cliente
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs">
                        Cambie la zona o sector asignado a {cliente?.nombres}.
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
                        <label className="text-xs text-slate-400 ml-1 font-bold uppercase tracking-wider">Sector de Cobranza / Ruta</label>
                        <Select 
                            value={selectedSectorId}
                            onValueChange={setSelectedSectorId}
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800 h-12 text-slate-200">
                                <SelectValue placeholder="Seleccione un sector" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {sectores.map(s => (
                                    <SelectItem key={s.id} value={s.id} className="focus:bg-slate-800 focus:text-white">
                                        {s.nombre}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3">
                        <p className="text-[10px] text-purple-400/80 leading-relaxed italic">
                            * Cambiar el sector afectará el orden de las rutas de cobranza y la visibilidad para los asesores asignados a esta zona.
                        </p>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-slate-900/50 border-t border-white/5 gap-3">
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
                        className="bg-purple-600 hover:bg-purple-500 text-white min-w-[140px] shadow-lg shadow-purple-900/20"
                        disabled={isSubmitting || !selectedSectorId}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Actualizando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Guardar Sector
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
