'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Wallet, AlertTriangle, Loader2, CheckCircle2, Banknote, HelpCircle } from 'lucide-react'

interface PagoModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    nomina: any
    trabajador: { 
        id: string
        nombre_completo: string
        frecuencia_pago?: string 
    }
    onSuccess: () => void
}

export function PagoModal({ open, onOpenChange, nomina, trabajador, onSuccess }: PagoModalProps) {
    const [cuentas, setCuentas] = useState<any[]>([])
    const [selectedCuenta, setSelectedCuenta] = useState<string>('')
    const [incluirBonos, setIncluirBonos] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingCuentas, setLoadingCuentas] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        if (open) {
            fetchCuentas()
            setSelectedCuenta('')
            setIncluirBonos(false)
        }
    }, [open])

    async function fetchCuentas() {
        setLoadingCuentas(true)
        const { data } = await supabase
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo')
            .order('nombre')
        setCuentas(data || [])
        setLoadingCuentas(false)
    }

    const frecuencia = trabajador.frecuencia_pago || 'mensual'
    const divisor = frecuencia === 'semanal' ? 4 : frecuencia === 'quincenal' ? 2 : 1
    const nroPago = (nomina?.pagos_completados || 0) + 1
    const maxPagos = divisor
    
    // Cálculos
    const sueldoBasePeriodo = (nomina?.sueldo_base || 0) / divisor
    const bonos = (nroPago === maxPagos && incluirBonos) ? (nomina?.bonos || 0) : 0
    const descuentos = nomina?.descuentos || 0
    const adelantosPendientes = nomina?.adelantos || 0
    
    // Deducción automática de adelantos
    const montoPrevioNeto = sueldoBasePeriodo + bonos - descuentos
    const deduccionAdelanto = Math.min(montoPrevioNeto > 0 ? montoPrevioNeto : 0, adelantosPendientes)
    const montoFinalPagar = Math.max(0, montoPrevioNeto - deduccionAdelanto)

    const cuentaSeleccionada = cuentas.find(c => c.id === selectedCuenta)
    const saldoSuficiente = montoFinalPagar <= 0 || (cuentaSeleccionada ? parseFloat(cuentaSeleccionada.saldo) >= montoFinalPagar : false)

    // Función para obtener fecha de abono estimada (último día hábil del mes)
    const getFechaAbonoEstimada = () => {
        if (!nomina) return ''
        const today = new Date()
        let lastDay = new Date(nomina.anio, nomina.mes, 0)
        
        // Retroceder si es domingo (lógica simplificada para el modal sin cargar tabla feriados completa)
        if (lastDay.getDay() === 0) lastDay.setDate(lastDay.getDate() - 1)
        
        return lastDay.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    }
    const fechaAbono = getFechaAbonoEstimada()

    async function handlePagar() {
        if (montoFinalPagar > 0 && !selectedCuenta) return toast.error('Selecciona una cuenta de origen')
        if (montoFinalPagar > 0 && !saldoSuficiente) return toast.error('Saldo insuficiente')

        const today = new Date()
        setLoading(true)
        try {
            setLoading(true)
            const res = await fetch('/api/nomina/pagar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nominaId: nomina?.id,
                    trabajadorId: nomina?.trabajador_id || trabajador.id,
                    mes: nomina?.mes || today.getMonth() + 1,
                    anio: nomina?.anio || today.getFullYear(),
                    cuentaOrigenId: selectedCuenta,
                    incluirBonos: true
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast.success(data.message)
            onOpenChange(false)
            onSuccess()
        } catch (err: any) {
            toast.error(err.message || 'Error al procesar el pago')
        } finally {
            setLoading(false)
        }
    }

    if (!nomina) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] bg-slate-900 border-slate-800 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Banknote className="w-5 h-5 text-emerald-500" />
                        Pagar Nómina — {frecuencia} ({nroPago}/{maxPagos})
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Pago para <strong className="text-white">{trabajador.nombre_completo}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* Desglose */}
                    <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Sueldo del Periodo (1/{divisor})</span>
                                <span className="text-white font-bold">S/ {sueldoBasePeriodo.toFixed(2)}</span>
                            </div>
                            {(nomina?.bonos || 0) > 0 && (
                                <div className="flex justify-between items-start py-1.5 border-y border-white/5 my-1">
                                    <div className="flex flex-col">
                                        <span className="text-slate-400 text-xs">Bonos del Mes (Meta)</span>
                                        {nroPago < maxPagos && (
                                            <span className="text-[9px] text-blue-400 font-extrabold uppercase mt-0.5 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 w-fit">
                                                ABONO: {fechaAbono.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-sm font-black ${bonos > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {bonos > 0 ? `+ S/ ${bonos.toFixed(2)}` : `S/ ${parseFloat(nomina.bonos).toFixed(2)}`}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {descuentos > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Deducciones (Tardanzas)</span>
                                    <span className="text-rose-400 font-bold">- S/ {descuentos.toFixed(2)}</span>
                                </div>
                            )}
                            {adelantosPendientes > 0 && (
                                <div className="flex flex-col p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 mt-1">
                                    <div className="flex justify-between text-[11px] font-bold text-amber-500 uppercase tracking-widest mb-1">
                                        <span>Adelantos Pendientes</span>
                                        <span>S/ {adelantosPendientes.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm border-t border-amber-500/20 pt-1">
                                        <span className="text-amber-500/80">Descontado este pago</span>
                                        <span className="text-amber-400 font-black">- S/ {deduccionAdelanto.toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                            <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                                <span className="text-sm font-bold text-white uppercase tracking-wider">Monto Final</span>
                                <div className="text-right">
                                    <span className="text-2xl font-black text-emerald-400 block leading-tight">S/ {montoFinalPagar.toFixed(2)}</span>
                                    {montoFinalPagar <= 0 && <span className="text-[9px] text-amber-500 uppercase font-black">Cubierto por adelantos</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Incluir bonos (solo último pago) */}
                    {nroPago === maxPagos && (nomina.bonos || 0) > 0 && (
                        <label className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={incluirBonos}
                                onChange={(e) => setIncluirBonos(e.target.checked)}
                                className="w-4 h-4 rounded accent-emerald-500"
                            />
                            <div>
                                <p className="text-xs font-bold text-emerald-400">Pagar Bonos (Final del periodo)</p>
                                <p className="text-[10px] text-slate-500">Monto acumulado de metas: S/ {parseFloat(nomina.bonos).toFixed(2)}</p>
                            </div>
                        </label>
                    )}

                    {/* Selector de cuenta (solo si hay desembolso) */}
                    {montoFinalPagar > 0 ? (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cuenta de Origen</p>
                            <div className="grid gap-2 max-h-36 overflow-y-auto">
                                {cuentas.filter(c => parseFloat(c.saldo) > 0).map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelectedCuenta(c.id)}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                                            selectedCuenta === c.id ? 'bg-blue-500/10 border-blue-500/50' : 'bg-slate-950/30 border-slate-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Wallet className="w-4 h-4 text-slate-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-200">{c.nombre}</p>
                                                <p className="text-[9px] text-slate-500 uppercase">{c.tipo}</p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-black text-slate-400">S/ {parseFloat(c.saldo).toFixed(2)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl border border-dashed border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
                            <HelpCircle className="w-6 h-6 text-emerald-500" />
                            <p className="text-xs text-slate-400">No se requiere desembolso de dinero ya que la cuota está cubierta íntegramente por los adelantos del trabajador.</p>
                        </div>
                    )}

                    {/* Botones de Acción */}
                    <div className="flex gap-4 pt-4 border-t border-slate-800/50">
                        <button
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="flex-1 py-3.5 px-4 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-200"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handlePagar}
                            disabled={loading || (montoFinalPagar > 0 && !selectedCuenta) || (!!selectedCuenta && !saldoSuficiente)}
                            className="flex-[2] py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:opacity-50 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] group"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <div className="w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center group-hover:bg-emerald-400/40 transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                </div>
                            )}
                            Confirmar Pago — S/ {montoFinalPagar.toFixed(2)}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
