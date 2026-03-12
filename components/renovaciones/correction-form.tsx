'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2, Send, Edit, DollarSign, Percent, Hash, X } from 'lucide-react'
import { formatMoney } from '@/utils/format'

// Cuotas estándar (misma lógica que en otros componentes)
const CUOTAS_ESTANDAR: Record<string, number> = {
    diario: 24,
    semanal: 4,
    quincenal: 2,
    mensual: 1,
}

export function CorrectionForm({ solicitud }: { solicitud: any }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    
    const [formData, setFormData] = useState({
        monto_solicitado: solicitud.monto_solicitado || '',
        interes_base: solicitud.interes || 20,
        cuotas: solicitud.cuotas || '',
        modalidad: solicitud.modalidad || 'diario',
        fecha_inicio_propuesta: solicitud.fecha_inicio_propuesta || new Date().toISOString().split('T')[0]
    })

    const calcularSimulacion = () => {
        const monto = parseFloat(formData.monto_solicitado.toString()) || 0
        const cuotas = parseInt(formData.cuotas.toString()) || 0
        const interesBase = parseFloat(formData.interes_base.toString()) || 20
        const cuotasEstandar = CUOTAS_ESTANDAR[formData.modalidad] || 24
        
        let interesFinal = interesBase
        if (cuotas > 0) {
           interesFinal = Math.round((cuotas / cuotasEstandar) * interesBase * 100) / 100
        }

        const totalPagar = monto * (1 + interesFinal / 100)
        const valorCuota = cuotas > 0 ? totalPagar / cuotas : 0

        return { interesFinal, totalPagar, valorCuota }
    }

    const handleCorrection = async () => {
        setLoading(true)
        try {
            const simulacion = calcularSimulacion()
            
            const payload = {
                ...formData,
                monto_solicitado: parseFloat(formData.monto_solicitado),
                cuotas: parseInt(formData.cuotas),
                interes: simulacion.interesFinal // Enviar el interés calculado final
            }

            const response = await fetch(`/api/renovaciones/${solicitud.id}/corregir`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.error || 'Error al corregir solicitud')
            }

            toast.success('Solicitud corregida y reenviada a supervisión')
            setShowForm(false)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const resultados = calcularSimulacion()

    if (!showForm) {
        return (
            <div className="bg-slate-900/50 border border-orange-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                     <p className="text-orange-400 font-semibold mb-1 flex items-center gap-2">
                        <Edit className="h-4 w-4" />
                        Solicitud en Corrección
                    </p>
                    <p className="text-slate-400 text-sm">
                        El supervisor ha devuelto esta solicitud. Debes corregir los datos y reenviarla.
                    </p>
                </div>
                <Button 
                    onClick={() => setShowForm(true)}
                    className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shrink-0"
                >
                    Corregir Datos
                </Button>
            </div>
        )
    }

    return (
        <div className="bg-slate-900/50 border border-orange-500/30 rounded-xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-lg font-semibold text-white">Editar Solicitud de Renovación</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} disabled={loading}>
                    <X className="h-4 w-4 text-slate-400" />
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor="monto">Nuevo Monto</Label>
                    <div className="relative">
                        <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                        <Input 
                            id="monto" 
                            type="number" 
                            className="pl-8 bg-slate-950 border-slate-700"
                            value={formData.monto_solicitado}
                            onChange={(e) => setFormData({...formData, monto_solicitado: e.target.value})}
                        />
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="interes">Interés Base (%)</Label>
                    <div className="relative">
                        <Percent className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                        <Input 
                            id="interes" 
                            type="number" 
                            step="0.1"
                            className="pl-8 bg-slate-950 border-slate-700"
                            value={formData.interes_base}
                            onChange={(e) => setFormData({...formData, interes_base: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                 <div className="grid gap-2">
                    <Label htmlFor="modalidad">Modalidad</Label>
                    <Select 
                        value={formData.modalidad}
                        onValueChange={(val) => setFormData({...formData, modalidad: val})}
                    >
                        <SelectTrigger className="bg-slate-950 border-slate-700">
                            <SelectValue />
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
                    <Label htmlFor="cuotas">Cuotas</Label>
                    <div className="relative">
                        <Hash className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                        <Input 
                            id="cuotas" 
                            type="number" 
                            className="pl-8 bg-slate-950 border-slate-700"
                            value={formData.cuotas}
                            onChange={(e) => setFormData({...formData, cuotas: e.target.value})}
                        />
                    </div>
                </div>
            </div>

             <div className="grid gap-2">
                <Label htmlFor="fecha">Fecha Inicio Propuesta</Label>
                <Input 
                    id="fecha" 
                    type="date"
                    className="bg-slate-950 border-slate-700" 
                    value={formData.fecha_inicio_propuesta}
                    onChange={(e) => setFormData({...formData, fecha_inicio_propuesta: e.target.value})}
                />
            </div>

            {/* Preview */}
            <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase">Interés Final</p>
                        <p className="text-emerald-400 font-bold">{resultados.interesFinal}%</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase">Total</p>
                        <p className="text-white font-bold">${formatMoney(resultados.totalPagar)}</p>
                    </div>
                     <div>
                        <p className="text-[10px] text-slate-500 uppercase">Cuota</p>
                        <p className="text-white font-bold">${formatMoney(resultados.valorCuota)}</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowForm(false)} disabled={loading}>
                    Cancelar
                </Button>
                <Button 
                    onClick={handleCorrection}
                    disabled={loading || !formData.monto_solicitado || !formData.cuotas}
                    className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Reenviar Solicitud
                </Button>
            </div>
        </div>
    )
}
