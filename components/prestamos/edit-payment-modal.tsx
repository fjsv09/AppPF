'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Pencil, Wallet, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditPaymentModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    payment: any
    onSuccess?: () => void
}

export function EditPaymentModal({ open, onOpenChange, payment, onSuccess }: EditPaymentModalProps) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        monto: '',
        metodo_pago: '',
        nota_auditoria: ''
    })

    useEffect(() => {
        if (open && payment) {
            setFormData({
                monto: payment.monto?.toString() || payment.monto_pagado?.toString() || '',
                metodo_pago: payment.metodo_pago || 'Efectivo',
                nota_auditoria: ''
            })
        }
    }, [open, payment])

    const handleSubmit = async () => {
        if (!formData.nota_auditoria) {
            toast.error('Debe ingresar una nota que justifique el ajuste.')
            return
        }

        setLoading(true)
        try {
            const response = await fetch(`/api/pagos/${payment.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar el cobro')
            }

            toast.success('Registro de cobro actualizado correctamente')
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
            <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-emerald-500">
                        <Wallet className="w-5 h-5" />
                        Corregir Cobro
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Ajuste administrativo de monto y método de pago.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 py-4">
                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-300 leading-tight">
                            Este cambio ajustará el saldo de la cartera del asesor y generará un movimiento de auditoría. 
                            <strong> Solo es posible si el asesor no ha realizado su cierre de turno.</strong>
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="monto" className="text-sm font-bold text-slate-300 uppercase tracking-tighter">Monto Cobrado Real</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-black text-lg">S/</span>
                            <Input
                                id="monto"
                                type="number"
                                value={formData.monto}
                                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                                className="pl-10 h-14 text-2xl font-black bg-slate-950 border-slate-700 text-white rounded-xl focus:border-emerald-500/50 focus:ring-emerald-500/20"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Método de Pago</Label>
                        <div className="grid grid-cols-2 gap-3">
                            {['Efectivo', 'Yape'].map((metodo) => (
                                <button
                                    key={metodo}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, metodo_pago: metodo })}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all duration-200",
                                        formData.metodo_pago === metodo 
                                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                                        : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                    )}
                                >
                                    <span className="text-2xl">{metodo === 'Efectivo' ? '💵' : '📱'}</span>
                                    <span className="font-bold text-xs">{metodo}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="nota" className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Motivo del Ajuste (Obligatorio)</Label>
                        <Textarea 
                            id="nota"
                            placeholder="Ej: Error de dedo al digitar el monto..."
                            className="bg-slate-950 border-slate-800 focus:border-slate-700 min-h-[80px] rounded-xl text-sm"
                            value={formData.nota_auditoria}
                            onChange={(e) => setFormData({ ...formData, nota_auditoria: e.target.value })}
                        />
                    </div>
                </div>

                <DialogFooter className="pt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading} className="text-slate-500 hover:text-white">
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={loading || !formData.monto || parseFloat(formData.monto) < 0}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black h-12 rounded-xl uppercase tracking-tighter"
                    >
                        {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
                        Guardar Corrección
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
