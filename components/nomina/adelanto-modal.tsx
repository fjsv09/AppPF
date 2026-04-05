'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Wallet, Loader2, CheckCircle2, TrendingUp, HelpCircle } from 'lucide-react'

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
        setLoadingCuentas(true)
        const { data } = await supabase
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo')
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
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Monto S/</label>
                            <input
                                type="number"
                                step="0.01"
                                value={monto}
                                onChange={(e) => setMonto(e.target.value)}
                                placeholder="0.00"
                                className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 focus:outline-none focus:border-blue-500 font-bold text-white text-lg"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nota (Opcional)</label>
                            <input
                                type="text"
                                value={concepto}
                                onChange={(e) => setConcepto(e.target.value)}
                                placeholder="Ej: Pago de renta"
                                className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 focus:outline-none focus:border-blue-500 text-white text-sm"
                            />
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
                        <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Este adelanto se restará automáticamente del total neto del próximo pago semanal o mensual disponible en el sistema.
                        </p>
                    </div>

                    {/* Selector de cuenta */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cuenta de Origen</p>
                        <div className="grid gap-2 max-h-40 overflow-y-auto">
                            {cuentas.filter(c => parseFloat(c.saldo) > 0).map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedCuenta(c.id)}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                                        selectedCuenta === c.id
                                            ? 'bg-blue-500/10 border-blue-500/50 shadow-lg shadow-blue-500/5'
                                            : 'bg-slate-950/30 border-slate-800 hover:border-slate-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Wallet className={`w-4 h-4 ${selectedCuenta === c.id ? 'text-blue-400' : 'text-slate-500'}`} />
                                        <div>
                                            <p className="text-xs font-bold text-slate-200 truncate max-w-[200px]">{c.nombre}</p>
                                            <p className="text-[9px] text-slate-500 uppercase">{c.tipo}</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black text-slate-400">S/ {parseFloat(c.saldo).toFixed(2)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="flex-1 py-2.5 text-sm font-bold text-slate-400 hover:text-white rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleEnviar}
                            disabled={loading || !selectedCuenta || !monto || parseFloat(monto) <= 0 || !saldoSuficiente}
                            className="flex-[2] py-2.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-900/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4" />
                            )}
                            Registrar Desembolso
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
