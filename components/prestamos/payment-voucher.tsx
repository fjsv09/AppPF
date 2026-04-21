'use client'

import { useRef, useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Share2, Loader2, Printer, Download } from 'lucide-react'
import { toBlob, toPng } from 'html-to-image'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { VoucherContent } from '@/components/comunes/voucher-content'
import { createClient } from '@/utils/supabase/client'
import { cn } from '@/lib/utils'

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
    const printRef = useRef<HTMLDivElement>(null) // Hidden ref for thermal printing
    const iOSPrintContainerRef = useRef<HTMLDivElement>(null) // Parent ref
    const [sharing, setSharing] = useState(false)
    const [printing, setPrinting] = useState(false)
    const [isIOS, setIsIOS] = useState(false)
    const [logoUrl, setLogoUrl] = useState<string>('')
    const [logoDarkUrl, setLogoDarkUrl] = useState<string>('')
    const supabase = createClient()

    useEffect(() => {
        let isMounted = true
        const fetchLogo = async () => {
            const { data } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('clave', 'logo_sistema_url')
                .maybeSingle()
            
            if (data?.valor && isMounted) {
                setLogoUrl(data.valor)
                
                // Generar dinámicamente versión negra para impresión (evita el bug de filtros CSS en Safari)
                try {
                    const img = new Image()
                    img.crossOrigin = 'anonymous'
                    img.onload = () => {
                        if (!isMounted) return
                        const canvas = document.createElement('canvas')
                        canvas.width = img.width
                        canvas.height = img.height
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        
                        ctx.drawImage(img, 0, 0)
                        ctx.globalCompositeOperation = 'source-in'
                        ctx.fillStyle = '#000000'
                        ctx.fillRect(0, 0, canvas.width, canvas.height)
                        
                        setLogoDarkUrl(canvas.toDataURL('image/png'))
                    }
                    img.src = data.valor
                } catch (e) {
                    console.error('No se pudo generar logo oscuro', e)
                }
            }
        }
        if (open) fetchLogo()
        // Detección robusta de iOS
        if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
            const ua = navigator.userAgent.toLowerCase();
            const esIOS = 
                /iphone|ipad|ipod/.test(ua) || 
                /crios|fxios/.test(ua) || 
                (navigator.platform && /iphone|ipad|ipod/.test(navigator.platform.toLowerCase())) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                ((window.navigator as any).standalone === true);
                
            setIsIOS(Boolean(esIOS))
        }
        
        return () => { isMounted = false }
    }, [open, supabase])

    if (!payment) return null

    const handlePrint = async () => {
        if (!printRef.current || printing) return
        setPrinting(true)
        const toastId = toast.loading('Preparando ticket...')
        
        // Limpieza previa (por si hubo cancelaciones anteriores)
        document.body.classList.remove('is-printing-ticket')
        document.getElementById('print-style-native')?.remove()
        document.getElementById('print-container-native')?.remove()

        try {
            // Generar imagen de alta calidad con fondo blanco para la impresora térmica
            const dataUrl = await toPng(printRef.current, { 
                backgroundColor: '#ffffff',
                pixelRatio: 3, // Más alto para térmicas
                skipFonts: false,
                cacheBust: true
            })
            
            const printContainer = document.createElement('div')
            printContainer.id = 'print-container-native'
            printContainer.style.display = 'none'
            printContainer.innerHTML = `<img src="${dataUrl}" style="width: 58mm; height: auto;" />`
            
            const style = document.createElement('style')
            style.id = 'print-style-native'
            style.innerHTML = `
                @media print {
                    @page { margin: 0; size: 58mm auto; }
                    body > *:not(#print-container-native) { display: none !important; }
                    #print-container-native { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 58mm !important; }
                }
            `
            document.head.appendChild(style)
            document.body.appendChild(printContainer)

            document.body.classList.add('is-printing-ticket')
            
            // Dar un poco de tiempo para que la imagen se cargue en el DOM
            setTimeout(() => {
                window.print()
                setPrinting(false)
                toast.success('Abriendo vista de impresión...', { id: toastId })
                
                // Limpieza postergada para Android
                setTimeout(() => {
                    document.body.classList.remove('is-printing-ticket')
                    document.getElementById('print-style-native')?.remove()
                    document.getElementById('print-container-native')?.remove()
                }, 30000)
            }, 500)
        } catch (e) {
            console.error('Error printing:', e)
            toast.error('Error al generar ticket', { id: toastId })
            setPrinting(false)
        }
    }

    const handleShare = async () => {
        if (!receiptRef.current || sharing) return
        setSharing(true)
        try {
            const blob = await toBlob(receiptRef.current, { 
                cacheBust: true, 
                backgroundColor: '#0f172a', 
                pixelRatio: 2,
                skipFonts: false
            })
            if (!blob) throw new Error('Error al generar imagen')

            const fileName = `recibo-${payment?.id?.toString()?.split?.('-')?.[0] || 'pago'}.png`
            const file = new File([blob], fileName, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Recibo de Pago',
                    text: `Pago registrado de ${client?.nombres || 'Cliente'}`
                })
                toast.success('Compartido con éxito')
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
            console.error('Error sharing:', e)
            toast.error('No se pudo compartir la imagen')
        } finally {
            setSharing(false)
        }
    }

    const handleIOSShare = async () => {
        if (!printRef.current || sharing) return
        setSharing(true)
        const toastId = toast.loading('Preparando imagen para iOS...')
        
        try {
            // Pequeña espera para asegurar que los estilos estén aplicados y recursos cargados
            await new Promise(resolve => setTimeout(resolve, 300))

            const dataUrl = await toPng(printRef.current, { 
                backgroundColor: '#ffffff',
                pixelRatio: 2, // Reducir un poco para evitar límites de canvas en iOS
                skipFonts: false,
                cacheBust: true,
                style: {
                    transform: 'scale(1)',
                    transformOrigin: 'top left'
                }
            })
            
            // Convertir Base64 Data URL a Blob de manera segura
            const arr = dataUrl.split(',')
            const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
            const bstr = atob(arr[1])
            let n = bstr.length
            const u8arr = new Uint8Array(n)
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n)
            }
            const blob = new Blob([u8arr], { type: mime })
            
            const fileName = `recibo-ios-${payment?.id?.toString()?.split?.('-')?.[0] || 'pago'}.png`
            const file = new File([blob], fileName, { type: 'image/png' })
            
            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file]
                })
                toast.success('Compartido con éxito en iOS', { id: toastId })
            } else {
                const link = document.createElement('a')
                link.download = fileName
                link.href = URL.createObjectURL(blob)
                link.click()
                toast.success('Imagen descargada', { id: toastId })
            }
            if (payment?.id && userRole === 'asesor') {
                api.pagos.compartirVoucher(payment.id).catch(() => {})
            }
        } catch (e) {
            console.error('Error sharing iOS:', e)
            toast.error('No se pudo generar la imagen', { id: toastId })
        } finally {
            setSharing(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-sm overflow-hidden p-0 gap-0">
                {/* Main View (Dark Mode for App) */}
                <div className="max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div ref={receiptRef}>
                        <VoucherContent 
                            payment={payment}
                            loan={loan}
                            client={client}
                            cronograma={cronograma}
                            allPayments={allPayments}
                            logoUrl={logoUrl}
                            isPrinting={false}
                        />
                    </div>
                </div>

                {/* Print View (Hidden High Contrast for Thermal) */}
                <div ref={iOSPrintContainerRef} style={{ 
                    position: 'fixed', 
                    left: 0, 
                    top: 0, 
                    width: '58mm', 
                    zIndex: -1, 
                    opacity: 0, 
                    pointerEvents: 'none',
                    backgroundColor: 'white'
                }}>
                    <div ref={printRef}>
                        <VoucherContent 
                            payment={payment}
                            loan={loan}
                            client={client}
                            cronograma={cronograma}
                            allPayments={allPayments}
                            logoUrl={logoUrl}
                            isPrinting={true}
                        />
                    </div>
                </div>

                {/* Footer Buttons - Fixed at bottom */}
                <div className="p-3 bg-slate-950 flex gap-2 border-t border-slate-800 shadow-2xl">
                    <Button 
                        onClick={handlePrint} 
                        disabled={printing || sharing} 
                        variant="outline"
                        className={cn("border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 rounded-xl h-11 text-xs font-bold", isIOS ? "flex-1" : "flex-1")}
                    >
                        {printing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                        Imprimir
                    </Button>
                    {isIOS && (
                        <Button 
                            onClick={handleIOSShare} 
                            disabled={sharing || printing} 
                            className="flex-[1.5] bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-900/20 h-11 text-xs font-bold"
                        >
                            {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                            Imprimir iOS
                        </Button>
                    )}
                    <Button 
                        onClick={handleShare} 
                        disabled={sharing || printing} 
                        className={cn("bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 h-11 text-xs font-bold", isIOS ? "flex-1" : "flex-[1.5]")}
                    >
                        {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-1" /> : <Share2 className="w-4 h-4 mr-1" />}
                        {isIOS ? 'Normal' : 'Compartir'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}


