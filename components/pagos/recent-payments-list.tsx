'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DollarSign, TrendingUp } from 'lucide-react'
import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface RecentPaymentsListProps {
    pagos: any[]
    totalRecords: number
    currentPage: number
    pageSize: number
}

export function RecentPaymentsList({ pagos, totalRecords, currentPage, pageSize }: RecentPaymentsListProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    
    const totalPages = Math.ceil(totalRecords / pageSize)

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('p_page', String(page))
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }

    return (
        <div className="lg:col-span-2 space-y-4">
            <h2 className="section-title">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                Pagos Recientes
            </h2>

            <div className="content-card">
                <div className="divide-y divide-slate-800/50">
                    {pagos.map((pago: any) => (
                        <div key={pago.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between gap-4 group cursor-default">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition-all">
                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                    <div className="font-medium text-slate-200 text-sm group-hover:text-white transition-colors flex items-center gap-2">
                                        {pago.cronograma_cuotas?.prestamos?.clientes?.nombres || 'Cliente'}
                                        {pago.metodo_pago && pago.metodo_pago !== 'Efectivo' && (
                                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                                                {pago.metodo_pago}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                                        {format(new Date(pago.fecha_pago), 'dd MMM', { locale: es })} • Cuota #{pago.cronograma_cuotas?.numero_cuota || '-'}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="text-right">
                                <div className="text-base font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                    +${pago.monto_pagado}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {(!pagos || pagos.length === 0) && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <div className="w-14 h-14 bg-slate-800/50 rounded-full flex items-center justify-center mb-3 border border-slate-800">
                                <span className="text-xl">⏳</span>
                            </div>
                            <h3 className="font-medium text-slate-400">Sin movimientos</h3>
                            <p className="text-sm text-slate-600 mt-1 text-center max-w-[180px]">
                                Los pagos históricos aparecerán aquí
                            </p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-slate-800">
                    <PaginationControlled 
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        totalRecords={totalRecords}
                        pageSize={pageSize}
                    />
                </div>
            </div>
        </div>
    )
}
