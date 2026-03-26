'use client'

import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, Share2, Loader2 } from 'lucide-react'
import { toBlob } from 'html-to-image'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '@/services/api'
import { formatDatePeru } from '@/lib/utils'

interface PaymentVoucherProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    payment: any // Tipar mejor si es posible con tus tipos generados
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

    const totalCuotas = cronograma?.length || loan?.cuotas || 0
    let pagadas = 0
    let cuotasAtrasadas = 0
    let saldoPendiente = 0
    let cuotaActual = 0
    
    if (cronograma && cronograma.length > 0) {
        // Usar formato Peru (Lima) para comparar fechas y evitar desfase por UTC
        const formatter = new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const paymentDateStr = formatter.format(new Date(payment.created_at))
        
        // 1. Obtener todos los pagos hasta esta fecha inclusive (Orden estable por fecha e ID)
        const sortedPayments = [...(allPayments || [])].sort((a, b) => {
            const timeA = new Date(a.created_at).getTime()
            const timeB = new Date(b.created_at).getTime()
            if (timeA !== timeB) return timeA - timeB
            return a.id.localeCompare(b.id) // Tie-breaker estable
        })
        const paymentIndex = sortedPayments.findIndex(p => p.id === payment.id)
        const paymentsAtThatTime = paymentIndex >= 0 ? sortedPayments.slice(0, paymentIndex + 1) : [payment]
        
        // 2. Sumar el volumen total de todos los pagos hasta ese momento
        const totalPaidAtThatTime = paymentsAtThatTime.reduce((acc, p) => acc + parseFloat(p.monto_pagado || 0), 0)
        
        // 3. Distribuir el volumen total en cascada (FIFO) sobre el cronograma
        // Esto garantiza que el "Progreso" (X de 24) coincida con el volumen de dinero pagado
        let remainingToDistribute = totalPaidAtThatTime
        const cronogramaOrdenado = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota)
        
        const virtualCronograma = cronogramaOrdenado.map(c => {
            const montoCuota = parseFloat(c.monto_cuota)
            let pagadoEnEstaCuota = 0
            
            if (remainingToDistribute >= montoCuota - 0.01) {
                pagadoEnEstaCuota = montoCuota
                remainingToDistribute -= montoCuota
            } else if (remainingToDistribute > 0) {
                pagadoEnEstaCuota = remainingToDistribute
                remainingToDistribute = 0
            }
            
            return {
                ...c,
                monto_pagado_virtual: pagadoEnEstaCuota,
                isPagadaVirtual: pagadoEnEstaCuota >= (montoCuota - 0.01)
            }
        })
        
        pagadas = virtualCronograma.filter(c => c.isPagadaVirtual).length
        saldoPendiente = virtualCronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - c.monto_pagado_virtual), 0)
        
        // La cuota actual relativa a ESTE pago
        cuotaActual = payment.cronograma_cuotas?.numero_cuota || (virtualCronograma.find(c => !c.isPagadaVirtual)?.numero_cuota || totalCuotas)

        // Cuotas atrasadas A ESA FECHA (incluyendo la del día actual por ser cierre de ruta)
        cuotasAtrasadas = virtualCronograma.filter(c => {
            const isPending = !c.isPagadaVirtual
            const isOverdueAtThatTime = c.fecha_vencimiento <= paymentDateStr;
            return isPending && isOverdueAtThatTime;
        }).length
    }

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
                <div ref={receiptRef} className="bg-slate-900 relative">
                    {/* Header */}
                    <div className="bg-emerald-600 p-6 text-center">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                            <CheckCircle className="w-10 h-10 text-white" />
                        </div>
                        <DialogTitle className="text-2xl font-bold text-white">Comprobante de Pago</DialogTitle>
                        <p className="text-emerald-100 text-sm mt-1">Transacción completada</p>
                    </div>
                    
                    {/* Body */}
                    <div className="p-6 space-y-6 pt-6">
                        <div className="space-y-4">
                            {/* Amount */}
                            <div className="flex justify-between items-center border-b border-white/5 pb-4">
                                <span className="text-slate-400 text-sm">Monto Pagado</span>
                                <span className="text-3xl font-bold text-white">${Number(payment.monto_pagado).toFixed(2)}</span>
                            </div>
                            
                            {/* DEBT SUMMARY - Updated based on cronograma-client */}
                            <div className="bg-slate-800/80 rounded-lg p-3 border border-white/10">
                                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Estado Actual</p>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-slate-300">Progreso</span>
                                    <span className="text-emerald-400 font-bold">{pagadas} de {totalCuotas} cuotas</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-300">Atrasadas</span>
                                    <div className="text-right">
                                        {cuotasAtrasadas > 0 && (
                                             <span className="block text-xs text-red-400 font-bold mb-0.5">
                                                {cuotasAtrasadas} Cuotas Atrasadas
                                             </span>
                                        )}
                                        <span className="block text-white font-bold">
                                            Deuda Restante: ${saldoPendiente.toFixed(2)}
                                        </span>
                                    </div>
                                </div>


                            </div>

                            {/* Info Rows */}
                            <div className="space-y-3 pt-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">ID Operación</span>
                                    <span className="font-mono text-slate-300 text-xs">{payment.id.slice(-10).toUpperCase()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Cliente</span>
                                    <span className="text-slate-300 font-medium text-right max-w-[60%] truncate">{client?.nombres || 'Cliente'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Fecha</span>
                                    <span className="text-slate-300">
                                        {formatDatePeru(payment.created_at)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Registrado por</span>
                                    <span className="text-slate-400 italic text-xs">
                                        {payment.perfiles?.nombre_completo || 'Sistema'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                     {/* Watermark/Footer inside image */}
                    <div className="absolute bottom-2 left-0 right-0 text-center opacity-10 pointer-events-none">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white">Sistema Financiero</span>
                    </div>
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
