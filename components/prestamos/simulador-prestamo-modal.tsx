'use client'

import { useState, useMemo } from 'react'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { 
    Calculator,
    Calendar, 
    Hash, 
    Percent, 
    ArrowRight,
    X,
    AlertTriangle
} from 'lucide-react'
import { 
    calcularFechasProyectadas, 
    calcularInteresProporcional 
} from '@/lib/financial-logic'
import { formatDate } from '@/utils/format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SimuladorPrestamoModalProps {
    isOpen: boolean
    onClose: () => void
}

export function SimuladorPrestamoModal({ isOpen, onClose }: SimuladorPrestamoModalProps) {
    const [formData, setFormData] = useState({
        monto: '1000',
        interes_base: '20',
        modalidad: 'diario' as 'diario' | 'semanal' | 'quincenal' | 'mensual',
        cuotas: '24',
        fecha_inicio: new Date().toISOString().split('T')[0]
    })

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // Cálculos financieros reusados
    const calcInteres = useMemo(() => {
        return calcularInteresProporcional(
            parseInt(formData.cuotas) || 0,
            formData.modalidad,
            parseFloat(formData.interes_base) || 20
        )
    }, [formData.cuotas, formData.modalidad, formData.interes_base])

    const calcFechas = useMemo(() => {
        return calcularFechasProyectadas(
            formData.fecha_inicio,
            parseInt(formData.cuotas) || 0,
            formData.modalidad,
            new Set() // Sin feriados para simulación rápida
        )
    }, [formData.fecha_inicio, formData.cuotas, formData.modalidad])

    const monto = parseFloat(formData.monto) || 0
    const totalPagar = monto * (1 + (calcInteres.interes / 100))
    const cuotaMonto = (parseInt(formData.cuotas) || 1) > 0 ? totalPagar / (parseInt(formData.cuotas) || 1) : 0

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-[#0b121d] border-slate-800 text-white p-0 overflow-hidden shadow-2xl rounded-2xl md:rounded-3xl max-h-[90vh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 shrink-0" />
                
                <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                    <DialogHeader className="mb-6 space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                <Calculator className="w-5 h-5 text-blue-400" />
                            </div>
                            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                                Simulador Ágil
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-slate-500 text-[10px] md:text-xs font-medium italic pl-10">
                            Proyecta condiciones financieras al instante sin afectar datos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        {/* PARÁMETROS */}
                        <div className="grid grid-cols-1 gap-4">
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Monto a Simular</label>
                                <div className="relative w-full">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 font-bold text-lg">$</div>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={formData.monto}
                                        onChange={(e) => updateField('monto', e.target.value)}
                                        className="w-full pl-10 !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 font-bold text-lg text-white rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 outline-none transition-all text-right pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                             <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center block">Tasa (%)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={formData.interes_base}
                                        onChange={(e) => updateField('interes_base', e.target.value)}
                                        className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white text-center font-bold text-base rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500/30" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5 w-full text-center">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center block">Frecuencia</label>
                                <Select value={formData.modalidad} onValueChange={(v) => updateField('modalidad', v as any)} key="sim-frecuencia">
                                    <SelectTrigger className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white rounded-xl text-[10px] font-bold uppercase text-center focus:ring-blue-500/20 focus:border-blue-500/30 transition-all flex items-center justify-center">
                                        <SelectValue />
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
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center block">N° Cuotas</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={formData.cuotas}
                                        onChange={(e) => updateField('cuotas', e.target.value)}
                                        className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white text-center font-bold text-base rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <Hash className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500/30" />
                                </div>
                            </div>
                        </div>

                        {/* Alerta si interés es ajustado */}
                        {calcInteres.esAjustado && (parseInt(formData.cuotas) || 0) > 0 && (
                            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 animate-in fade-in zoom-in duration-300">
                                <p className="text-[10px] text-blue-400 flex items-center gap-2 font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>
                                        Interés ajustado: {formData.cuotas} cuotas / {calcInteres.cuotasEstandar} base × {formData.interes_base}% = <strong className="text-white">{calcInteres.interes}%</strong>
                                    </span>
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Fecha de inicio proyectada</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500/30" />
                                <input
                                    type="date"
                                    value={formData.fecha_inicio}
                                    onChange={(e) => updateField('fecha_inicio', e.target.value)}
                                    className="w-full pl-10 !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 outline-none font-bold text-sm transition-all"
                                    style={{ colorScheme: 'dark' }}
                                />
                            </div>
                        </div>

                        {/* RESULTADOS */}
                        <div className="p-5 bg-blue-500/5 border border-blue-500/10 rounded-2xl relative overflow-hidden group shadow-xl">
                            <div className="flex justify-between items-center gap-4 mb-4">
                                    <div>
                                    <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-0.5">Simulación</h4>
                                    <p className="text-[8px] text-slate-500 font-medium">Valores calculados al instante</p>
                                    </div>
                                    <div className="text-right bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/10">
                                    <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">Cuota Proyectada</p>
                                    <p className="text-xl font-black text-white tabular-nums">${cuotaMonto.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                    </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                                    <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Interés Bruto</p>
                                    <p className="text-xs font-bold text-blue-400 font-mono">{calcInteres.interes}%</p>
                                </div>
                                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                                    <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Total Final</p>
                                    <p className="text-xs font-bold text-white font-mono">${totalPagar.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                </div>
                                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                                    <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Primer Pago</p>
                                    <p className="text-xs font-bold text-blue-500 font-mono">{formatDate(calcFechas.fechaInicio)}</p>
                                </div>
                                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                                    <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Fin de Préstamo</p>
                                    <p className="text-xs font-bold text-blue-600 font-mono">{formatDate(calcFechas.fechaFin)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="bg-slate-900/30 p-4 border-t border-slate-800/50 shrink-0">
                    <Button 
                        variant="ghost" 
                        onClick={onClose} 
                        className="w-full text-slate-500 hover:text-white hover:bg-slate-800 uppercase font-bold text-[10px] tracking-widest h-10 rounded-xl transition-all"
                    >
                        Cerrar Simulador
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
