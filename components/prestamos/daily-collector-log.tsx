'use client'

import { useState, useMemo } from 'react'
import { format, isAfter, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wallet, Calendar, CheckCircle2, XCircle, ArrowRightCircle, Receipt, User, CheckCircle, ShieldAlert, Clock, Lock, DollarSign, Pencil } from 'lucide-react'
import { cn, formatDatePeru } from '@/lib/utils'
import { PaymentVoucher } from './payment-voucher'
import { QuickPayModal } from './quick-pay-modal'
import { EditPaymentModal } from './edit-payment-modal'
import { VisitActionButton } from './visit-action-button'
import { useRouter } from 'next/navigation'
import { api } from '@/services/api'

export function DailyCollectorLog({ 
    cronograma, 
    pagos, 
    prestamo, 
    cliente, 
    userRole = 'asesor',
    systemSchedule,
    isBlockedByCuadre,
    blockReasonCierre,
    systemAccess,
    cuadresHoy = []
}: any) {
    const router = useRouter()
    const [selectedPayment, setSelectedPayment] = useState<any>(null)
    const [isVoucherOpen, setIsVoucherOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [quickPayOpen, setQuickPayOpen] = useState(false)
    const today = startOfDay(new Date())
    const todayStr = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Lima', 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
    }).format(new Date())

    // Función auxiliar para determinar si un pago individual está bloqueado por cuadres
    const isPaymentLocked = (payment: any) => {
        if (!cuadresHoy || cuadresHoy.length === 0) return false;
        
        // Filtramos los cuadres del asesor que registró el pago
        const advisorCuadres = cuadresHoy.filter((c: any) => c.asesor_id === payment.registrado_por);
        if (advisorCuadres.length === 0) return false;

        // 1. Si hay un cierre final, todo el día está bloqueado
        const tieneFinal = advisorCuadres.some((c: any) => c.tipo_cuadre === 'final');
        if (tieneFinal) return true;

        // 2. Si el pago es anterior a cualquier cuadre (parcial o mañana), está bloqueado
        const paymentTime = new Date(payment.created_at).getTime();
        const tieneCuadrePosterior = advisorCuadres.some((c: any) => new Date(c.created_at).getTime() > paymentTime);
        
        return tieneCuadrePosterior;
    };

    // --- LOGICA DE ACCESO (Copiada de CronogramaClient) ---
    const isTotalBlock = ['OUT_OF_HOURS', 'NIGHT_RESTRICTION', 'HOLIDAY_BLOCK', 'PENDING_SALDO'].includes(systemAccess?.code);
    const isBlockedForPayments = isBlockedByCuadre && isTotalBlock;
    const puedeOperar = userRole === 'asesor' || userRole === 'admin' || userRole === 'supervisor'

    const now = new Date()
    const formatter = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })
    const currentHourString = formatter.format(now)

    const timeToMinutes = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const apertura = systemSchedule?.horario_apertura || '10:00'
    const cierre = systemSchedule?.horario_cierre || '19:00'
    const tNow = timeToMinutes(currentHourString);
    const tApertura = timeToMinutes(apertura);
    const tCierre = timeToMinutes(cierre);
    const tDesbloqueo = systemSchedule?.desbloqueo_hasta ? new Date(systemSchedule.desbloqueo_hasta) : null;
    const isWithinHours = tNow >= tApertura && tNow < tCierre;
    const isTemporaryUnlocked = tDesbloqueo && now < tDesbloqueo;
    const canPayDueToTime = isWithinHours || isTemporaryUnlocked
    // --- FIN LOGICA DE ACCESO ---

    // --- VIRTUAL DISTRIBUTION LOGIC ---
    const virtualCronograma = useMemo(() => {
        if (!cronograma) return [];
        const sorted = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota);
        
        // [SINCRONIZACIÓN] Para préstamos migrados, es posible que no existan registros en 'pagos'
        // pero sí montos pagados en 'cronograma_cuotas'. Usamos el máximo para ser resilientes.
        const validPagos = (pagos || []).filter((p: any) => p.estado_verificacion !== 'rechazado');
        const totalPagadoEnPagos = validPagos.reduce((acc: number, p: any) => acc + (parseFloat(p.monto_pagado) || 0), 0);
        const totalPagadoEnCronograma = (cronograma || []).reduce((acc: number, c: any) => acc + (parseFloat(c.monto_pagado) || 0), 0);
        const hasPhysicalPagos = (pagos || []).length > 0;
        const totalPagadoHistorico = hasPhysicalPagos ? totalPagadoEnPagos : totalPagadoEnCronograma;
        
        let remaining = totalPagadoHistorico;
        
        return sorted.map(c => {
            const montoCuota = parseFloat(c.monto_cuota || 0);
            let pagadoEnEstaCuota = 0;
            if (remaining >= montoCuota - 0.01) {
                pagadoEnEstaCuota = montoCuota;
                remaining -= montoCuota;
            } else if (remaining > 0) {
                pagadoEnEstaCuota = Math.round(remaining * 100) / 100;
                remaining = 0;
            }
            return {
                ...c,
                monto_pagado_virtual: pagadoEnEstaCuota,
                monto_pagado: pagadoEnEstaCuota // OVERRIDE PARA LA UI
            };
        });
    }, [cronograma, pagos]);

    // --- LOGICA DE CUOTA ACTIVA (Identificar cobro del día) ---
    const activeQuota = useMemo(() => {
        if (virtualCronograma.length === 0) return null;
        const quotasWithStatus = virtualCronograma.map(c => {
            const montoCuota = parseFloat(c.monto_cuota)
            const montoPagado = parseFloat(c.monto_pagado)
            return { ...c, isPaid: (montoCuota - montoPagado) <= 0.01 }
        })
        const firstUnpaid = quotasWithStatus.find(q => !q.isPaid)
        const todayQuota = quotasWithStatus.find(q => !q.isPaid && q.fecha_vencimiento === todayStr)
        return todayQuota || firstUnpaid
    }, [virtualCronograma, todayStr])
    // --- FIN LOGICA CUOTA ACTIVA ---

    // --- WATERFALL DISTRIBUTION LOGIC (Trazabilidad Real) ---
    const waterfallData = useMemo(() => {
        if (!cronograma) return { assignments: [], quotaSources: {}, paymentDestinations: {} };
        
        const sortedQuotas = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota);
        const rawPagos = (pagos || []).filter((p: any) => p.estado_verificacion !== 'rechazado');
        
        // 1. Calcular Saldo de Sistema (Diferencia acumulada)
        const totalPagadoEnPagos = rawPagos.reduce((s: number, p: any) => s + (parseFloat(p.monto_pagado) || 0), 0);
        const totalPagadoEnCronograma = cronograma.reduce((s: number, c: any) => s + (parseFloat(c.monto_pagado) || 0), 0);

        // [SINCRONIZACIÓN] Trust transactions over cronograma sum
        const hasPhysicalPagos = (pagos || []).length > 0;
        let systemMoney = hasPhysicalPagos ? 0 : Math.max(0, totalPagadoEnCronograma - totalPagadoEnPagos);

        const sortedPagos = [...rawPagos].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        let pool = sortedPagos.map(p => ({ 
            ...p, 
            rem: parseFloat(p.monto_pagado) || 0,
            date: formatDatePeru(p.created_at, 'isoDate')
        }));

        const assignments: any[] = [];
        const qSources: any = {};
        const pDests: any = {};
        const remainingNeeded = {} as any;

        sortedQuotas.forEach(q => {
            remainingNeeded[q.id] = parseFloat(q.monto_cuota) || 0;
            qSources[q.id] = [];
        });

        const assign = (pay: any, quota: any, amt: number, type?: string) => {
            if (amt <= 0.001) return;
            let finalType = type;
            if (!finalType) {
                if (pay.isSystem) finalType = 'system';
                else if (pay.date < quota.fecha_vencimiento) finalType = 'advance';
                else if (pay.date > quota.fecha_vencimiento) finalType = 'arrear';
                else finalType = 'direct';
            }
            const a = {
                quotaId: quota.id, quotaNum: quota.numero_cuota,
                paymentId: pay.id, paymentDate: pay.date,
                amount: amt, type: finalType, isSystem: pay.isSystem
            };
            assignments.push(a);
            qSources[quota.id].push(a);
            if (!pDests[pay.id]) pDests[pay.id] = [];
            pDests[pay.id].push(a);
            remainingNeeded[quota.id] -= amt;
        };

        // FASE 1: Saldo de Sistema/Legado (Prioridad Histórica 0)
        if (systemMoney > 0.01) {
            const sysPay = { id: 'system-init', date: '0000-00-00', isSystem: true };
            sortedQuotas.forEach(q => {
                if (systemMoney <= 0.01 || remainingNeeded[q.id] <= 0.01) return;
                const take = Math.min(systemMoney, remainingNeeded[q.id]);
                assign(sysPay, q, take, 'system');
                systemMoney -= take;
            });
        }

        // FASE 2: Prioridad Día (Intent - Misma Fecha)
        // Si hay un pago realizado el mismo día que una cuota, cubrir esa primero para asegurar status "CUMPLIÓ"
        pool.forEach(p => {
             const sameDayQuota = sortedQuotas.find(q => q.fecha_vencimiento === p.date);
             if (sameDayQuota && remainingNeeded[sameDayQuota.id] > 0.01) {
                 const take = Math.min(p.rem, remainingNeeded[sameDayQuota.id]);
                 assign(p, sameDayQuota, take, 'direct');
                 p.rem -= take;
             }
        });

        // FASE 3: Cascada FIFO Residual (Cubrir deudas antiguas o adelantar futuras)
        sortedQuotas.forEach(q => {
            pool.forEach(p => {
                if (remainingNeeded[q.id] <= 0.01 || p.rem <= 0.01) return;
                const take = Math.min(p.rem, remainingNeeded[q.id]);
                assign(p, q, take);
                p.rem -= take;
            });
        });

        return { assignments, quotaSources: qSources, paymentDestinations: pDests };
    }, [cronograma, pagos]);
    // --- FIN WATERFALL ---
    const allRows = useMemo(() => {
        if (virtualCronograma.length === 0) return []
        const validPagos = (pagos || []).filter((p: any) => p.estado_verificacion !== 'rechazado');
        const qDates = virtualCronograma.map((c: any) => c.fecha_vencimiento)
        const pDates = validPagos.map((p: any) => formatDatePeru(p.created_at, 'isoDate'))
        const dates = Array.from(new Set([...qDates, ...pDates])).sort()
        return dates.map(d => ({
            date: d,
            cuota: virtualCronograma.find((c: any) => c.fecha_vencimiento === d),
            physical: validPagos.filter((p: any) => formatDatePeru(p.created_at, 'isoDate') === d)
        }))
    }, [virtualCronograma, pagos])

    if (allRows.length === 0) return <div className="py-10 text-center text-slate-500 font-bold uppercase text-[10px]">Sin datos</div>

    return (
        <div className="space-y-4">
            {/* Alertas de Bloqueo */}
            {isBlockedForPayments && puedeOperar && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Lock className="w-4 h-4 text-rose-500" />
                    <div>
                        <p className="text-rose-400 font-bold text-[11px]">Registro de Pagos Bloqueado</p>
                        <p className="text-slate-400 text-[10px]">{blockReasonCierre || "Fuera de horario de operación o día feriado."}</p>
                    </div>
                </div>
            )}

            {!canPayDueToTime && puedeOperar && !isBlockedByCuadre && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Lock className="w-4 h-4 text-amber-500" />
                    <div>
                        <p className="text-amber-400 font-bold text-[11px]">Sistema Cerrado por Horario</p>
                        <p className="text-slate-400 text-[10px]">Opera de {apertura} a {cierre}.</p>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3 bg-blue-500/5 border border-blue-500/10 p-3 rounded-xl">
                <div className="p-2 rounded-lg bg-blue-500/10"><Wallet className="w-5 h-5 text-blue-400" /></div>
                <div><h3 className="text-sm font-black text-blue-400 uppercase tracking-tighter">Bitácora de Recaudación Real</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Trazabilidad de Activos</p></div>
            </div>

            {/* Tarjeta de Acción Rápida (Copiada de Cronograma pero para hoy) */}
            {puedeOperar && activeQuota && prestamo.bloqueo_cronograma && (
                <div className={cn(
                    "rounded-2xl border p-4 shadow-xl transition-all",
                    activeQuota.fecha_vencimiento < todayStr 
                    ? 'bg-gradient-to-br from-rose-950/40 to-slate-950 border-rose-500/30 shadow-rose-900/10' 
                    : 'bg-gradient-to-br from-blue-950/40 to-slate-900 border-blue-500/30 shadow-blue-900/10'
                )}>
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">Operación del Día</p>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className={cn(
                                    "text-[9px] font-black",
                                    activeQuota.fecha_vencimiento < todayStr ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                )}>
                                    Cuota #{activeQuota.numero_cuota}
                                </Badge>
                                <span className="text-xs font-bold text-white/80">{activeQuota.fecha_vencimiento.split('-').reverse().join('/')}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">Saldo Pendiente</p>
                            <p className={cn("text-xl font-black", activeQuota.fecha_vencimiento < todayStr ? 'text-rose-400' : 'text-blue-400')}>
                                S/ {(parseFloat(activeQuota.monto_cuota) - parseFloat(activeQuota.monto_pagado || 0)).toFixed(2)}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button 
                            onClick={() => setQuickPayOpen(true)}
                            size="lg"
                            className={cn(
                                "flex-1 font-black shadow-lg h-11 text-sm rounded-xl uppercase tracking-tighter transition-all",
                                activeQuota.fecha_vencimiento < todayStr ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20',
                                (!canPayDueToTime || isBlockedForPayments) && 'opacity-50 cursor-not-allowed grayscale pointer-events-none'
                            )}
                            disabled={!canPayDueToTime || isBlockedForPayments}
                        >
                            <DollarSign className="w-4 h-4 mr-2" />
                            {isBlockedForPayments ? 'Sistema Bloqueado' : !canPayDueToTime ? 'Horario Cerrado' : 'Registrar Pago'}
                        </Button>
                    </div>
                </div>
            )}



            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
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
                                const isMigrado = prestamo.observacion_supervisor?.includes('Préstamo migrado del sistema anterior')
                                const cVal = cuota ? Number(cuota.monto_cuota || 0) : 0, pVal = cuota ? Number(cuota.monto_pagado || 0) : 0
                                const isFull = cuota ? (pVal >= (cVal - 0.01)) : false, isPart = cuota ? (pVal > 0 && !isFull) : false
                                 
                                 const sources = cuota ? (waterfallData.quotaSources[cuota.id] || []) : []
                                 const isCoveredByAdvance = sources.some((s: any) => s.type === 'advance' && s.paymentDate !== date)
                                
                                let st = { l: "NO PAGÓ", c: "text-rose-500 bg-rose-500/10", bg: "bg-rose-500/5" }
                                if (isVirtual) st = { l: "EXTRA", c: "text-emerald-400 bg-emerald-500/10", bg: "bg-emerald-500/5" }
                                else if (isFull) {
                                  if (totalDay > 0) st = { l: "PAGO", c: "text-emerald-400 bg-emerald-500/10", bg: "bg-emerald-500/5" }
                                  else if (isCoveredByAdvance) st = { l: "SISTEMA", c: "text-blue-400 bg-blue-500/10", bg: "bg-blue-500/10" }
                                  else st = { l: "SISTEMA", c: isMigrado ? "text-sky-400 bg-sky-500/10" : "text-rose-500 bg-rose-500/10", bg: isMigrado ? "bg-sky-500/5" : "bg-rose-500/5" }
                                } else if (isPart) {
                                  if (totalDay > 0) st = { l: "ABONÓ", c: "text-amber-400 bg-amber-500/10", bg: "bg-amber-500/5" }
                                  else if (isCoveredByAdvance) st = { l: "SISTEMA", c: "text-blue-400 bg-blue-500/10", bg: "bg-blue-500/10" }
                                  else st = { l: "SISTEMA", c: isMigrado ? "text-sky-400 bg-sky-500/10" : "text-rose-500 bg-rose-500/10", bg: isMigrado ? "bg-sky-500/5" : "bg-rose-500/5" }
                                } else if (totalDay > 0) {
                                  // Regla de Recaudación Física: Si se cobró dinero pero se aplicó a deudas anteriores
                                  if (totalDay >= (cVal - 0.01)) st = { l: "PAGO", c: "text-emerald-400 bg-emerald-500/10", bg: "bg-emerald-500/5" }
                                  else st = { l: "ABONÓ", c: "text-amber-400 bg-amber-500/10", bg: "bg-amber-500/5" }
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
                                                        <div className="flex items-center gap-0.5">
                                                            <Button size="sm" variant="ghost" onClick={() => { setSelectedPayment(p); setIsVoucherOpen(true); }} className="h-4 w-4 p-0 text-slate-600 hover:text-emerald-400"><Receipt className="w-2.5 h-2.5" /></Button>
                                                            {userRole === 'admin' && date === todayStr && !isPaymentLocked(p) && (
                                                                <Button size="sm" variant="ghost" onClick={() => { setSelectedPayment(p); setIsEditModalOpen(true); }} className="h-4 w-4 p-0 text-slate-600 hover:text-blue-400"><Pencil className="w-2.5 h-2.5" /></Button>
                                                            )}
                                                        </div>
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
                                            <div className="space-y-1.5">
                                                {/* 1. Destino del dinero recibido HOY */}
                                                {physical.map((p: any) => {
                                                    const dests = (waterfallData.paymentDestinations[p.id] || [])
                                                    return (
                                                        <div key={p.id} className="pl-1.5 border-l border-emerald-500/30">
                                                            <div className="flex items-center gap-1 text-emerald-400 font-black text-[10px] uppercase">
                                                                <CheckCircle2 className="w-3 h-3" /> Cobro en ruta
                                                            </div>
                                                            {dests.map((d: any, i: number) => (
                                                                <p key={i} className="text-[9px] text-slate-300 font-bold leading-tight ml-4">
                                                                    → S/ {Math.round(d.amount)} a <span className={cn(d.type === 'advance' && "text-blue-400")}>{d.type === 'arrear' ? 'Atraso' : d.type === 'advance' ? 'Adelanto de Cuota' : 'Cuota'}</span> #{d.quotaNum}
                                                                </p>
                                                            ))}
                                                            {dests.length === 0 && <p className="text-[9px] text-slate-500 ml-4">Dinero en bolsa (Excedente Final)</p>}
                                                        </div>
                                                    )
                                                })}

                                                {/* 2. Origen del pago de la cuota de HOY (si no fue pagada totalmente con dinero de hoy) */}
                                                {cuota && (pVal > 0) && (
                                                    <div className="pl-1.5 border-l border-sky-500/30">
                                                        {waterfallData.quotaSources[cuota.id]?.filter((s: any) => s.paymentDate !== date).map((s: any, i: number) => (
                                                            <p key={i} className="text-[9px] text-sky-400 font-bold leading-tight flex items-center gap-1">
                                                                <ArrowRightCircle className="w-3 h-3" /> 
                                                                {s.type === 'system' 
                                                                    ? 'Saldada con Excedente Anterior (Sistema)' 
                                                                    : <span className={cn(s.type === 'advance' ? 'text-blue-400' : 'text-sky-400')}>
                                                                        Cubierta con {s.type === 'advance' ? 'Adelanto de Cuota' : 'Excedente'} del {s.paymentDate.split('-').reverse().slice(0,2).join('/')}
                                                                      </span>
                                                                }
                                                            </p>
                                                        ))}
                                                        {/* Fallback para migración o inconsistencias */}
                                                        {(!waterfallData.quotaSources[cuota.id]?.some((s: any) => s.paymentDate !== date)) && totalDay === 0 && isFull && isMigrado && (
                                                            <p className="text-[8px] text-sky-400 leading-tight italic flex items-center gap-1 uppercase font-black">
                                                                <ArrowRightCircle className="w-2.5 h-2.5" /> Saldada (Sistema/Migración)
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 3. Caso Extra (Cobros sin cuota asociada en esa fecha pero que no son pagos físicos hoy) */}
                                                {isVirtual && totalDay === 0 && <p className="text-[9px] text-emerald-400/60 leading-tight font-bold">Regularización automática de saldos.</p>}

                                                {/* 4. Faltantes */}
                                                {cuota && !isFuture && !isFull && totalDay === 0 && (
                                                    <p className="text-[9px] text-rose-500 uppercase font-bold flex items-center gap-1">
                                                        <XCircle className="w-3 h-3" /> Faltante de cuota
                                                    </p>
                                                )}
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
            
            <EditPaymentModal 
                open={isEditModalOpen}
                onOpenChange={setIsEditModalOpen}
                payment={selectedPayment}
                onSuccess={() => router.refresh()}
            />

            <QuickPayModal 
                open={quickPayOpen}
                onOpenChange={setQuickPayOpen}
                prestamo={prestamo}
                userRol={userRole}
                systemSchedule={systemSchedule}
                isBlockedByCuadre={isBlockedByCuadre}
                blockReasonCierre={blockReasonCierre}
                systemAccess={systemAccess}
                onSuccess={() => router.refresh()}
            />
        </div>
    )
}
