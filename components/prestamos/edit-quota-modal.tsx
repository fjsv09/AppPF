'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from 'sonner'
import { Loader2, Pencil, CalendarDays, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditQuotaModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    quota: any
    onSuccess?: () => void
}

export function EditQuotaModal({ open, onOpenChange, quota, onSuccess }: EditQuotaModalProps) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        monto_cuota: '',
        metodo_pago: ''
    })

    const isPaid = quota && (parseFloat(quota.monto_pagado) > 0 || quota.estado === 'pagado')

    useEffect(() => {
        if (open && quota) {
            setFormData({
                monto_cuota: quota.monto_cuota?.toString() || '',
                metodo_pago: quota.metodo_pago || 'Efectivo'
            })
        }
    }, [open, quota])

    const handleSubmit = async () => {
        setLoading(true)
        try {
            const response = await fetch(`/api/cuotas/${quota.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar cuota')
            }

            toast.success('Cuota de préstamo actualizada')
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
            <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-800 text-slate-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-blue-500">
                        <CalendarDays className="w-5 h-5" />
                        Editar Cuota #{quota?.numero_cuota}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Modificar monto y método de pago. {isPaid && "Al estar pagada, se ajustarán los movimientos financieros."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="space-y-3">
                        <Label htmlFor="monto_cuota" className="text-sm font-medium text-slate-300">Valor de la Cuota</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                            <Input
                                id="monto_cuota"
                                type="number"
                                value={formData.monto_cuota}
                                onChange={(e) => setFormData({ ...formData, monto_cuota: e.target.value })}
                                className="pl-8 h-12 text-xl font-bold bg-slate-950 border-slate-700 text-white rounded-xl"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {isPaid && (
                        <div className="space-y-3 pt-2 border-t border-slate-800">
                            <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Método de Pago Utilizado</Label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, metodo_pago: 'Efectivo' })}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all duration-200",
                                        formData.metodo_pago === 'Efectivo' 
                                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                                        : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                    )}
                                >
                                    <span className="text-2xl">💵</span>
                                    <span className="font-bold text-xs">Efectivo</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, metodo_pago: 'Yape' })}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all duration-200",
                                        formData.metodo_pago === 'Yape' 
                                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                                        : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                    )}
                                >
                                    <span className="text-2xl">📱</span>
                                    <span className="font-bold text-xs">Yape</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={loading || !formData.monto_cuota || parseFloat(formData.monto_cuota) <= 0}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl"
                    >
                        {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
                        Actualizar Cuota
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
