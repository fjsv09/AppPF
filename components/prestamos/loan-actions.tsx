'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Calculator, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface LoanActionsProps {
    prestamoId: string
    hasSchedule: boolean
    isLocked: boolean
}

export function LoanActions({ prestamoId, hasSchedule, isLocked }: LoanActionsProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleGenerateSchedule = async () => {
        setLoading(true)
        try {
            // Call RPC (Database Function) directly to avoid deployment issues
            const { data, error } = await supabase.rpc('generar_cronograma_db', {
                p_prestamo_id: prestamoId
            })

            if (error) throw error

            toast.success('Cronograma Generado', { description: 'Revisa las cuotas abajo.' })
            router.refresh()
        } catch (err: any) {
            toast.error('Error al generar cronograma', { description: err.message })
        } finally {
            setLoading(false)
        }
    }

    const handleLockSchedule = async () => {
        if (!confirm('¿Estás seguro de iniciar el préstamo? Esto bloqueará el cronograma permanentemente.')) return

        setLoading(true)
        try {
            // Logic to lock. Can be a simple update via RLS (if admin) or RPC.
            // We can use RPC or update.
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
        </div>
    )
}
