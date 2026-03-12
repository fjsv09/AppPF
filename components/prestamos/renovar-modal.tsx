'use client'

import { useState } from 'react'
import { api } from '@/services/api'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface RenovarModalProps {
    prestamoId: string
    clienteNombre: string
    currentMonto: number
}

export function RenovarModal({ prestamoId, clienteNombre, currentMonto }: RenovarModalProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        const formData = new FormData(e.currentTarget)
        const data = {
            prestamo_original_id: prestamoId,
            nuevo_monto: parseFloat(formData.get('nuevo_monto') as string),
            nuevo_interes: parseFloat(formData.get('nuevo_interes') as string),
            nueva_fecha_inicio: formData.get('fecha_inicio') as string,
            nueva_fecha_fin: formData.get('fecha_fin') as string
        }

        try {
            await api.prestamos.renovar(data)
            toast.success('Préstamo renovado exitosamente')
            setOpen(false)
            router.refresh()
            // Optionally redirect to new loan or specific view
        } catch (error: any) {
            toast.error(error.message || 'Error al renovar préstamo')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-amber-600 hover:bg-amber-500 text-white">
                    <RefreshCw className="mr-2 h-4 w-4" /> Renovar
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Renovar Préstamo</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Se cerrará el préstamo actual de {clienteNombre} y se creará uno nuevo.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="nuevo_monto">Nuevo Monto (Refinanciado)</Label>
                        <Input 
                            id="nuevo_monto" 
                            name="nuevo_monto" 
                            type="number" 
                            step="0.01" 
                            defaultValue={currentMonto}
                            className="bg-slate-950 border-slate-800"
                            required 
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="nuevo_interes">Nuevo Interés (%)</Label>
                        <Input 
                            id="nuevo_interes" 
                            name="nuevo_interes" 
                            type="number" 
                            step="0.1" 
                            defaultValue="10"
                            className="bg-slate-950 border-slate-800"
                            required 
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="fecha_inicio">Fecha Inicio</Label>
                        <Input 
                            id="fecha_inicio" 
                            name="fecha_inicio" 
                            type="date" 
                            className="bg-slate-950 border-slate-800"
                            required 
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="fecha_fin">Fecha Fin</Label>
                        <Input 
                            id="fecha_fin" 
                            name="fecha_fin" 
                            type="date" 
                            className="bg-slate-950 border-slate-800"
                            required 
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-500 text-white w-full">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Renovación'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
