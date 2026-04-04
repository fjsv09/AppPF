'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PaymentWizard } from "./payment-wizard"
import { createClient } from "@/utils/supabase/client"

interface PaymentModalProps {
    userRol: 'admin' | 'supervisor' | 'asesor'
    trigger?: React.ReactNode
}

export function PaymentModal({ userRol, trigger }: PaymentModalProps) {
    const [open, setOpen] = useState(false)
    const [systemSchedule, setSystemSchedule] = useState<any>(null)
    const supabase = createClient()

    useEffect(() => {
        async function fetchConfig() {
            const { data: configHorario } = await supabase
                .from('configuracion_sistema')
                .select('clave, valor')
                .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
            
            if (configHorario) {
                setSystemSchedule({
                    horario_apertura: configHorario.find(c => c.clave === 'horario_apertura')?.valor || '07:00',
                    horario_cierre: configHorario.find(c => c.clave === 'horario_cierre')?.valor || '20:00',
                    desbloqueo_hasta: configHorario.find(c => c.clave === 'desbloqueo_hasta')?.valor || ''
                })
            }
        }
        if (open && !systemSchedule) {
            fetchConfig()
        }
    }, [open, systemSchedule, supabase])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="w-full md:w-auto btn-action bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20 hover:scale-105 active:scale-95">
                        <Plus className="mr-2 h-5 w-5" />
                        Registrar Nuevo Pago
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:max-w-3xl bg-slate-950 border-slate-800 p-0 overflow-hidden rounded-2xl md:rounded-3xl">
                <div className="p-4 md:p-8 max-h-[90dvh] overflow-y-auto custom-scrollbar">
                    <DialogHeader className="mb-4 md:mb-6">
                        <DialogTitle className="text-xl md:text-2xl font-bold text-white">Registrar Pago</DialogTitle>
                    </DialogHeader>
                    <PaymentWizard userRol={userRol} systemSchedule={systemSchedule} onClose={() => setOpen(false)} />
                </div>
            </DialogContent>
        </Dialog>
    )
}
