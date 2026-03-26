'use client'

import { useState, useMemo } from 'react'
import { format, isAfter, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wallet, Calendar, CheckCircle2, XCircle, ArrowRightCircle, Receipt, User, CheckCircle, ShieldAlert, Clock } from 'lucide-react'
import { cn, formatDatePeru } from '@/lib/utils'
import { PaymentVoucher } from './payment-voucher'

export function DailyCollectorLog({ cronograma, pagos, prestamo, cliente, userRole = 'asesor' }: any) {
    const [selectedPayment, setSelectedPayment] = useState<any>(null)
    const [isVoucherOpen, setIsVoucherOpen] = useState(false)
    const today = startOfDay(new Date())

    const allRows = useMemo(() => {
        if (!cronograma) return []
        const qDates = cronograma.map((c: any) => c.fecha_vencimiento)
        const pDates = (pagos || []).map((p: any) => formatDatePeru(p.created_at, 'isoDate'))
        const dates = Array.from(new Set([...qDates, ...pDates])).sort()
        return dates.map(d => ({
            date: d,
            cuota: cronograma.find((c: any) => c.fecha_vencimiento === d),
            physical: (pagos || []).filter((p: any) => formatDatePeru(p.created_at, 'isoDate') === d)
        }))
    }, [cronograma, pagos])

    if (allRows.length === 0) return <div className="py-10 text-center text-slate-500 font-bold uppercase text-[10px]">Sin datos</div>

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/10 p-3 rounded-xl">
                <div className="p-2 rounded-lg bg-blue-500/10"><Wallet className="w-5 h-5 text-blue-400" /></div>
                <div><h3 className="text-sm font-black text-blue-400 uppercase tracking-tighter">Bitácora de Recaudación Real</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Trazabilidad de Activos</p></div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950/80 uppercase font-black text-slate-500 border-b border-slate-800 text-[9px]">
                            <tr>
                                <th className="px-3 py-4 text-center w-10">#</th>
                                <th className="px-3 py-4 min-w-[100px]">Calendario</th>
                                <th className="px-3 py-4 w-12 text-center">Hora</th>
                                <th className="px-3 py-4 min-w-[70px]">Asesor</th>
                                <th className="px-3 py-4 text-center w-20">Cuota</th>
                                <th className="px-3 py-4 text-center w-24">Recaudación</th>
                                <th className="px-3 py-4 w-24 text-center">Método</th>
                                <th className="px-3 py-4 min-w-[140px]">Evidencia / Destino</th>
                                {userRole !== 'asesor' && <th className="px-3 py-4 text-center w-10">Audit</th>}
                                <th className="px-3 py-4 text-center w-20">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {allRows.map(({ date, cuota, physical }) => {
                                const totalDay = physical.reduce((s: any, p: any) => s + Number(p.monto_pagado), 0)
                                const qDate = startOfDay(new Date(date + 'T12:00:00')), isFuture = isAfter(qDate, today), isVirtual = !cuota
                                const cVal = cuota ? Number(cuota.monto_cuota || 0) : 0, pVal = cuota ? Number(cuota.monto_pagado || 0) : 0
                                const isFull = cuota ? (pVal >= (cVal - 0.01)) : false, isPart = cuota ? (pVal > 0 && !isFull) : false

                                let st = { l: "FALLÓ", c: "text-rose-500 bg-rose-500/10", bg: "bg-rose-500/5" }
                                if (isVirtual) st = { l: "EXTRA", c: "text-emerald-400 bg-emerald-500/10", bg: "bg-emerald-500/5" }
                                else if (isFull) {
                                  if (totalDay > 0) st = { l: "CUMPLIÓ", c: "text-emerald-400 bg-emerald-500/10", bg: "bg-emerald-500/5" }
                                  else st = { l: "SISTEMA", c: "text-sky-400 bg-sky-500/10", bg: "bg-sky-500/5" }
                                } else if (isPart) {
                                  if (totalDay > 0) st = { l: "ABONÓ", c: "text-amber-400 bg-amber-500/10", bg: "bg-amber-500/5" }
                                  else st = { l: "SISTEMA", c: "text-sky-400 bg-sky-500/10", bg: "bg-sky-500/5" }
                                } else if (isFuture) st = { l: "PENDIENTE", c: "text-slate-500 bg-slate-800/20", bg: "" }

                                return (
                                    <tr key={date} className={cn("group transition-colors text-[10px]", st.bg)}>
                                        <td className="px-3 py-4 text-center font-black text-slate-700">{cuota?.numero_cuota || 'EXT'}</td>
                                        <td className="px-3 py-4 font-bold uppercase text-slate-400">
                                            <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-600" />{format(qDate, "eee d MMM", { locale: es })}</div>
                                            {isVirtual && <span className="text-[7px] text-blue-500 font-extrabold block mt-0.5 ml-4">COBRO EXTRA</span>}
                                        </td>
                                        <td className="px-3 py-4 text-center">
                                            <div className="flex flex-col gap-2 font-bold items-center">
                                                {physical.map((p: any) => <div key={p.id} className="flex items-center gap-1 text-slate-300"><Clock className="w-2.5 h-2.5 text-blue-500" />{formatDatePeru(p.created_at, "time")}</div>)}
                                                {physical.length === 0 && <span className="text-slate-800">--:--</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <div className="flex flex-col gap-2 font-bold text-slate-400">
                                                {physical.map((p: any) => <div key={p.id} className="truncate max-w-[60px]"><User className="w-2 h-2 inline mr-0.5" />{p.perfiles?.nombre_completo?.split(' ')[0]}</div>)}
                                                {physical.length === 0 && <span className="text-slate-800">---</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-center font-black text-slate-500">
                                            {cuota ? `S/ ${cVal}` : '---'}
                                        </td>
                                        <td className="px-3 py-4 text-center">
                                            <div className="flex flex-col gap-1 items-center">
                                                {physical.map((p: any) => (
                                                    <div key={p.id} className="flex items-center gap-1.5 bg-slate-950/40 px-1.5 py-1 rounded border border-slate-800/50 w-full group/v">
                                                        <span className="text-[10px] font-black text-emerald-400 flex-1 text-left">S/ {Number(p.monto_pagado)}</span>
                                                        <Button size="sm" variant="ghost" onClick={() => { setSelectedPayment(p); setIsVoucherOpen(true); }} className="h-4 w-4 p-0 text-slate-600 hover:text-emerald-400"><Receipt className="w-2.5 h-2.5" /></Button>
                                                    </div>
                                                ))}
                                                {physical.length === 0 && <span className="text-slate-800 font-black">S/ 0</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-center">
                                            <div className="flex flex-col gap-2 items-center">
                                                {physical.map((p: any) => <Badge key={p.id} variant="outline" className="text-[7px] font-black h-3.5 px-1 py-0 bg-slate-900 text-slate-500 border-slate-800 uppercase">{p.metodo_pago}</Badge>)}
                                                {physical.length === 0 && <span className="text-slate-800">---</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <div className="space-y-0.5">
                                                {totalDay > 0 && <div className="text-emerald-500/80 font-black uppercase text-[8px] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Cobro en ruta</div>}
                                                {isVirtual && <p className="text-[8px] text-emerald-400/60 leading-tight italic">Dinero aplicado a deudas.</p>}
                                                {cuota && isFull && totalDay === 0 && <p className="text-[8px] text-sky-400 leading-tight italic flex items-center gap-1"><ArrowRightCircle className="w-3 h-3" /> Saldada mediante excedente previo.</p>}
                                                {cuota && !isFuture && totalDay === 0 && !isFull && <p className="text-[8px] text-rose-500/50 uppercase font-black flex items-center gap-1"><XCircle className="w-3 h-3" /> Faltante</p>}
                                            </div>
                                        </td>
                                        {userRole !== 'asesor' && <td className="px-3 py-4 text-center"><div className="flex flex-col gap-2 items-center">{physical.map((p: any) => <div key={p.id}>{p.voucher_compartido ? <CheckCircle className="w-2.5 h-2.5 text-emerald-500" /> : <ShieldAlert className="w-2.5 h-2.5 text-red-500" />}</div>)}</div></td>}
                                        <td className="px-3 py-4 text-center"><Badge variant="outline" className={cn("text-[8px] font-black uppercase tracking-tighter h-5", st.c)}>{st.l}</Badge></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <PaymentVoucher open={isVoucherOpen} onOpenChange={setIsVoucherOpen} payment={selectedPayment} allPayments={pagos} loan={prestamo} client={cliente || prestamo.clientes} cronograma={cronograma} userRole={userRole} />
        </div>
    )
}
