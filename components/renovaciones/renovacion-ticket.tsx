'use client'

import { Button } from '@/components/ui/button'
import { Share2, Receipt, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

interface RenovacionTicketProps {
    solicitud: any
    saldoAnterior: number
    nuevoPrestamoId: string
    clienteNombre: string
    logoUrl?: string
}

import { formatMoney } from '@/utils/format'

/**
 * Captura el ticket como imagen PNG usando html-to-image.
 * Retorna un data URL string.
 */
async function captureTicketAsImage(element: HTMLElement): Promise<string> {
    // Capturar con cacheBust para asegurar frescura de estilos e imágenes
    return await toPng(element, { 
        backgroundColor: '#ffffff', 
        pixelRatio: 3,
        cacheBust: true,
        skipFonts: false
    })
}

/**
 * Convierte una data URL a un Blob binario.
 */
function dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
}

export function RenovacionTicket({ solicitud, saldoAnterior, nuevoPrestamoId, clienteNombre, logoUrl }: RenovacionTicketProps) {
    const ticketRef = useRef<HTMLDivElement>(null)
    const [isPrinting, setIsPrinting] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const montoNuevo = solicitud.monto_solicitado
    const efectivoEntregar = montoNuevo - saldoAnterior
    const fecha = new Date(solicitud.fecha_aprobacion || new Date())
    const ticketId = nuevoPrestamoId.split('-')[0].toUpperCase()

    const handlePrint = async () => {
        const ticketEl = ticketRef.current
        if (!ticketEl || isPrinting) return

        setIsPrinting(true)
        toast.loading('Preparando impresión...', { id: 'print-ticket' })

        try {
            // Capturar el ticket como imagen
            const dataUrl = await toPng(ticketEl, { 
                backgroundColor: '#ffffff', 
                pixelRatio: 2.5,
                cacheBust: true,
                skipFonts: false
            })
            
            // Convertir Base64 a Blob para usar una Blob URL (más seguro y eficiente para el spooler de Android)
            const blob = dataUrlToBlob(dataUrl)
            const blobUrl = URL.createObjectURL(blob)

            // 1. Crear contenedor temporal para la imagen de impresión
            const printContainer = document.createElement('div')
            printContainer.id = 'print-container-native'
            printContainer.style.display = 'none'
            printContainer.innerHTML = `<img src="${blobUrl}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />`
            
            // 2. Inyectar estilos
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
                        background: white !important;
                    }
                    @page { margin: 2mm; }
                }
            `
            
            document.head.appendChild(style)
            document.body.appendChild(printContainer)

            // 3. Disparar impresión nativa
            document.body.classList.add('is-printing-ticket')
            setTimeout(() => {
                window.print()
                setIsPrinting(false)
                toast.success('Abriendo vista de impresión...', { id: 'print-ticket' })
                
                // 4. Limpieza postergada para Android (que renderiza en 2do plano)
                setTimeout(() => {
                    document.body.classList.remove('is-printing-ticket')
                    try {
                        const s = document.getElementById('print-style-native')
                        const c = document.getElementById('print-container-native')
                        if (s) document.head.removeChild(s)
                        if (c) document.body.removeChild(c)
                        URL.revokeObjectURL(blobUrl) // Liberar memoria
                    } catch (e) {
                        console.error('Print cleanup error:', e)
                    }
                }, 30000)
            }, 500)

        } catch (err) {
            console.error('Print error:', err)
            toast.error('Error al generar impresión', { id: 'print-ticket' })
            setIsPrinting(false)
        }
    }

    const handleShare = async () => {
        const ticketEl = ticketRef.current
        if (!ticketEl || isSharing) return

        setIsSharing(true)
        toast.loading('Generando imagen...', { id: 'share-ticket' })

        try {
            // Capturar el ticket como imagen PNG de alta calidad
            const dataUrl = await captureTicketAsImage(ticketEl)
            const blob = dataUrlToBlob(dataUrl)
            const fileName = `Renovacion_${ticketId}_${clienteNombre.replace(/\s+/g, '_')}.png`
            const file = new File([blob], fileName, { type: 'image/png' })

            // Intentar compartir como archivo de imagen
            const canShare = typeof navigator !== 'undefined' && 'share' in navigator
            const canShareFiles = canShare && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

            if (canShareFiles) {
                await navigator.share({
                    title: `Comprobante de Renovación #${ticketId}`,
                    files: [file]
                })
                toast.success('Compartido', { id: 'share-ticket' })
            } else if (canShare) {
                // Fallback: algunos dispositivos soportan share pero no archivos
                // Descargar imagen y compartir texto
                const link = document.createElement('a')
                link.href = dataUrl
                link.download = fileName
                link.click()
                toast.success('Imagen descargada', { id: 'share-ticket' })
            } else {
                // Desktop: descargar directamente
                const link = document.createElement('a')
                link.href = dataUrl
                link.download = fileName
                link.click()
                toast.success('Imagen descargada', { id: 'share-ticket' })
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Share error:', err)
                // Último fallback: copiar texto al portapapeles
                const text = `📄 Comprobante de Renovación #${ticketId}\n👤 ${clienteNombre}\n💰 Nuevo: $${formatMoney(montoNuevo)}\n📉 Saldo: -$${formatMoney(saldoAnterior)}\n✅ Efectivo: $${formatMoney(efectivoEntregar)}`
                try {
                    await navigator.clipboard.writeText(text)
                    toast.success('Texto copiado al portapapeles', { id: 'share-ticket' })
                } catch {
                    toast.error('Error al compartir', { id: 'share-ticket' })
                }
            } else {
                toast.dismiss('share-ticket')
            }
        } finally {
            setIsSharing(false)
        }
    }

    return (
        <div className="space-y-4 max-w-md mx-auto">
            <div ref={ticketRef} className="bg-white text-slate-900 rounded-3xl p-6 shadow-2xl relative overflow-hidden" id="renovacion-ticket">
                {/* Patterns for visual interest */}
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-slate-100 rounded-full blur-3xl opacity-50" />
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-blue-50 rounded-full blur-3xl opacity-50" />

                {/* Header */}
                <div className="relative text-center border-b border-slate-100 pb-4 mb-4">
                    <div className="flex justify-center mb-2">
                        {logoUrl ? (
                            <div className="h-14 w-14 rounded-xl overflow-hidden shadow-lg bg-slate-900 p-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                    src={logoUrl} 
                                    alt="ProFinanzas" 
                                    crossOrigin="anonymous"
                                    className="w-full h-full object-contain" 
                                />
                            </div>
                        ) : (
                            <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                                <Receipt className="h-6 w-6" />
                            </div>
                        )}
                    </div>
                    <h3 className="font-bold text-xl tracking-tight">Comprobante de Renovación</h3>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                        #{nuevoPrestamoId.split('-')[0].toUpperCase()} • {format(fecha, "d MMM, yyyy - hh:mm a", { locale: es })}
                    </p>
                </div>

                {/* Content */}
                <div className="space-y-4 relative">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Cliente</p>
                        <p className="font-semibold text-sm truncate">{clienteNombre}</p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">Nuevo Préstamo</span>
                            <span className="font-bold">${formatMoney(montoNuevo)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500">Saldo Anterior Liquidado</span>
                            <span className="text-red-500 font-medium">-${formatMoney(saldoAnterior)}</span>
                        </div>
                        <div className="border-t border-dashed border-slate-200 my-2" />
                        <div className="flex justify-between items-center text-lg">
                            <span className="font-bold text-slate-700">Efectivo a Entregar</span>
                            <span className="font-bold text-emerald-600">${formatMoney(efectivoEntregar)}</span>
                        </div>
                    </div>

                     {/* Detalles del Nuevo Crédito */}
                     <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                        <div className="bg-slate-50 p-2 rounded-lg text-center">
                            <span className="text-slate-400 block mb-0.5">Cuotas</span>
                            <span className="font-bold">{solicitud.cuotas}</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg text-center">
                            <span className="text-slate-400 block mb-0.5">Interés</span>
                            <span className="font-bold">{solicitud.interes}%</span>
                        </div>
                    </div>
                </div>
                
                {/* Footer Tear-off effect */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-center space-x-2 translate-y-1/2">
                    {[...Array(12)].map((_, i) => (
                        <div key={i} className="w-4 h-4 bg-slate-900 rounded-full" />
                    ))}
                </div>
            </div>

            <div className="flex gap-2 justify-center">
                <Button 
                    variant="outline" 
                    className="flex-1 bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                    onClick={handlePrint}
                    disabled={isPrinting}
                >
                    <Printer className="mr-2 h-4 w-4" /> {isPrinting ? 'Preparando...' : 'Imprimir'}
                </Button>
                <Button 
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg"
                    onClick={handleShare}
                    disabled={isSharing}
                >
                    <Share2 className="mr-2 h-4 w-4" /> {isSharing ? 'Generando...' : 'Compartir'}
                </Button>
            </div>
        </div>
    )
}
