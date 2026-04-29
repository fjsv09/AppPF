'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Calculator, Lock, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from '@/lib/utils'

interface LoanActionsProps {
    prestamoId: string
    hasSchedule?: boolean
    isLocked?: boolean
    force?: boolean
}

export function LoanActions({ prestamoId, hasSchedule, isLocked, force }: LoanActionsProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const [pendingAction, setPendingAction] = useState<{
        fn: () => Promise<void>,
        title: string,
        description: string,
        icon: any,
        confirmText: string,
        variant: 'default' | 'destructive' | 'success'
    } | null>(null)

    const executePending = async () => {
        if (pendingAction) {
            await pendingAction.fn()
            setIsConfirmOpen(false)
            setPendingAction(null)
        }
    }

    const handleGenerateSchedule = async () => {
        const action = async () => {
            setLoading(true)
            try {
                const response = await fetch(`/api/prestamos/${prestamoId}/generar-cronograma`, {
                    method: 'POST'
                })

                const result = await response.json()
                if (!response.ok) throw new Error(result.error || 'Error al generar cronograma')

                toast.success('Cronograma Generado', { description: 'Revisa las cuotas abajo.' })
                router.refresh()
            } catch (err: any) {
                toast.error('Error al generar cronograma', { description: err.message })
            } finally {
                setLoading(false)
            }
        }

        if (hasSchedule || force) {
            setPendingAction({
                fn: action,
                title: '¿Regenerar Cronograma?',
                description: 'Esta acción sobrescribirá las cuotas actuales y se perderán los cambios manuales. ¿Deseas continuar?',
                icon: <RefreshCw className="w-6 h-6 text-blue-500" />,
                confirmText: 'Sí, Regenerar',
                variant: 'default'
            })
            setIsConfirmOpen(true)
        } else {
            await action()
        }
    }

    const handleLockSchedule = async () => {
        const action = async () => {
            setLoading(true)
            try {
                const { error } = await supabase.from('prestamos').update({ bloqueo_cronograma: true }).eq('id', prestamoId)
                if (error) throw error

                toast.success('Préstamo Iniciado', { description: 'El cronograma ha sido bloqueado.' })
                router.refresh()
            } catch (err: any) {
                toast.error('Error al bloquear', { description: err.message })
            } finally {
                setLoading(false)
            }
        }

        setPendingAction({
            fn: action,
            title: '¿Iniciar Préstamo?',
            description: 'Al iniciar el préstamo, el cronograma quedará bloqueado permanentemente y no podrá ser modificado. ¿Confirmas el inicio?',
            icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />,
            confirmText: 'Confirmar Inicio',
            variant: 'success'
        })
        setIsConfirmOpen(true)
    }

    if (force) {
        return (
            <Button 
                onClick={handleGenerateSchedule} 
                disabled={loading} 
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20"
            >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Sincronizar Cronograma
            </Button>
        )
    }

    if (isLocked) {
        return (
            <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 px-3 py-2 rounded-md">
                <Lock className="h-4 w-4" />
                <span className="text-sm font-medium">Cronograma Bloqueado (Préstamo Iniciado)</span>
            </div>
        )
    }

    return (
        <div className="flex gap-2">
            {!hasSchedule && (
                <Button onClick={handleGenerateSchedule} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                    Generar Cronograma
                </Button>
            )}

            {hasSchedule && !isLocked && (
                <Button onClick={handleGenerateSchedule} disabled={loading} variant="outline" className="border-indigo-500 text-indigo-400">
                    Regenerar
                </Button>
            )}

            {hasSchedule && !isLocked && (
                <Button onClick={handleLockSchedule} disabled={loading} className="bg-green-600 hover:bg-green-500 text-white">
                    <Lock className="mr-2 h-4 w-4" />
                    Iniciar Préstamo
                </Button>
            )}

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent className="bg-slate-900/90 backdrop-blur-xl border-slate-800/50 text-slate-100 shadow-2xl shadow-indigo-500/10">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-3 text-xl font-bold">
                            {pendingAction?.icon}
                            {pendingAction?.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 text-base py-2">
                            {pendingAction?.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3 mt-4">
                        <AlertDialogCancel className="bg-slate-800 hover:bg-slate-700 border-none text-slate-300">
                            Cancelar
                        </AlertDialogCancel>
                        <Button
                            disabled={loading}
                            onClick={executePending}
                            className={cn(
                                "font-bold px-6",
                                pendingAction?.variant === 'destructive' ? "bg-rose-600 hover:bg-rose-500" :
                                pendingAction?.variant === 'success' ? "bg-emerald-600 hover:bg-emerald-500" :
                                "bg-blue-600 hover:bg-blue-500"
                            )}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {pendingAction?.confirmText}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
