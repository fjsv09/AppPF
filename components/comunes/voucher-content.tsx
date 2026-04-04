'use client'

import React from 'react'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { formatDatePeru } from '@/lib/utils'

interface VoucherContentProps {
    payment: any
    loan: any
    client: any
    cronograma?: any[]
    allPayments?: any[]
}

export function VoucherContent({ payment, loan, client, cronograma, allPayments }: VoucherContentProps) {
    if (!payment) return null

    // Asegurar compatibilidad de nombres de campos entre RPC y Componente
    const monto = payment.monto_pagado || payment.pago_monto || 0;

    // Lógica de cálculo de progreso (Idem PaymentVoucher original)
    const totalCuotas = cronograma?.length || loan?.cuotas || 0
    let pagadas = 0
    let cuotasAtrasadas = 0
    let saldoPendiente = 0
    
    if (cronograma && cronograma.length > 0) {
        const formatter = new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const paymentDateStr = formatter.format(new Date(payment.created_at || new Date()))
        
        const sortedPayments = [...(allPayments || [])].sort((a, b) => {
            const timeA = new Date(a.created_at).getTime()
            const timeB = new Date(b.created_at).getTime()
            if (timeA !== timeB) return timeA - timeB
            return (a.id || '').toString().localeCompare((b.id || '').toString())
        })
        
        const paymentIndex = sortedPayments.findIndex(p => p.id === payment.id)
        const paymentsAtThatTime = paymentIndex >= 0 ? sortedPayments.slice(0, paymentIndex + 1) : [payment]
        const totalPaidAtThatTime = paymentsAtThatTime.reduce((acc, p) => acc + parseFloat(p.monto_pagado || p.pago_monto || 0), 0)
        
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
        
        cuotasAtrasadas = virtualCronograma.filter(c => {
            const isPending = !c.isPagadaVirtual
            const isOverdueAtThatTime = c.fecha_vencimiento <= paymentDateStr;
            return isPending && isOverdueAtThatTime;
        }).length
    }

    return (
        <div className="bg-slate-900 overflow-hidden">
            {/* Header - Fixed to match Screenshot 1 */}
            <div className="bg-emerald-600 p-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm shadow-xl">
                    <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-extrabold text-white">¡Pago Exitoso!</h2>
                <p className="text-emerald-100 text-sm mt-1">La transacción se procesó correctamente.</p>
            </div>
            
            {/* Body */}
            <div className="p-8 space-y-8">
                {/* Amount Section */}
                <div className="flex justify-between items-center border-b border-white/5 pb-6">
                    <span className="text-slate-400 text-sm md:text-base font-medium">Monto Pagado</span>
                    <span className="text-3xl font-black text-white">S/ {Number(monto).toFixed(2)}</span>
                </div>
                
                {/* Estado Actual Card */}
                <div className="bg-slate-800/40 rounded-2xl p-5 border border-white/5 shadow-inner">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-4">Estado Actual</p>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm items-center">
                            <span className="text-slate-300">Progreso</span>
                            <span className="text-emerald-400 font-bold">{pagadas} de {totalCuotas} cuotas</span>
                        </div>
                        <div className="flex justify-between text-sm items-start">
                            <span className="text-slate-300">Atrasadas</span>
                            <div className="text-right">
                                {cuotasAtrasadas > 0 && (
                                     <span className="block text-xs text-rose-400 font-black mb-1">
                                        {cuotasAtrasadas} Cuotas Atrasadas
                                     </span>
                                )}
                                <span className="block text-white font-black text-base">
                                    Deuda Restante: S/ {saldoPendiente.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info List */}
                <div className="space-y-4 pt-2">
                    <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500 font-medium font-outfit uppercase tracking-tighter">Operación</span>
                        <span className="font-mono text-slate-300 text-xs px-2 py-0.5 bg-white/5 rounded">{(payment.id || '').toString().slice(-10).toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500 font-medium font-outfit uppercase tracking-tighter">Cliente</span>
                        <span className="text-slate-200 font-bold text-right max-w-[60%] truncate">{client?.nombres || 'Cliente'}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500 font-medium font-outfit uppercase tracking-tighter">Fecha</span>
                        <span className="text-slate-300 font-medium">
                            {formatDatePeru(payment.created_at || new Date().toISOString())}
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Watermark */}
            <div className="pb-6 text-center opacity-10 pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white">Sistema Financiero</span>
            </div>
        </div>
    )
}
