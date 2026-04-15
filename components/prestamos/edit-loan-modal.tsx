'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2, Pencil, AlertTriangle, Wallet, Calculator, Info } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { calcularInteresProporcional, CUOTAS_ESTANDAR } from '@/lib/financial-logic'
import { formatMoney } from '@/utils/format'

interface EditLoanModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prestamo: any
    onSuccess?: () => void
}

export function EditLoanModal({ open, onOpenChange, prestamo, onSuccess }: EditLoanModalProps) {
    const [loading, setLoading] = useState(false)
    const [fetchingCuentas, setFetchingCuentas] = useState(false)
    const [cuentas, setCuentas] = useState<any[]>([])
    const [formData, setFormData] = useState({
        monto: '',
        interes: '',
        fecha_inicio: '',
        frecuencia: '',
        cuotas: '',
        cuenta_id: ''
    })

    const supabase = createClient()

    useEffect(() => {
        if (open && prestamo) {
            const freq = (prestamo.frecuencia || 'diario') as keyof typeof CUOTAS_ESTANDAR
            const estandar = CUOTAS_ESTANDAR[freq] || 24
            const cuotas = prestamo.cuotas || 24
            const interesFinal = prestamo.interes || 20
            
            // Revertir para obtener el Interés Base para el UI
            const interesBase = cuotas > 0 ? (interesFinal * estandar) / cuotas : interesFinal
            
            setFormData({
                monto: prestamo.monto?.toString() || '',
                interes: (Math.round(interesBase * 10) / 10).toString(),
                fecha_inicio: prestamo.fecha_inicio || '',
                frecuencia: prestamo.frecuencia || '',
                cuotas: prestamo.cuotas?.toString() || '',
                cuenta_id: ''
            })
            fetchCuentas()
        }
    }, [open, prestamo])

    // Cálculo financiero en tiempo real (mismo que el simulador)
    const calculation = useMemo(() => {
        const montoVal = parseFloat(formData.monto) || 0
        const interesBase = parseFloat(formData.interes) || 0
        const cuotasVal = parseInt(formData.cuotas) || 1
        const frecuenciaVal = formData.frecuencia as keyof typeof CUOTAS_ESTANDAR
        
        const { interes: interesFinal } = calcularInteresProporcional(cuotasVal, frecuenciaVal, interesBase)
        const totalPagar = montoVal * (1 + interesFinal / 100)
        const cuotaMonto = cuotasVal > 0 ? totalPagar / cuotasVal : 0

        return { interesFinal, totalPagar, cuotaMonto }
    }, [formData.monto, formData.interes, formData.cuotas, formData.frecuencia])

    const fetchCuentas = async () => {
        setFetchingCuentas(true)
        try {
            const { data } = await supabase
                .from('cuentas_financieras')
                .select('*')
                .order('nombre')
            
            if (data) setCuentas(data)
        } catch (error) {
            console.error('Error fetching accounts', error)
        } finally {
            setFetchingCuentas(false)
        }
    }

    const handleSubmit = async () => {
        if (!formData.cuenta_id && parseFloat(formData.monto) !== prestamo.monto) {
            toast.error('Debe seleccionar una cuenta para procesar el cambio de capital')
            return
        }

        setLoading(true)
        try {
            const response = await fetch(`/api/prestamos/${prestamo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    interes: calculation.interesFinal // Enviamos el interés calculado proporcionalmente
                })
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar préstamo')
            }

            toast.success('Préstamo actualizado exitosamente')
            if (onSuccess) onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-amber-500">
                        <Pencil className="w-5 h-5" />
                        Editar Parámetros del Préstamo
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Solo se pueden editar préstamos sin cuotas pagadas. Cualquier cambio de capital afectará el saldo de la cuenta seleccionada.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="monto">Capital (Monto)</Label>
                            <Input
                                id="monto"
                                type="number"
                                value={formData.monto}
                                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                                className="bg-slate-950 border-slate-700"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="interes">Interés (%)</Label>
                            <Input
                                id="interes"
                                type="number"
                                value={formData.interes}
                                onChange={(e) => setFormData({ ...formData, interes: e.target.value })}
                                className="bg-slate-950 border-slate-700"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="frecuencia">Frecuencia</Label>
                            <Select 
                                value={formData.frecuencia} 
                                onValueChange={(val) => setFormData({ ...formData, frecuencia: val })}
                            >
                                <SelectTrigger className="bg-slate-950 border-slate-700">
                                    <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    <SelectItem value="diario">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span>Diario</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="semanal">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                                            <span>Semanal</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="quincenal">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                            <span>Quincenal</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="mensual">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                                            <span>Mensual</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="cuotas">N° Cuotas</Label>
                             <Input
                                 id="cuotas"
                                 type="number"
                                 value={formData.cuotas}
                                 onChange={(e) => setFormData({ ...formData, cuotas: e.target.value })}
                                 className="bg-slate-950 border-slate-700"
                             />
                         </div>
                     </div>
 
                     {/* VISTA PREVIA RECALCULO */}
                     <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-blue-500/20 relative overflow-hidden group">
                         <div className="absolute top-0 right-0 p-3 opacity-20">
                             <Calculator className="w-12 h-12 text-blue-400" />
                         </div>
                         
                         <div className="flex justify-between items-end mb-4 relative z-10">
                             <div>
                                 <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1">Recálculo Proyectado</h4>
                                 <p className="text-[9px] text-slate-500 font-medium">Valores calculados al instante</p>
                             </div>
                             <div className="text-right">
                                 <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-1">Cuota Nueva</p>
                                 <p className="text-2xl font-black text-white tabular-nums">${formatMoney(calculation.cuotaMonto)}</p>
                             </div>
                         </div>
 
                         <div className="grid grid-cols-2 gap-3 relative z-10">
                             <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/50">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Interés Final</p>
                                 <p className="text-sm font-bold text-blue-400">{calculation.interesFinal}%</p>
                             </div>
                             <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/50">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Total Final</p>
                                 <p className="text-sm font-bold text-white">${formatMoney(calculation.totalPagar)}</p>
                             </div>
                         </div>
                     </div>

                    <div className="space-y-2">
                        <Label htmlFor="fecha_inicio">Fecha de Inicio</Label>
                        <Input
                            id="fecha_inicio"
                            type="date"
                            value={formData.fecha_inicio}
                            onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                            className="bg-slate-950 border-slate-700"
                        />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800">
                        <Label className="flex items-center gap-2 text-amber-500 font-bold">
                            <Wallet className="w-4 h-4" />
                            Cuenta para ajuste de capital
                        </Label>
                        <Select 
                            value={formData.cuenta_id} 
                            onValueChange={(val) => setFormData({ ...formData, cuenta_id: val })}
                        >
                            <SelectTrigger className="bg-slate-950 border-slate-700">
                                <SelectValue placeholder={fetchingCuentas ? "Cargando..." : "Seleccionar cuenta..."} />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                {cuentas.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.nombre} (S/ {parseFloat(c.saldo).toFixed(2)})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-500 italic">
                            * Obligatorio si el Capital cambia.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={loading}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
