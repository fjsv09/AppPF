'use client'

import React from 'react'
import { CheckCircle, ArrowRight, Clock } from 'lucide-react'
import { formatDatePeru, cn } from '@/lib/utils'
import { computeVirtualCronograma } from '@/lib/financial-logic'

interface VoucherContentProps {
    payment: any
    loan: any
    client: any
    cronograma?: any[]
    allPayments?: any[]
    logoUrl?: string
    isPrinting?: boolean
}

export function VoucherContent({ payment, loan, client, cronograma, allPayments, logoUrl, isPrinting = false }: VoucherContentProps) {
    if (!payment) return null

    // Asegurar compatibilidad de nombres de campos entre RPC y Componente
    const monto = Number(payment.monto_pagado || payment.pago_monto || 0);

    // Cálculo de progreso centralizado via cascade FIFO canónico
    const totalCuotas = Number(cronograma?.length || loan?.cuotas || 0)

    // Incluir el pago actual en la lista si no está ya (caso de voucher recién generado)
    const currentId = payment.id || 'current'
    const allPaymentsFiltered = (allPayments || []).filter(p => p.estado_verificacion !== 'rechazado')
    if (!allPaymentsFiltered.find(p => p.id === currentId)) {
        allPaymentsFiltered.push(payment)
    }

    const { cuotasPagadasVirtual: pagadas, saldoCuotaEnCurso: saldoCuotaActual, saldoTotalPendiente: saldoPendiente } =
        computeVirtualCronograma(cronograma ?? [], allPaymentsFiltered)

    // Cuotas atrasadas: usa pagadas (de computeVirtualCronograma) vs cuotas vencidas por fecha.
    // Evita falsos positivos en préstamos migrados donde monto_pagado está en cronograma_cuotas
    // pero no tiene registros equivalentes en la tabla pagos.
    const paymentDateStr = (() => {
        try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(payment.created_at || new Date())) }
        catch { return '' }
    })()
    const cuotasVencidasHastaHoy = (cronograma ?? []).filter(c => c.fecha_vencimiento <= paymentDateStr).length
    const cuotasAtrasadas = Math.max(0, cuotasVencidasHastaHoy - pagadas)

    const progressPct = totalCuotas > 0 ? (pagadas / totalCuotas) * 100 : 0;

    const theme = {
        bg: isPrinting ? 'bg-white' : 'bg-slate-900',
        textMain: isPrinting ? 'text-black' : 'text-white',
        textMuted: isPrinting ? 'text-black font-bold' : 'text-slate-500',
        textAccent: isPrinting ? 'text-black font-bold' : 'text-emerald-400',
        card: isPrinting ? 'bg-white border-black border-2 rounded-none shadow-none' : 'bg-slate-800/40 border-white/5 shadow-inner',
        border: isPrinting ? 'border-black' : 'border-white/5',
        headerBg: isPrinting ? 'bg-white border-b-2 border-black border-dashed' : 'bg-emerald-600',
        headerText: isPrinting ? 'text-black' : 'text-white'
    }

    return (
        <div className={`${theme.bg} overflow-hidden ${isPrinting ? 'w-[58mm] mx-auto text-black border-2 border-black p-1 print-clear' : ''}`}>
            {/* Removing top logo as it's now in the header */}


            {/* Header */}
            <div className={cn("text-center relative overflow-hidden", isPrinting ? "bg-white border-b-2 border-black border-dashed pt-2 pb-1 px-1" : "bg-emerald-600 p-7")}>
                {!isPrinting && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/30 pointer-events-none" />
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-black/10 rounded-full blur-2xl" />
                    </>
                )}
                <div className={cn(
                    "flex items-center justify-center mx-auto relative z-10 transition-all duration-700",
                    isPrinting 
                        ? "mb-1" 
                        : "w-20 h-20 bg-white/20 ring-4 ring-white/10 shadow-[0_0_30px_rgba(255,255,255,0.2)] rounded-full backdrop-blur-md hover:scale-110 mb-4 overflow-hidden"
                )}>
                    {logoUrl ? (
                        <div className={cn(
                            "flex items-center justify-center relative z-10",
                            isPrinting ? "w-20 h-12" : "w-14 h-14"
                        )}>
                            <img 
                                src={logoUrl} 
                                alt="ProFinanzas" 
                                crossOrigin="anonymous"
                                className={cn(
                                    "max-w-full max-h-full object-contain"
                                )} 
                            />
                        </div>
                    ) : (
                        <CheckCircle className={cn(
                            isPrinting ? "w-16 h-16 text-black" : "w-12 h-12 text-white"
                        )} />
                    )}
                </div>
                <h2 className={cn("font-black relative z-10 tracking-tight", isPrinting ? "text-lg text-black" : "text-3xl text-white drop-shadow-lg")}>
                    {payment.estado_verificacion === 'pendiente' ? '¡Pago Registrado!' : '¡Pago Exitoso!'}
                </h2>
                <p className={cn("uppercase font-bold tracking-[0.3em] relative z-10", isPrinting ? "text-black text-[7px] m-0 leading-none mt-0.5" : "text-emerald-50/70 text-[10px] mt-1")}>
                    {payment.estado_verificacion === 'pendiente' ? 'Operación pendiente de validación' : 'Transacción Procesada'}
                </p>
                {payment.estado_verificacion === 'pendiente' && !isPrinting && (
                    <div className="mt-3 relative z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-200 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        <Clock className="w-3 h-3" />
                        Esperando verificación de oficina
                    </div>
                )}
            </div>
            
            {/* Body */}
            <div className={cn("p-5 space-y-5", isPrinting && "p-1.5 space-y-1")}>
                {/* Amount Section */}
                <div className={cn(`text-center border-b border-dashed ${theme.border}`, isPrinting ? "py-0.5" : "py-2")}>
                    <span className={`${theme.textMuted} ${isPrinting ? 'text-[7px] mb-0 leading-none' : 'text-[9px] mb-1'} font-black uppercase tracking-[0.3em] block opacity-70`}>Monto de la Operación</span>
                    <div className="flex items-center justify-center gap-0.5">
                        <span className={`${theme.textMuted} font-bold mt-1 ${isPrinting ? 'text-[10px]' : 'text-lg'}`}>S/</span>
                        <span className={cn(`font-black ${theme.textMain} tracking-tighter tabular-nums drop-shadow-sm leading-none`, isPrinting ? "text-xl" : "text-5xl")}>
                            {Number(monto).toFixed(2)}
                        </span>
                    </div>
                </div>
                
                {/* Estado Actual Card */}
                <div className={cn(`${theme.card}`, isPrinting ? "p-1 mt-0.5" : "p-4 rounded-xl border")}>
                    <div className={cn(isPrinting ? "space-y-0.5" : "space-y-2.5")}>
                        <div className={cn("flex justify-between items-center", isPrinting ? "text-[9px] leading-none" : "text-xs")}>
                            <span className={theme.textMuted}>Progreso del Crédito</span>
                            <span className={`${theme.textAccent} font-black`}>{pagadas >= totalCuotas ? totalCuotas : Math.min((pagadas || 0) + (saldoCuotaActual > 0 ? 1 : 0), totalCuotas)} de {totalCuotas} cuotas</span>
                        </div>
                        <div className={`h-1.5 w-full ${isPrinting ? 'bg-white border border-black rounded-none h-2' : 'bg-slate-700/50 rounded-full'} overflow-hidden`}>
                           <div 
                                className={`h-full ${isPrinting ? 'bg-black rounded-none' : 'bg-emerald-500 rounded-full'} transition-all duration-500`} 
                                style={{ width: `${progressPct}%` }} 
                            />
                        </div>
                        <div className="flex flex-col pt-0.5">
                            {cuotasAtrasadas > 0 && (
                                 <div className="flex items-center justify-center gap-1.5 text-rose-600 font-black animate-bounce bg-rose-500/5 py-0.5 rounded-sm mb-0.5 border border-rose-500/20 border-dashed">
                                    <span className={cn(isPrinting ? "text-base" : "text-lg")}>{cuotasAtrasadas}</span>
                                    <span className={cn(isPrinting ? "text-[9px]" : "text-[10px]", "uppercase tracking-tighter")}>
                                        DEBE
                                    </span>
                                 </div>
                            )}
                            <div className="flex justify-between items-center text-[11px]">
                                <span className={cn(theme.textMuted, isPrinting && "text-[9px]")}>Deuda Restante</span>
                                <span className={cn(`${theme.textMain} font-black tabular-nums`, isPrinting ? "text-[12px]" : "text-sm")}>
                                    S/ {saldoPendiente.toFixed(2)}
                                </span>
                            </div>
                            {(saldoCuotaActual > 0) && (
                                <div className={cn("flex justify-between items-center text-[11px]", isPrinting ? "mt-0.5 pt-0.5 border-t border-dashed border-black/30" : "mt-1 pt-1 border-t border-slate-700/30")}>
                                    <span className={cn(theme.textMuted, isPrinting && "text-[9px]")}>Saldo</span>
                                    <span className={cn("text-blue-500 font-black tabular-nums", isPrinting ? "text-[12px]" : "text-sm")}>
                                        S/ {saldoCuotaActual.toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info List */}
                <div className={cn(isPrinting ? "pt-0.5 space-y-0 mt-0.5 border-t border-black border-dashed" : "pt-1 space-y-3")}>
                    <div className={cn("flex justify-between items-center", isPrinting ? "text-[8px] leading-tight" : "text-[11px]")}>
                        <span className={`${theme.textMuted} font-bold uppercase tracking-tighter`}>ID Operación</span>
                        <span className={`font-mono ${isPrinting ? 'text-black bg-white font-bold' : 'text-slate-400 bg-white/5'} ${isPrinting ? 'text-[7px]' : 'text-[10px]'} px-1 rounded`}>{(payment.id || '').toString().slice(-10).toUpperCase()}</span>
                    </div>
                    <div className={cn("flex justify-between items-center", isPrinting ? "text-[8px] leading-tight" : "text-[11px]")}>
                        <span className={`${theme.textMuted} font-bold uppercase tracking-tighter`}>DNI</span>
                        <span className={`${theme.textMain} font-mono ${isPrinting ? 'text-[8px]' : 'text-[10px]'}`}>{client?.dni || '---'}</span>
                    </div>
                    <div className={cn("flex justify-between items-start pt-0.5", isPrinting ? "text-[8px] leading-tight" : "text-[11px]")}>
                        <span className={`${theme.textMuted} font-bold uppercase tracking-tighter mt-0.5`}>Cliente</span>
                        <span className={`${theme.textMain} font-black text-right max-w-[75%] leading-tight ${isPrinting ? 'text-[9px]' : 'text-base'} italic uppercase tracking-tight`}>
                            {client?.nombres || 'Cliente'}
                        </span>
                    </div>
                    <div className={cn("flex justify-between items-center", isPrinting ? "text-[8px] leading-tight" : "text-[11px]")}>
                        <span className={`${theme.textMuted} font-bold uppercase tracking-tighter`}>Método de Pago</span>
                        <span className={`${theme.textMain} font-bold uppercase ${isPrinting ? 'text-[8px]' : 'text-[11px]'}`}>
                            {payment.metodo_pago === 'Efectivo' ? 'EFECTIVO' : 'DIGITAL'}
                        </span>
                    </div>
                    <div className={cn("flex justify-between items-center", isPrinting ? "text-[8px] leading-tight" : "text-[11px]")}>
                        <span className={`${theme.textMuted} font-bold uppercase tracking-tighter`}>Fecha y Hora</span>
                        <span className={`${theme.textMuted} font-medium font-mono ${isPrinting ? 'text-[7px]' : 'text-[10px]'}`}>
                            {formatDatePeru(payment.created_at || new Date().toISOString())}
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Watermark */}
            <div className={cn("text-center pointer-events-none", isPrinting ? "mt-0.5 pb-0.5 opacity-100 text-black" : "opacity-30 pb-4 mt-1")}>
                <span className="text-[7px] font-black uppercase tracking-[0.4em]">Sistema Financiero ProFinanzas</span>
            </div>
        </div>
    )
}


