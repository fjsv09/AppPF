'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Receipt, History, User, CheckCircle, ShieldAlert } from 'lucide-react'
import { PaymentVoucher } from './payment-voucher'

interface PaymentHistoryProps {
    pagos: any[]
    prestamo: any
    cliente: any
    cronograma?: any[]
    userRole?: 'admin' | 'supervisor' | 'asesor'
}

export function PaymentHistory({ pagos, prestamo, cliente, cronograma, userRole = 'asesor' }: PaymentHistoryProps) {
    const [selectedPayment, setSelectedPayment] = useState<any>(null)
    const [isVoucherOpen, setIsVoucherOpen] = useState(false)

    const handleViewVoucher = (pago: any) => {
        setSelectedPayment(pago)
        setIsVoucherOpen(true)
    }

    if (!pagos || pagos.length === 0) {
        return (
            <div className="space-y-4 pt-4">
                <Card className="bg-slate-900/50 border-slate-800/50 shadow-none">
                    <CardContent className="p-8 text-center">
                        <p className="text-slate-500 text-sm">No hay pagos registrados para este préstamo.</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-950/50 text-[9px] md:text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th className="px-2 md:px-4 py-3 font-bold">Fecha Pago</th>
                                    <th className="px-2 md:px-4 py-3 font-bold text-center">Cuota / Vencimiento</th>
                                    <th className="px-2 md:px-4 py-3 text-right">
                                        <span className="md:hidden">Monto</span>
                                        <span className="hidden md:inline">Monto Total</span>
                                    </th>
                                    <th className="hidden md:table-cell px-4 py-3">Registrado Por</th>
                                    <th className="px-2 md:px-4 py-3 text-center">Método</th>
                                    {(userRole === 'admin' || userRole === 'supervisor') && (
                                        <th className="px-2 md:px-4 py-3 text-center">Auditoría</th>
                                    )}
                                    <th className="px-2 md:px-4 py-3 text-center w-12 md:w-24">Recibo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {pagos.map((pago) => (
                                    <tr key={pago.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-2 md:px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-slate-300 font-medium text-[9px] md:text-sm">
                                                    <span className="md:hidden">{format(new Date(pago.created_at), "d MMM", { locale: es })}</span>
                                                    <span className="hidden md:inline">{format(new Date(pago.created_at), "d MMMM yyyy", { locale: es })}</span>
                                                </span>
                                                <span className="text-slate-500 text-[8px] md:text-xs">
                                                    {format(new Date(pago.created_at), "HH:mm", { locale: es })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                                                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 md:h-4 md:px-1.5 border-slate-700 bg-slate-800/50 text-slate-300 font-bold">
                                                        #{pago.cronograma_cuotas?.numero_cuota || '?'}
                                                    </Badge>
                                                </div>
                                                <span className="text-slate-500 text-[8px] md:text-[10px] whitespace-nowrap uppercase font-medium">
                                                    Venció: {pago.cronograma_cuotas?.fecha_vencimiento ? format(new Date(pago.cronograma_cuotas.fecha_vencimiento + 'T12:00:00'), "dd/MM/yyyy") : 'N/A'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-right">
                                            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 md:px-2 py-0.5 md:py-1 rounded border border-emerald-500/20 text-[10px] md:text-sm">
                                                <span className="md:hidden">${Number(pago.monto_pagado).toFixed(0)}</span>
                                                <span className="hidden md:inline">${Number(pago.monto_pagado).toFixed(2)}</span>
                                            </span>
                                        </td>
                                        <td className="hidden md:table-cell px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                                                    <User className="w-3 h-3 text-slate-400" />
                                                </div>
                                                <span className="text-slate-400 text-xs truncate max-w-[150px]">
                                                    {pago.perfiles?.nombre_completo || 'Sistema'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-4 py-3 text-center">
                                            {pago.metodo_pago ? (
                                                <Badge variant="outline" className={`text-[8px] md:text-[10px] px-1 md:px-2 py-0 h-4 md:h-5 ${
                                                    (pago.metodo_pago === 'Renovación' || pago.metodo_pago === 'Refinanciamiento')
                                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                                                        : pago.metodo_pago === 'Efectivo' 
                                                            ? 'bg-slate-800 text-slate-300 border-slate-700' 
                                                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                }`}>
                                                    <span className="md:hidden">{pago.metodo_pago === 'Efectivo' ? 'EFEC' : pago.metodo_pago === 'Renovación' ? 'RENOV' : pago.metodo_pago === 'Refinanciamiento' ? 'REFIN' : 'YAPE'}</span>
                                                    <span className="hidden md:inline">{pago.metodo_pago}</span>
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-600 text-[8px] italic">N/A</span>
                                            )}
                                        </td>
                                        {(userRole === 'admin' || userRole === 'supervisor') && (
                                            <td className="px-2 md:px-4 py-3 text-center">
                                                <div className="flex justify-center items-center gap-1">
                                                    {pago.es_autopago_renovacion ? (
                                                        <>
                                                            <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                                                            <span className="hidden md:inline text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Sistema</span>
                                                        </>
                                                    ) : pago.voucher_compartido ? (
                                                        <>
                                                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                            <span className="hidden md:inline text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">Compartido</span>
                                                        </>
                                                    ) : cliente?.excepcion_voucher ? (
                                                        <>
                                                            <ShieldAlert className="w-3.5 h-3.5 text-purple-500" />
                                                            <span className="hidden md:inline text-[10px] font-bold text-purple-400 uppercase tracking-tighter">Excepción</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="w-2 h-2 rounded-full bg-red-500 md:hidden" />
                                                            <span className="hidden md:inline text-[10px] font-bold text-red-500 uppercase tracking-tighter">No Enviado</span>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-2 md:px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    onClick={() => handleViewVoucher(pago)}
                                                    className="h-7 w-7 p-0 md:w-auto md:h-7 md:px-3 hover:bg-slate-800 text-slate-400 hover:text-blue-400"
                                                >
                                                    <Receipt className="w-4 h-4 md:mr-2" />
                                                    <span className="hidden lg:inline text-[11px] font-medium text-slate-400">Recibo</span>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                </div>
            </div>

            <PaymentVoucher 
                open={isVoucherOpen} 
                onOpenChange={setIsVoucherOpen}
                payment={selectedPayment}
                allPayments={pagos}
                loan={prestamo}
                client={cliente}
                cronograma={cronograma}
                userRole={userRole}
            />
        </div>
    )
}
