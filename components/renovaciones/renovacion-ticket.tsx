'use client'

import { Button } from '@/components/ui/button'
import { Download, Share2, Receipt, Printer } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { useRef } from 'react'

interface RenovacionTicketProps {
    solicitud: any
    saldoAnterior: number
    nuevoPrestamoId: string
    clienteNombre: string
}

import { formatMoney } from '@/utils/format'

export function RenovacionTicket({ solicitud, saldoAnterior, nuevoPrestamoId, clienteNombre }: RenovacionTicketProps) {
    const ticketRef = useRef<HTMLDivElement>(null)
    const montoNuevo = solicitud.monto_solicitado
    const efectivoEntregar = montoNuevo - saldoAnterior
    const fecha = new Date(solicitud.fecha_aprobacion || new Date())

    const handlePrint = () => {
        const ticketEl = ticketRef.current
        if (!ticketEl) return

        // Crear un iframe oculto para la impresión para evitar problemas en PWA iOS
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const printDoc = iframe.contentWindow?.document;
        if (!printDoc) return;

        printDoc.write(`
            <html>
                <head>
                    <title>Comprobante-${nuevoPrestamoId.split('-')[0]}</title>
                    <style>
                        body { 
                            font-family: system-ui, -apple-system, sans-serif; 
                            margin: 0; 
                            padding: 20px;
                            background: white;
                        }
                        .ticket {
                            max-width: 350px;
                            margin: 0 auto;
                            padding: 20px;
                            border: 1px solid #e2e8f0;
                            border-radius: 16px;
                        }
                        .header { text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 15px; }
                        .icon { width: 40px; height: 40px; background: #0f172a; border-radius: 8px; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; }
                        .title { font-size: 18px; font-weight: bold; margin: 0; }
                        .meta { font-size: 11px; color: #94a3b8; font-family: monospace; margin-top: 5px; }
                        .client-box { background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 15px; }
                        .client-label { font-size: 10px; color: #94a3b8; font-weight: bold; text-transform: uppercase; }
                        .client-name { font-weight: 600; font-size: 14px; }
                        .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
                        .label { color: #64748b; }
                        .value { font-weight: bold; }
                        .negative { color: #ef4444; }
                        .divider { border-top: 1px dashed #e2e8f0; margin: 10px 0; }
                        .total-row { font-size: 16px; }
                        .total-value { color: #10b981; font-weight: bold; }
                        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 15px; }
                        .detail-box { background: #f8fafc; padding: 8px; border-radius: 6px; text-align: center; }
                        .detail-label { font-size: 11px; color: #94a3b8; }
                        .detail-value { font-weight: bold; font-size: 14px; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="ticket">
                        <div class="header">
                            <div class="icon">📄</div>
                            <h1 class="title">Comprobante de Renovación</h1>
                            <p class="meta">#${nuevoPrestamoId.split('-')[0].toUpperCase()} • ${format(fecha, "d MMM, yyyy", { locale: es })}</p>
                        </div>
                        <div class="client-box">
                            <div class="client-label">Cliente</div>
                            <div class="client-name">${clienteNombre}</div>
                        </div>
                        <div class="row">
                            <span class="label">Nuevo Préstamo</span>
                            <span class="value">$${formatMoney(montoNuevo)}</span>
                        </div>
                        <div class="row">
                            <span class="label">Saldo Anterior</span>
                            <span class="value negative">-$${formatMoney(saldoAnterior)}</span>
                        </div>
                        <div class="divider"></div>
                        <div class="row total-row">
                            <span class="label"><strong>Efectivo a Entregar</strong></span>
                            <span class="total-value">$${formatMoney(efectivoEntregar)}</span>
                        </div>
                        <div class="details">
                            <div class="detail-box">
                                <div class="detail-label">Cuotas</div>
                                <div class="detail-value">${solicitud.cuotas}</div>
                            </div>
                            <div class="detail-box">
                                <div class="detail-label">Interés</div>
                                <div class="detail-value">${solicitud.interes}%</div>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
        `)
        printDoc.close()

        // Esperar a que el contenido se cargue y disparar impresión
        setTimeout(() => {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            
            // Limpieza: remover el iframe después de un momento
            setTimeout(() => {
                document.body.removeChild(iframe)
            }, 1000)
            
            toast.success('Listo para imprimir/guardar')
        }, 300)
    }

    const handleShare = async () => {
        // Crear texto para compartir
        const text = `📄 *Comprobante de Renovación*
#${nuevoPrestamoId.split('-')[0].toUpperCase()}

👤 Cliente: ${clienteNombre}
💰 Nuevo Préstamo: $${formatMoney(montoNuevo)}
📉 Saldo Anterior: -$${formatMoney(saldoAnterior)}
✅ *Efectivo a Entregar: $${formatMoney(efectivoEntregar)}*

📊 ${solicitud.cuotas} cuotas | ${solicitud.interes}% interés
📅 ${format(fecha, "d MMM, yyyy", { locale: es })}`

        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Comprobante de Renovación',
                    text: text
                })
                toast.success('Compartido')
            } else {
                await navigator.clipboard.writeText(text)
                toast.success('Copiado al portapapeles')
            }
        } catch {
            await navigator.clipboard.writeText(text)
            toast.success('Copiado al portapapeles')
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
                        <div className="h-12 w-12 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                            <Receipt className="h-6 w-6" />
                        </div>
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
                >
                    <Printer className="mr-2 h-4 w-4" /> Imprimir
                </Button>
                <Button 
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg"
                    onClick={handleShare}
                >
                    <Share2 className="mr-2 h-4 w-4" /> Compartir
                </Button>
            </div>
        </div>
    )
}

