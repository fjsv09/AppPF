'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/utils/format'

interface SolicitudData {
    id: string
    monto_solicitado: number
    interes: number
    cuotas: number
    modalidad: string
    fecha_inicio_propuesta: string
    estado_solicitud: string
}

interface EditarSolicitudModalProps {
    solicitud: SolicitudData
}

const CUOTAS_ESTANDAR: Record<string, number> = {
    diario: 24,
    semanal: 4,
    quincenal: 2,
    mensual: 1,
}

export function EditarSolicitudModal({ solicitud }: EditarSolicitudModalProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const [formData, setFormData] = useState(() => {
        // Ingeniería inversa: Calcular interés base a partir del final guardado
        const cuotasEstandar = CUOTAS_ESTANDAR[solicitud.modalidad] || 24
        const factor = solicitud.cuotas > 0 ? (solicitud.cuotas / cuotasEstandar) : 1
        // Si el factor es muy pequeño o 0, evitar división por cero.
        // Interés Base = Interés Final / Factor
        // Ejemplo: 25% final / (30/24) = 20% base
        const interesBase = factor > 0 ? (solicitud.interes / factor) : solicitud.interes

        return {
            monto_solicitado: solicitud.monto_solicitado,
            interes_base: Math.round(interesBase * 100) / 100, // Nuevo campo para el input
            cuotas: solicitud.cuotas,
            modalidad: solicitud.modalidad,
            fecha_inicio_propuesta: solicitud.fecha_inicio_propuesta,
            motivo_modificacion: ''
        }
    })

    const calcularSimulacion = () => {
        const monto = parseFloat(formData.monto_solicitado.toString()) || 0
        const cuotas = parseInt(formData.cuotas.toString()) || 0
        const interesBase = parseFloat(formData.interes_base?.toString() || '0')
        
        // Calcular Interés Final Proporcional
        const cuotasEstandar = CUOTAS_ESTANDAR[formData.modalidad] || 24
        const factor = cuotas > 0 ? (cuotas / cuotasEstandar) : 1
        const interesFinal = interesBase * factor

        const totalPagar = monto * (1 + interesFinal / 100)
        const valorCuota = cuotas > 0 ? totalPagar / cuotas : 0

        return { totalPagar, valorCuota, interesFinal }
    }

    const resultados = calcularSimulacion()

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        // Preparar payload con el interés FINAL calculado
        const payload = {
            monto_solicitado: formData.monto_solicitado,
            interes: resultados.interesFinal, // ENVIAMOS EL FINAL, NO EL BASE
            cuotas: formData.cuotas,
            modalidad: formData.modalidad,
            fecha_inicio_propuesta: formData.fecha_inicio_propuesta,
            motivo_modificacion: formData.motivo_modificacion
        }

        try {
            const response = await fetch(`/api/renovaciones/${solicitud.id}/editar`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            
            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar solicitud')
            }

            toast.success('Solicitud actualizada', {
                description: `Interés ajustado a ${resultados.interesFinal.toFixed(2)}% según duración`
            })
            setOpen(false)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al actualizar la solicitud')
        } finally {
            setLoading(false)
        }
    }

    // Solo mostrar si está en estado editable
    if (!['pre_aprobado', 'pendiente_supervision'].includes(solicitud.estado_solicitud)) {
        return null
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                    <Pencil className="mr-2 h-4 w-4" /> Editar Datos
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">Editar Solicitud de Renovación</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Modifica la Tasa Base. El interés final se calculará según la duración.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="monto_solicitado">Monto</Label>
                            <Input 
                                id="monto_solicitado" 
                                type="number" 
                                step="0.01" 
                                value={formData.monto_solicitado}
                                onChange={(e) => setFormData({...formData, monto_solicitado: parseFloat(e.target.value) || 0})}
                                className="bg-slate-950 border-slate-800"
                                required 
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="interes_base">Interés Base (%)</Label>
                            <Input 
                                id="interes_base" 
                                type="number" 
                                step="0.1" 
                                value={formData.interes_base}
                                onChange={(e) => setFormData({...formData, interes_base: parseFloat(e.target.value) || 0})}
                                className="bg-slate-950 border-slate-800"
                                required 
                            />
                            <p className="text-[10px] text-slate-500">Tasa mensual/estándar sugerida</p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="modalidad">Modalidad</Label>
                            <Select 
                                value={formData.modalidad}
                                onValueChange={(val) => setFormData({...formData, modalidad: val})}
                            >
                                <SelectTrigger className="bg-slate-950 border-slate-800">
                                    <SelectValue placeholder="Seleccionar modalidad" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                    <SelectItem value="diario">Diario</SelectItem>
                                    <SelectItem value="semanal">Semanal</SelectItem>
                                    <SelectItem value="quincenal">Quincenal</SelectItem>
                                    <SelectItem value="mensual">Mensual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="cuotas">Número de Cuotas</Label>
                            <Input 
                                id="cuotas" 
                                type="number" 
                                min="1"
                                value={formData.cuotas}
                                onChange={(e) => setFormData({...formData, cuotas: parseInt(e.target.value) || 0})}
                                className="bg-slate-950 border-slate-800"
                                required 
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="fecha_inicio">Fecha de Inicio</Label>
                        <Input 
                            id="fecha_inicio" 
                            type="date" 
                            value={formData.fecha_inicio_propuesta}
                            onChange={(e) => setFormData({...formData, fecha_inicio_propuesta: e.target.value})}
                            className="bg-slate-950 border-slate-800"
                            required 
                        />
                    </div>

                    {/* Simulador / Preview - igual que el del asesor */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Interés Final</p>
                                <p className="text-emerald-400 font-bold text-lg">{resultados.interesFinal.toFixed(2)}%</p>
                                {resultados.interesFinal !== formData.interes_base && (
                                    <p className="text-[9px] text-slate-500">(Base: {formData.interes_base}%)</p>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Total a Pagar</p>
                                <p className="text-white font-bold text-lg">${formatMoney(resultados.totalPagar)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Valor Cuota</p>
                                <p className="text-white font-bold text-lg">${formatMoney(resultados.valorCuota)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="motivo">Motivo de Modificación</Label>
                        <Textarea 
                            id="motivo" 
                            placeholder="Describa el motivo del cambio..."
                            value={formData.motivo_modificacion}
                            onChange={(e) => setFormData({...formData, motivo_modificacion: e.target.value})}
                            className="bg-slate-950 border-slate-800 min-h-[80px]"
                        />
                    </div>

                    <DialogFooter>
                        <Button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg"
                        >
                            {loading ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                            ) : (
                                <><Save className="mr-2 h-4 w-4" /> Guardar Cambios</>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
