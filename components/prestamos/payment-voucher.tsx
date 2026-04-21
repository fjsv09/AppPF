'use client'

import { useRef, useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Share2, Loader2, Printer } from 'lucide-react'
import { toBlob, toPng } from 'html-to-image'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { VoucherContent } from '@/components/comunes/voucher-content'
import { createClient } from '@/utils/supabase/client'

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
    const [printing, setPrinting] = useState(false)
    const [logoUrl, setLogoUrl] = useState<string>('')
    const supabase = createClient()

    useEffect(() => {
        const fetchLogo = async () => {
            const { data } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('clave', 'logo_sistema_url')
                .maybeSingle()
            if (data?.valor) setLogoUrl(data.valor)
        }
        if (open) fetchLogo()
    }, [open, supabase])

    if (!payment) return null

    const handlePrint = async () => {
        if (!receiptRef.current || printing) return
        setPrinting(true)
        const toastId = toast.loading('Preparando impresión...')
        try {
            // Captura de alta calidad para impresión
            const dataUrl = await toPng(receiptRef.current, { 
                backgroundColor: '#0f172a',
                pixelRatio: 2
            })
            
            const printContainer = document.createElement('div')
            printContainer.id = 'print-container-native'
            printContainer.style.display = 'none'
            printContainer.innerHTML = `<img src="${dataUrl}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />`
            
            const style = document.createElement('style')
            style.id = 'print-style-native'
            style.innerHTML = `
                @media print {
                    body > *:not(#print-container-native) { display: none !important; }
                    #print-container-native { 
                        display: block !important; 
                        position: absolute !important; 
                        top: 0 !important; 
                        left: 0 !important; 
                        width: 100% !important;
                    }
                    @page { margin: 2mm; }
                }
            `
            document.head.appendChild(style)
            document.body.appendChild(printContainer)

            setTimeout(() => {
                window.print()
                setTimeout(() => {
                    document.head.removeChild(style)
                    document.body.removeChild(printContainer)
                    setPrinting(false)
                    toast.success('Impresión enviada', { id: toastId })
                }, 500)
            }, 500)
        } catch (e) {
            console.error(e)
            toast.error('Error al generar impresión', { id: toastId })
            setPrinting(false)
        }
    }

    const handleShare = async () => {
        if (!receiptRef.current || sharing) return
        setSharing(true)
        try {
            const blob = await toBlob(receiptRef.current, { cacheBust: true, backgroundColor: '#0f172a', pixelRatio: 2 })
            if (!blob) throw new Error('Error al generar imagen')

            const fileName = `recibo-${payment.id.split('-')[0]}.png`
            const file = new File([blob], fileName, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Recibo de Pago',
                    text: `Pago registrado de ${client?.nombres || 'Cliente'}`
                })
            } else {
                const link = document.createElement('a')
                link.download = fileName
                link.href = URL.createObjectURL(blob)
                link.click()
                toast.success('Imagen descargada')
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
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-sm overflow-hidden p-0 gap-0">
                <div className="max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div ref={receiptRef}>
                        <VoucherContent 
                            payment={payment}
                            loan={loan}
                            client={client}
                            cronograma={cronograma}
                            allPayments={allPayments}
                            logoUrl={logoUrl}
                        />
                    </div>
                </div>

                {/* Footer Buttons - Fixed at bottom */}
                <div className="p-3 bg-slate-950 flex gap-2 border-t border-slate-800 shadow-2xl">
                    <Button 
                        onClick={() => onOpenChange(false)} 
                        variant="ghost" 
                        className="flex-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl h-11 text-xs font-bold"
                    >
                        Cerrar
                    </Button>
                    <Button 
                        onClick={handlePrint} 
                        disabled={printing || sharing} 
                        variant="outline"
                        className="flex-1 border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 rounded-xl h-11 text-xs font-bold"
                    >
                        {printing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                        Imprimir
                    </Button>
                    <Button 
                        onClick={handleShare} 
                        disabled={sharing || printing} 
                        className="flex-[1.5] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 h-11 text-xs font-bold"
                    >
                        {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                        Compartir
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

