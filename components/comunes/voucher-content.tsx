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
    logoUrl?: string
}

export function VoucherContent({ payment, loan, client, cronograma, allPayments, logoUrl }: VoucherContentProps) {
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
        
        // 1. Obtener todos los pagos realizados hasta este momento (inclusive)
        // Si no tenemos allPayments, usamos solo el pago actual como fallback
        const currentId = payment.id || 'current';
        const sortedPayments = [...(allPayments || [])];
        
        // Si el pago actual no está en la lista (pasa en registros nuevos), lo añadimos para el cálculo
        if (!sortedPayments.find(p => p.id === currentId)) {
            sortedPayments.push(payment);
        }

        // Ordenar por fecha y luego ID para consistencia
        sortedPayments.sort((a, b) => {
            const timeA = new Date(a.created_at || 0).getTime()
            const timeB = new Date(b.created_at || 0).getTime()
            if (timeA !== timeB) return timeA - timeB
            return (a.id || '').toString().localeCompare((b.id || '').toString())
        })
        
        const paymentIndex = sortedPayments.findIndex(p => p.id === currentId)
        const paymentsAtThatTime = paymentIndex >= 0 ? sortedPayments.slice(0, paymentIndex + 1) : [payment]
        const totalPaidAtThatTime = paymentsAtThatTime.reduce((acc, p) => acc + Number(p.monto_pagado || p.pago_monto || 0), 0)
        
        let remainingToDistribute = totalPaidAtThatTime
        const cronogramaOrdenado = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota)
        
        const virtualCronograma = cronogramaOrdenado.map(c => {
            const montoCuota = Number(c.monto_cuota || 0)
            let pagadoEnEstaCuota = 0
            if (remainingToDistribute >= montoCuota - 0.01) {
                pagadoEnEstaCuota = montoCuota
                remainingToDistribute -= montoCuota
            } else if (remainingToDistribute > 0) {
                pagadoEnEstaCuota = Math.round(remainingToDistribute * 100) / 100
                remainingToDistribute = 0
            }
            return {
                ...c,
                monto_pagado_virtual: pagadoEnEstaCuota,
                isPagadaVirtual: pagadoEnEstaCuota >= (montoCuota - 0.01)
            }
        })
        
        pagadas = virtualCronograma.filter(c => c.isPagadaVirtual).length
        saldoPendiente = Math.max(0, virtualCronograma.reduce((acc, c) => acc + (Number(c.monto_cuota || 0) - c.monto_pagado_virtual), 0))
        
        cuotasAtrasadas = virtualCronograma.filter(c => {
            const isPending = !c.isPagadaVirtual
            const isOverdueAtThatTime = c.fecha_vencimiento < paymentDateStr;
            return isPending && isOverdueAtThatTime;
        }).length
    }

    return (
        <div className="bg-slate-900 overflow-hidden">
            {/* Logo Section - Compact */}
            {logoUrl && (
                <div className="bg-slate-900 pt-4 pb-2 flex justify-center border-b border-white/5">
                    <img src={logoUrl} alt="ProFinanzas" className="h-10 w-auto object-contain brightness-0 invert opacity-40" />
                </div>
            )}

            {/* Header - More Compact */}
            <div className="bg-emerald-600 p-5 sm:p-6 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2 backdrop-blur-sm shadow-lg relative z-10">
                    <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-black text-white relative z-10 tracking-tight">¡Pago Exitoso!</h2>
                <p className="text-emerald-100 text-[10px] uppercase font-bold opacity-80 relative z-10 tracking-[0.2em]">Transacción Procesada</p>
            </div>
            
            {/* Body - Denser layout */}
            <div className="p-5 sm:p-6 space-y-5">
                {/* Amount Section - Bigger value, less padding */}
                <div className="flex justify-between items-baseline border-b border-white/5 pb-4">
                    <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Monto Pagado</span>
                    <span className="text-3xl font-black text-white tracking-tighter">S/ {Number(monto).toFixed(2)}</span>
                </div>
                
                {/* Estado Actual Card - Tighter spacing */}
                <div className="bg-slate-800/40 rounded-xl p-4 border border-white/5 shadow-inner">
                    <div className="space-y-2.5">
                        <div className="flex justify-between text-xs items-center">
                            <span className="text-slate-400 font-medium">Progreso del Crédito</span>
                            <span className="text-emerald-400 font-black">{pagadas} de {totalCuotas} cuotas</span>
                        </div>
                        <div className="h-1 w-full bg-slate-700/50 rounded-full overflow-hidden">
                           <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(pagadas/totalCuotas)*100}%` }} />
                        </div>
                        <div className="flex justify-between text-[11px] items-start pt-1">
                            <span className="text-slate-400 font-medium">Deuda Restante</span>
                            <div className="text-right">
                                {cuotasAtrasadas > 0 && (
                                     <span className="block text-[9px] text-rose-500 font-black mb-0.5">
                                        {cuotasAtrasadas} Cuotas Atrasadas
                                     </span>
                                )}
                                <span className="block text-white font-black text-sm">
                                    S/ {saldoPendiente.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info List - Tighter spacing */}
                <div className="space-y-3 pt-1">
                    <div className="flex justify-between text-[11px] items-center">
                        <span className="text-slate-500 font-bold uppercase tracking-tighter">ID Operación</span>
                        <span className="font-mono text-slate-400 text-[10px] px-1.5 py-0.5 bg-white/5 rounded">{(payment.id || '').toString().slice(-10).toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-[11px] items-center">
                        <span className="text-slate-500 font-bold uppercase tracking-tighter">Cliente</span>
                        <span className="text-slate-300 font-black text-right max-w-[65%] truncate italic">{client?.nombres || 'Cliente'}</span>
                    </div>
                    <div className="flex justify-between text-[11px] items-center">
                        <span className="text-slate-500 font-bold uppercase tracking-tighter">Fecha y Hora</span>
                        <span className="text-slate-400 font-medium font-mono text-[10px]">
                            {formatDatePeru(payment.created_at || new Date().toISOString())}
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Watermark - Smaller */}
            <div className="pb-4 text-center opacity-10 pointer-events-none">
                <span className="text-[8px] font-black uppercase tracking-[0.4em] text-white">Sistema Financiero ProFinanzas</span>
            </div>
        </div>
    )
}

