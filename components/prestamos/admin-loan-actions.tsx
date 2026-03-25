'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { AdminNuevoPrestamoModal } from './admin-nuevo-prestamo-modal'

interface AdminLoanActionsProps {
    cuentas: any[]
    feriados: string[]
}

export function AdminLoanActions({ cuentas, feriados }: AdminLoanActionsProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)

    return (
        <>
            <Button 
                onClick={() => setIsModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl shadow-lg shadow-emerald-500/20 px-6 transition-all active:scale-95 flex items-center gap-2"
            >
                <Plus className="w-5 h-5" />
                <span className="hidden md:inline">NUEVO PRÉSTAMO</span>
                <span className="md:hidden">NUEVO</span>
            </Button>

            <AdminNuevoPrestamoModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                cuentas={cuentas}
                feriados={feriados}
            />
        </>
    )
}
