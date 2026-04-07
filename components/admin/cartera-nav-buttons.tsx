'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { History, ArrowRightCircle } from 'lucide-react'
import { CarteraTransferModal } from './cartera-transfer-modal'

interface CarteraNavButtonsProps {
    carteraId: string
    accounts: any[]
}

export function CarteraNavButtons({ carteraId, accounts }: CarteraNavButtonsProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    return (
        <div className="flex items-center gap-2">
            <CarteraTransferModal carteraId={carteraId} accounts={accounts} />
            
            <Button 
                size="sm" 
                className="h-7 md:h-8 px-3 md:px-5 bg-blue-600 hover:bg-blue-500 text-white text-[9px] md:text-[10px] font-black rounded-lg shadow-lg shadow-blue-900/20 group relative overflow-hidden transition-all"
                loading={isPending}
                onClick={() => {
                    startTransition(() => {
                        router.push(`/dashboard/admin/carteras/${carteraId}/movimientos`)
                    })
                }}
            >
                <span className="flex items-center gap-1.5">
                    HISTORIAL
                    {!isPending && <ArrowRightCircle className="w-3 md:w-3.5 h-3 md:h-3.5 group-hover:translate-x-1 transition-transform" />}
                </span>
            </Button>
        </div>
    )
}
