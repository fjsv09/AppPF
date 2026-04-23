'use client'

import { useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface SyncAccountBalanceProps {
    cuentaId: string
    nombreCuenta: string
}

export function SyncAccountBalance({ cuentaId, nombreCuenta }: SyncAccountBalanceProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSync = async () => {
        if (!confirm(`¿Deseas recalcular el saldo de "${nombreCuenta}" basándose en todos sus movimientos registrados?`)) {
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/admin/carteras/cuentas/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cuenta_id: cuentaId })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast.success(`Saldo sincronizado: S/ ${data.nuevo_saldo.toFixed(2)}`)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button 
            variant="outline" 
            size="sm" 
            className="h-9 bg-slate-900 border-slate-800 text-slate-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all gap-2"
            onClick={handleSync}
            disabled={loading}
        >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar Saldo</span>
        </Button>
    )
}
