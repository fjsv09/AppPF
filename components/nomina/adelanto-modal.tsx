'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Wallet, Loader2, CheckCircle2, TrendingUp, HelpCircle, Smartphone, Coins } from 'lucide-react'

interface AdelantoModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    trabajador: { id: string; nombre_completo: string }
    onSuccess: () => void
}

export function AdelantoModal({ open, onOpenChange, trabajador, onSuccess }: AdelantoModalProps) {
    const [cuentas, setCuentas] = useState<any[]>([])
    const [selectedCuenta, setSelectedCuenta] = useState<string>('')
    const [monto, setMonto] = useState<string>('')
    const [concepto, setConcepto] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [loadingCuentas, setLoadingCuentas] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        if (open) {
            fetchCuentas()
            setSelectedCuenta('')
            setMonto('')
            setConcepto('')
        }
    }, [open])

    async function fetchCuentas() {
        const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'
        setLoadingCuentas(true)
        const { data } = await supabase
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo')
            .eq('cartera_id', GLOBAL_CARTERA_ID)
            .order('nombre')
        setCuentas(data || [])
        setLoadingCuentas(false)
    }

    const cuentaSeleccionada = cuentas.find(c => c.id === selectedCuenta)
    const saldoSuficiente = cuentaSeleccionada ? parseFloat(cuentaSeleccionada.saldo) >= parseFloat(monto || '0') : false

    async function handleEnviar() {
        const montoNum = parseFloat(monto)
        if (!montoNum || montoNum <= 0) return toast.error('Monto inválido')
        if (!selectedCuenta) return toast.error('Selecciona una cuenta de origen')
        if (!saldoSuficiente) return toast.error('Saldo insuficiente')

        setLoading(true)
        try {
            const res = await fetch('/api/nomina/adelanto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trabajadorId: trabajador.id,
                    cuentaId: selectedCuenta,
                    monto: montoNum,
                    concepto
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast.success(data.message)
            onOpenChange(false)
            onSuccess()
        } catch (err: any) {
            toast.error(err.message || 'Error al registrar adelanto')
        } finally {
            setLoading(false)
        }
    }

    if (!trabajador) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-800 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                        Registrar Adelanto de Sueldo
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Entrega dinero a <strong className="text-white">{trabajador.nombre_completo}</strong> a cuenta de su próximo pago.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* Monto y Concepto */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Monto S/</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-black">S/</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={monto}
                                    onChange={(e) => setMonto(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 focus:outline-none focus:border-blue-500 font-black text-white text-lg transition-all"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nota (Opcional)</label>
                            <input
                                type="text"
                                value={concepto}
                                onChange={(e) => setConcepto(e.target.value)}
                                placeholder="Ej: Pago de renta"
                                className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 focus:outline-none focus:border-blue-500 text-white text-sm transition-all"
                            />
                        </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
                        <div className="p-1 bg-blue-500/10 rounded-lg">
                            <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            Este adelanto se restará automáticamente del total neto del próximo pago semanal o mensual disponible en el sistema.
                        </p>
                    </div>

                    {/* Selector de cuenta */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cuenta de Origen (Nómina Global)</p>
                        <div className="grid gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-hide">
                            {cuentas.map(c => {
                                const isDigital = c.tipo?.toLowerCase().includes('digital') || c.tipo?.toLowerCase().includes('banco')
                                const isSelected = selectedCuenta === c.id
                                const currentSaldo = parseFloat(c.saldo)

                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelectedCuenta(c.id)}
                                        className={`w-full group relative flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left overflow-hidden ${
                                            isSelected 
                                                ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                                                : 'bg-slate-950/40 border-slate-800/50 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4 relative z-10">
                                            {/* Custom Radio Icon */}
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                                isSelected ? 'border-blue-500 bg-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'border-slate-700 bg-slate-900'
                                            }`}>
                                                {isSelected && <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_5px_white]" />}
                                            </div>

                                            <div className={`p-2.5 rounded-xl transition-colors ${
                                                isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-900 text-slate-500'
                                            }`}>
                                                {isDigital ? <Smartphone className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                                            </div>

                                            <div>
                                                <p className={`text-sm font-black transition-colors ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                    {c.nombre}
                                                </p>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                                                    isDigital ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'
                                                }`}>
                                                    {c.tipo}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="text-right relative z-10">
                                            <p className={`text-[10px] font-bold uppercase tracking-tight mb-0.5 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`}>Saldo Disponible</p>
                                            <p className={`text-base font-black ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                                S/ {currentSaldo.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>

                                        {isSelected && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-transparent pointer-events-none" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3 pt-3 border-t border-slate-800/50">
                        <button
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleEnviar}
                            disabled={loading || !selectedCuenta || !monto || parseFloat(monto) <= 0 || !saldoSuficiente}
                            className="flex-[2] py-3 px-6 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group transition-all"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <div className="w-5 h-5 rounded-full bg-blue-400/20 flex items-center justify-center group-hover:bg-blue-400/40 transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                </div>
                            )}
                            Registrar Desembolso
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
