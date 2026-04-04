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
import { Plus, Clock } from "lucide-react"
import { CuadreForm } from "./cuadre-form"
import { createClient } from "@/utils/supabase/client"

interface CuadreModalProps {
    userId: string
    isDebtBlocked?: boolean
    isMorningBlocked?: boolean
    isNightBlocked?: boolean
    systemConfig?: any
    trigger?: React.ReactNode
}

export function CuadreModal({ userId, isDebtBlocked, isMorningBlocked, isNightBlocked, systemConfig, trigger }: CuadreModalProps) {
    const [open, setOpen] = useState(false)
    const [carteras, setCarteras] = useState<any[]>([])
    const [config, setConfig] = useState<any>(systemConfig)
    const supabase = createClient()

    useEffect(() => {
        async function fetchData() {
            if (!carteras.length) {
                const { data } = await supabase
                    .from('carteras')
                    .select('*')
                    .eq('asesor_id', userId)
                if (data) setCarteras(data)
            }
            if (!config) {
                const { data: configData } = await supabase
                    .from('configuracion_sistema')
                    .select('clave, valor')
                
                if (configData) {
                    const mappedConfig = configData.reduce((acc: any, c: any) => ({
                        ...acc,
                        [c.clave]: c.valor
                    }), {})
                    setConfig(mappedConfig)
                }
            }
        }
        if (open) {
            fetchData()
        }
    }, [open, carteras, config, supabase, userId])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="w-full md:w-auto btn-action bg-blue-600 hover:bg-blue-500 shadow-blue-900/20 hover:scale-105 active:scale-95">
                        <Clock className="mr-2 h-5 w-5" />
                        Realizar Cuadre
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:max-w-3xl bg-slate-950 border-slate-800 p-0 overflow-hidden rounded-2xl md:rounded-3xl">
                <div className="p-4 md:p-8 max-h-[90dvh] overflow-y-auto custom-scrollbar">
                    <DialogHeader className="mb-4 md:mb-6">
                        <DialogTitle className="text-xl md:text-2xl font-bold text-white">Solicitud de Cuadre</DialogTitle>
                    </DialogHeader>
                    <CuadreForm 
                        carteras={carteras} 
                        userId={userId} 
                        isDebtBlocked={isDebtBlocked} 
                        isMorningBlocked={isMorningBlocked} 
                        isNightBlocked={isNightBlocked}
                        systemConfig={config}
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
