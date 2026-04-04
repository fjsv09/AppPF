'use client'

import { useRef, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Share2, Loader2 } from 'lucide-react'
import { toBlob } from 'html-to-image'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { VoucherContent } from '@/components/comunes/voucher-content'

interface PaymentVoucherProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    payment: any 
    loan: any
    client: any
    cronograma?: any[]
    allPayments?: any[]
    userRole?: 'admin' | 'supervisor' | 'asesor'
}

export function PaymentVoucher({ open, onOpenChange, payment, loan, client, cronograma, allPayments, userRole = 'asesor' }: PaymentVoucherProps) {
    const receiptRef = useRef<HTMLDivElement>(null)
    const [sharing, setSharing] = useState(false)

    if (!payment) return null

    const handleShare = async () => {
        if (!receiptRef.current) return
        setSharing(true)
        try {
            const blob = await toBlob(receiptRef.current, { cacheBust: true, backgroundColor: '#0f172a' })
            if (!blob) throw new Error('Error al generar imagen')

            const fileName = `comprobante-${payment.id.split('-')[0]}.png`
            const file = new File([blob], fileName, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Comprobante de Pago',
                    text: `Pago registrado de ${client?.nombres || 'Cliente'}`
                })
            } else {
                const link = document.createElement('a')
                link.download = fileName
                link.href = URL.createObjectURL(blob)
                link.click()
                toast.success('Comprobante descargado')
            }
            if (payment?.id && userRole === 'asesor') {
                api.pagos.compartirVoucher(payment.id).catch(() => {})
            }
        } catch (e) {
            console.error(e)
            toast.error('No se pudo compartir la imagen')
        } finally {
            setSharing(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-sm overflow-hidden p-0">
                <div ref={receiptRef}>
                    <VoucherContent 
                        payment={payment}
                        loan={loan}
                        client={client}
                        cronograma={cronograma}
                        allPayments={allPayments}
                    />
                </div>

                {/* Footer Buttons */}
                <div className="p-4 bg-slate-950 flex gap-3 border-t border-slate-800">
                    <Button onClick={() => onOpenChange(false)} variant="ghost" className="flex-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl">
                        Cerrar
                    </Button>
                    <Button onClick={handleShare} disabled={sharing} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20">
                        {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                        Compartir
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
