'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Lock, CheckCircle, DollarSign, RefreshCw, Share2 } from 'lucide-react'
import { toBlob } from 'html-to-image'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

type Props = {
    prestamo: any
    cronograma: any[]
    userRol?: 'admin' | 'supervisor' | 'asesor'
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        desbloqueo_hasta: string
    }
    isBlockedByCuadre?: boolean
    blockReasonCierre?: string
}

export function CronogramaClient({ prestamo, cronograma, userRol = 'asesor', systemSchedule, isBlockedByCuadre, blockReasonCierre }: Props) {
    // Solo el asesor puede realizar pagos
    const puedePagar = userRol === 'asesor'
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [payingQuota, setPayingQuota] = useState<any | null>(null)
    const [amount, setAmount] = useState('')
    const [metodoPago, setMetodoPago] = useState('Efectivo')
    
    // Receipt State
    const [showReceipt, setShowReceipt] = useState(false)
    const [lastPayment, setLastPayment] = useState<any>(null)
    
    // Sharing State
    const receiptRef = useRef<HTMLDivElement>(null)
    const [sharing, setSharing] = useState(false)

    // --- LOGICA DE HORARIO ---
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })
    const currentHourString = formatter.format(now)

    const apertura = systemSchedule?.horario_apertura || '07:00'
    const cierre = systemSchedule?.horario_cierre || '20:00'
    const desbloqueoHasta = systemSchedule?.desbloqueo_hasta ? new Date(systemSchedule.desbloqueo_hasta) : null
    
    // Si cierre es 19:00, y son 19:19 -> isWithinHours será False
    const isWithinHours = currentHourString >= apertura && currentHourString < cierre
    const isTemporaryUnlocked = desbloqueoHasta && now < desbloqueoHasta
    
    const canPayDueToTime = isWithinHours || isTemporaryUnlocked || userRol === 'admin'
    // --- FIN LOGICA DE HORARIO ---


    // Calculate Global State for Display
    const sorted = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota)
    
    // Today's date for comparison (start of day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // Step 1: Classify each quota
    const quotasWithStatus = sorted.map(c => {
        const dueDate = new Date(c.fecha_vencimiento + 'T00:00:00')
        const montoCuota = parseFloat(c.monto_cuota)
        const montoPagado = parseFloat(c.monto_pagado || 0)
        const pendiente = montoCuota - montoPagado
        const isPaid = pendiente <= 0.01
        
        // Determine if overdue, today, or future
        let status: 'paid' | 'overdue' | 'today' | 'future' = 'future'
        if (isPaid) {
            status = 'paid'
        } else if (c.fecha_vencimiento === todayStr) {
            status = 'today'
        } else if (dueDate < today) {
            status = 'overdue'
        }
        
        return {
            ...c,
            montoCuota,
            montoPagado,
            pendiente,
            isPaid,
            status,
            dueDate
        }
    })

    // Step 2: Determine which quotas are active (can be paid)
    // RULE (Updated): Strictly ONE active quota to avoid confusion.
    // Priority:
    // 1. Today's quota (Route Mode) -> If exists and unpaid, it overrides everything.
    // 2. Oldest unpaid quota (FIFO) -> If today is paid/empty, go back to fixing arrears.
    
    const firstUnpaid = quotasWithStatus.find(q => !q.isPaid)
    const todayQuota = quotasWithStatus.find(q => !q.isPaid && q.fecha_vencimiento === todayStr)
    
    // Logic: If Today exists, IT IS THE ONE. Else, fall back to Oldest.
    const activeQuota = todayQuota || firstUnpaid
    const activeQuotaId = activeQuota?.id

    // Step 3: Build final processed quotas
    const processedQuotas = quotasWithStatus.map(c => {
        // Active means "Highlighted/Payable"
        // Strict check against the SINGLE active ID determined above
        const isActive = c.id === activeQuotaId
        
        const isOverdue = c.status === 'overdue'
        const isMathematicallyPaid = c.isPaid
        
        // Locked = not paid AND not active
        const isLocked = !isMathematicallyPaid && !isActive
        
        // Display pending amount
        const displayPending = isMathematicallyPaid ? 0 : c.pendiente

        return { 
            ...c, 
            displayPending, 
            isLocked, 
            isActive,
            isMathematicallyPaid,
            isOverdue
        }
    })

    const handleGenerate = async () => {
        setLoading(true)
        try {
            await api.prestamos.generarCronograma(prestamo.id)
            toast.success('Cronograma Generado')
            router.refresh()
        } catch (e: any) {
            toast.error(e.message || 'Error al generar')
        } finally {
            setLoading(false)
        }
    }

    const handleLock = async () => {
        if (!confirm('¿Seguro que desea bloquear el cronograma? Una vez bloqueado no se podrá regenerar.')) return;
        setLoading(true)
        try {
            await api.prestamos.bloquearCronograma(prestamo.id)
            toast.success('Cronograma Bloqueado e Iniciado')
            router.refresh()
        } catch (e: any) {
            toast.error(e.message || 'Error al bloquear')
        } finally {
            setLoading(false)
        }
    }

    const handlePayment = async () => {
        if (!payingQuota || !amount) return
        setLoading(true)
        const payAmount = parseFloat(amount)
        try {
            const result = await api.pagos.registrar({ 
                cuota_id: payingQuota.id, 
                monto: payAmount,
                metodo_pago: metodoPago
            })
            
            // Siempre calcular distribución localmente para mostrar en voucher
            // (el backend ya aplica la lógica correcta a la DB)
            let distribucion: Array<{cuota: number, monto: number, tipo: string}> = []
            
            const cuotaPendiente = payingQuota.pendiente || (payingQuota.monto_cuota - (payingQuota.monto_pagado || 0))
            const montoACuotaActual = Math.min(payAmount, cuotaPendiente)
            let exceso = payAmount - montoACuotaActual
            
            // Add main quota
            distribucion.push({
                cuota: payingQuota.numero_cuota,
                monto: montoACuotaActual,
                tipo: payingQuota.isOverdue ? 'vencida' : 'actual'
            })
            
            // Calculate excess distribution to overdue quotas first (oldest first)
            if (exceso > 0.01) {
                const overdueQuotas = processedQuotas
                    .filter(q => q.isOverdue && q.id !== payingQuota.id && !q.isMathematicallyPaid)
                    .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())
                
                for (const vencida of overdueQuotas) {
                    if (exceso <= 0.01) break
                    const vencidaPendiente = vencida.pendiente || (parseFloat(vencida.monto_cuota) - parseFloat(vencida.monto_pagado || 0))
                    const aAplicar = Math.min(exceso, vencidaPendiente)
                    
                    if (aAplicar > 0) {
                        distribucion.push({
                            cuota: vencida.numero_cuota,
                            monto: aAplicar,
                            tipo: 'vencida'
                        })
                        exceso -= aAplicar
                    }
                }
            }
            
            // Then apply to future quotas (next first)
            if (exceso > 0.01) {
                const futureQuotas = processedQuotas
                    .filter(q => !q.isOverdue && !q.isMathematicallyPaid && q.id !== payingQuota.id && q.status === 'future')
                    .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())
                
                for (const futura of futureQuotas) {
                    if (exceso <= 0.01) break
                    const futuraPendiente = futura.pendiente || (parseFloat(futura.monto_cuota) - parseFloat(futura.monto_pagado || 0))
                    const aAplicar = Math.min(exceso, futuraPendiente)
                    
                    if (aAplicar > 0) {
                        distribucion.push({
                            cuota: futura.numero_cuota,
                            monto: aAplicar,
                            tipo: 'adelantado'
                        })
                        exceso -= aAplicar
                    }
                }
            }
            
            // CALCULAR ESTADO FINAL DEL PRÉSTAMO PARA VOUCHER
            const totalCuotas = cronograma.length
            const totalPagadasAntes = cronograma.filter(c => parseFloat(c.monto_pagado || 0) >= parseFloat(c.monto_cuota) - 0.01).length
            
             // Determinar cuántas se pagaron AHORA
            let nuevasPagadas = 0
            // Chequear cuota principal
            if ((payingQuota.monto_pagado || 0) + montoACuotaActual >= payingQuota.monto_cuota - 0.01) {
                nuevasPagadas++
            }
            // Chequear otras distribuciones (si completaron cuotas)
            // Es complejo exacto sin re-fetch, pero podemos aproximar:
            // Si el monto pendiente era <= lo que se aplicó, cuenta como pagada
            
            // MÉTODO MÁS ROBUSTO: Recalcular estado "hipotético" usando cascada
            // 1. Obtener la suma de TODO lo que se había pagado antes en el préstamo
            const totalPagadoHistorico = cronograma.reduce((acc, c) => acc + parseFloat(c.monto_pagado || 0), 0)
            
            // 2. Sumarle el monto que estamos pagando justo AHORA
            let remainingToDistribute = totalPagadoHistorico + payAmount
            
            // 3. Simular la distribución en cascada a través de todas las cuotas
            const simCronograma = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota).map(c => {
                const cuotaAmount = parseFloat(c.monto_cuota)
                let pagadoEnEstaCuota = 0
                
                if (remainingToDistribute >= cuotaAmount) {
                    pagadoEnEstaCuota = cuotaAmount
                    remainingToDistribute -= cuotaAmount
                } else if (remainingToDistribute > 0) {
                    pagadoEnEstaCuota = remainingToDistribute
                    remainingToDistribute = 0
                }
                
                return {
                    ...c,
                    pagado: pagadoEnEstaCuota,
                    cuota: cuotaAmount
                }
            })

            let cuotasPendientesCount = simCronograma.filter(c => c.cuota - c.pagado > 0.01).length
            let saldoPendienteTotal = simCronograma.reduce((acc, c) => acc + (c.cuota - c.pagado), 0)
            
            // 4. Calcular Atrasadas basándonos en la fecha actual
            const todayStr = new Date().toISOString().split('T')[0]
            const cuotasAtrasadasCount = simCronograma.filter(c => {
                const pending = c.cuota - c.pagado > 0.01
                const isOverdue = c.fecha_vencimiento < todayStr;
                return pending && isOverdue
            }).length

            // Set Receipt Data with distribution
            setLastPayment({
                monto: payAmount,
                cuota: payingQuota.numero_cuota,
                fecha: new Date().toLocaleDateString('es-PE'),
                hora: new Date().toLocaleTimeString('es-PE'),
                operacion: result?.pago_id?.slice?.(-10)?.toUpperCase() || Math.random().toString(36).substr(2, 9).toUpperCase(),
                cliente: prestamo.clientes?.nombres,
                // Nuevos datos
                cuotasPendientes: cuotasPendientesCount,
                cuotasAtrasadas: cuotasAtrasadasCount, // NEW FIELD
                saldoPendiente: saldoPendienteTotal,
                totalCuotas: totalCuotas,
                pagadas: totalCuotas - cuotasPendientesCount,
                cuotaActual: payingQuota.numero_cuota, // Fijado a la cuota objetivo
                pago_id: result?.pago_id
            })
            setShowReceipt(true)
            
            setPayingQuota(null)
            setAmount('')
            setMetodoPago('Efectivo')
            router.refresh()
        } catch (e: any) {
            toast.error(e.message || 'Error al pagar')
        } finally {
            setLoading(false)
        }
    }

    const handleShare = async () => {
        if (!receiptRef.current) return
        setSharing(true)
        try {
            const blob = await toBlob(receiptRef.current, { cacheBust: true })
            if (!blob) throw new Error('Error al generar imagen')

            const file = new File([blob], `comprobante-${lastPayment.operacion}.png`, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Comprobante de Pago',
                    text: `Pago registrado de ${prestamo.clientes?.nombres}`
                })
            } else {
                // Fallback for desktop: Download
                const link = document.createElement('a')
                link.download = `comprobante-${lastPayment.operacion}.png`
                link.href = URL.createObjectURL(blob)
                link.click()
                toast.success('Comprobante descargado')
            }

            if (lastPayment?.pago_id && userRol === 'asesor') {
                api.pagos.compartirVoucher(lastPayment.pago_id).catch(() => {})
            }

        } catch (e) {
            console.error(e)
            toast.error('No se pudo compartir la imagen')
        } finally {
            setSharing(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Action Blocked by Cuadre */}
            {isBlockedByCuadre && userRol === 'asesor' && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0">
                        <Lock className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-rose-400 font-bold text-sm">Registro de Pagos Bloqueado</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                            {blockReasonCierre}
                        </p>
                    </div>
                </div>
            )}

            {/* Actions for Loan State */}
            {!canPayDueToTime && userRol === 'asesor' && !isBlockedByCuadre && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0">
                        <Lock className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-rose-400 font-bold text-sm">Sistema Cerrado por Horario</p>
                        <p className="text-slate-400 text-xs">
                            El registro de pagos está habilitado de {apertura} a {cierre}. 
                            {isTemporaryUnlocked ? " (Desbloqueo excepcional activo)" : " Fuera de este horario, solicite un desbloqueo al administrador si es un caso urgente."}
                        </p>
                    </div>
                </div>
            )}

            {!prestamo.bloqueo_cronograma && (
                <div className="flex flex-col sm:flex-row gap-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg items-center justify-between">
                    <div className="text-yellow-500">
                        <p className="font-bold flex items-center gap-2">
                            <Lock className="w-4 h-4" /> Cronograma en Borrador
                        </p>
                        <p className="text-sm opacity-90">Revise las fechas y montos antes de confirmar.</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button onClick={handleGenerate} disabled={loading} variant="outline" className="flex-1 sm:flex-none border-yellow-600/50 text-yellow-500 hover:bg-yellow-950 hover:text-yellow-400">
                            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Regenerar
                        </Button>
                        {cronograma.length > 0 && (
                            <Button onClick={handleLock} disabled={loading} className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 text-white border-none shadow-lg shadow-yellow-900/20">
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Confirmar y Bloquear
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Mobile Active Quota Card - Quick Actions - Solo visible para asesor */}
            {puedePagar && processedQuotas.find(q => q.isActive && !q.isMathematicallyPaid && prestamo.bloqueo_cronograma) && (
                (() => {
                    const active = processedQuotas.find(q => q.isActive)!;
                    const isOverdue = active.isOverdue;
                    return (
                        <div className={`md:hidden mb-4 rounded-xl border p-4 shadow-lg ${
                            isOverdue 
                            ? 'bg-gradient-to-br from-red-950/40 to-slate-950 border-red-500/30 shadow-red-900/10' 
                            : 'bg-gradient-to-br from-blue-950/40 to-slate-900 border-blue-500/30 shadow-blue-900/10'
                        }`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">
                                        {isOverdue ? 'Cuota Vencida' : 'Próximo Vencimiento'}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className={`
                                            ${isOverdue ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}
                                        `}>
                                            Cuota #{active.numero_cuota}
                                        </Badge>
                                        <span className="text-sm font-medium text-white">{active.fecha_vencimiento.split('-').reverse().join('/')}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Pendiente</p>
                                    <p className={`text-xl font-bold ${isOverdue ? 'text-red-400' : 'text-blue-400'}`}>
                                        ${active.displayPending.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                            
                            <Button 
                                onClick={() => { setPayingQuota(active); setAmount(active.displayPending.toFixed(2)); }}
                                size="lg"
                                className={`w-full font-bold shadow-lg h-12 text-base rounded-xl ${
                                    isOverdue 
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20' 
                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                                } ${(!canPayDueToTime || isBlockedByCuadre) ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                                disabled={!canPayDueToTime || isBlockedByCuadre}
                            >
                                <DollarSign className="w-5 h-5 mr-2" />
                                {isBlockedByCuadre ? 'Operación Bloqueada' : !canPayDueToTime ? 'Sistema Cerrado' : isOverdue ? 'Pagar Cuota Vencida' : 'Registrar Pago'}
                            </Button>
                        </div>
                    )
                })()
            )}

            {/* Quota Table */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto scrollbar-hide">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-950/50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                            <tr>
                                <th className="px-2 md:px-4 py-3 text-center w-10 md:w-16">#</th>
                                <th className="px-2 md:px-4 py-3">Vencimiento</th>
                                <th className="px-2 md:px-4 py-3 text-right">
                                    <span className="md:hidden">Cuota</span>
                                    <span className="hidden md:inline">Monto Cuota</span>
                                </th>
                                <th className="px-2 md:px-4 py-3 text-right">Pagado</th>
                                <th className="px-2 md:px-4 py-3 text-right text-white">Pendiente</th>
                                <th className="hidden sm:table-cell px-4 py-3 text-center">Estado</th>
                                {puedePagar && prestamo.bloqueo_cronograma && (
                                    <th className="hidden sm:table-cell px-4 py-3 text-center w-16 md:w-24">Acción</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {processedQuotas.length === 0 ? (
                                <tr>
                                    <td colSpan={puedePagar && prestamo.bloqueo_cronograma ? 7 : 6} className="px-4 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
                                                <RefreshCw className="w-6 h-6 text-slate-600" />
                                            </div>
                                            <p className="font-medium">No hay cuotas generadas</p>
                                            {!prestamo.bloqueo_cronograma && <p className="text-xs text-slate-600 mt-1">Presione "Regenerar" para crear el cronograma.</p>}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                processedQuotas.map((cuota) => {
                                    const isPaid = cuota.estado === 'pagado' || cuota.isMathematicallyPaid
                                    
                                    return (
                                        <tr key={cuota.id} className={`
                                            group transition-colors
                                            ${cuota.isActive && !isPaid ? 'bg-blue-900/10 hover:bg-blue-900/20' : 'hover:bg-slate-800/30'}
                                            ${cuota.isOverdue && !isPaid ? 'bg-red-900/10 hover:bg-red-900/20' : ''}
                                        `}>
                                            <td className="px-2 md:px-4 py-3 text-center">
                                                <span className={`
                                                    inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full text-[10px] md:text-xs font-bold
                                                    ${isPaid ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-400'}
                                                `}>
                                                    {cuota.numero_cuota}
                                                </span>
                                            </td>
                                            <td className="px-2 md:px-4 py-3">
                                                <span className={`font-mono text-[10px] md:text-sm ${cuota.isOverdue && !isPaid ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                                                    {cuota.fecha_vencimiento.split('-').reverse().join('/')}
                                                </span>
                                            </td>
                                            <td className="px-2 md:px-4 py-3 text-right text-slate-300 font-medium text-[11px] md:text-sm">
                                                <span className="md:hidden">${parseFloat(cuota.monto_cuota).toFixed(0)}</span>
                                                <span className="hidden md:inline">${parseFloat(cuota.monto_cuota).toFixed(2)}</span>
                                            </td>
                                            <td className="px-2 md:px-4 py-3 text-right">
                                                <span className={`text-[11px] md:text-sm font-bold ${parseFloat(cuota.monto_pagado || 0) > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                    <span className="md:hidden">${parseFloat(cuota.monto_pagado || 0).toFixed(0)}</span>
                                                    <span className="hidden md:inline">${parseFloat(cuota.monto_pagado || 0).toFixed(2)}</span>
                                                </span>
                                            </td>
                                            <td className="px-2 md:px-4 py-3 text-right font-bold text-[11px] md:text-sm text-white">
                                                <span className={`${isPaid ? 'text-slate-600' : cuota.isActive ? 'text-white' : 'text-slate-400'}`}>
                                                    <span className="md:hidden">${isPaid ? '0' : cuota.displayPending.toFixed(0)}</span>
                                                    <span className="hidden md:inline">${isPaid ? '0.00' : cuota.displayPending.toFixed(2)}</span>
                                                </span>
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-3 text-center">
                                                {isPaid ? (
                                                    <Badge variant="outline" className="bg-emerald-950/30 text-emerald-400 border-emerald-900/50 text-[9px] md:text-[10px]">
                                                        PAGADO
                                                    </Badge>
                                                ) : cuota.isOverdue ? (
                                                    <Badge variant="outline" className="bg-red-950/30 text-red-400 border-red-900/50 text-[9px] md:text-[10px]">
                                                        VENCIDO
                                                    </Badge>
                                                ) : cuota.isActive ? (
                                                    <Badge variant="outline" className="bg-blue-950/30 text-blue-400 border-blue-900/50 text-[9px] md:text-[10px]">
                                                        ACTUAL
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[9px] md:text-[10px] text-slate-600 font-medium uppercase">Pendiente</span>
                                                )}
                                            </td>
                                            {puedePagar && prestamo.bloqueo_cronograma && (
                                                <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-center">
                                                    {/* Botón Pagar - Visible en PC y Tablet */}
                                                    {!isPaid && (
                                                        <Button
                                                            size="sm"
                                                            disabled={cuota.isLocked}
                                                            onClick={() => { setPayingQuota(cuota); setAmount(cuota.displayPending.toFixed(2)); }}
                                                            className={`
                                                                h-7 px-3 text-xs rounded-lg transition-all
                                                                ${cuota.isActive 
                                                                    ? cuota.isOverdue
                                                                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'
                                                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                                                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700 hover:bg-slate-800'}
                                                                ${((!canPayDueToTime || isBlockedByCuadre) && cuota.isActive) ? 'opacity-40 grayscale-0 pointer-events-none' : ''}
                                                            `}
                                                        >
                                                            {cuota.isLocked ? <Lock className="w-3 h-3" /> : (!canPayDueToTime || isBlockedByCuadre) && cuota.isActive ? '🚫' : 'Pagar'}
                                                        </Button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Dialog */}
            <Dialog open={!!payingQuota} onOpenChange={(open) => !open && setPayingQuota(null)}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
                    <DialogHeader className="border-b border-slate-800 pb-4">
                        <div className="flex justify-between items-center pr-8">
                             <DialogTitle className="text-xl font-bold">Registrar Pago</DialogTitle>
                             {payingQuota && (
                                <Badge variant="outline" className="bg-blue-950/50 text-blue-400 border-blue-900">
                                    Cuota #{payingQuota.numero_cuota}
                                </Badge>
                             )}
                        </div>
                        <DialogDescription className="text-slate-400">
                            Ingrese el monto a pagar para cancelar o abonar a esta cuota.
                        </DialogDescription>
                    </DialogHeader>

                    {payingQuota && (
                        <div className="space-y-6 pt-2">
                             <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950 rounded-xl border border-slate-800">
                                <div>
                                    <p className="text-xs text-slate-500 mb-1 font-medium uppercase">Total Cuota</p>
                                    <p className="text-lg font-semibold text-slate-300">${payingQuota.monto_cuota}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 mb-1 font-medium uppercase">Falta Pagar</p>
                                    <p className="text-lg font-bold text-rose-400">
                                        ${payingQuota.displayPending.toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-medium text-slate-300">¿Cuánto va a abonar?</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <Input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            const numericVal = parseFloat(val)
                                            
                                            // Calculate max possible payment (Total Debt)
                                            const maxAmount = cronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)
                                            
                                            // Allow empty or valid <= max
                                            if (val === '' || (numericVal >= 0 && numericVal <= maxAmount + 0.01)) {
                                                setAmount(val)
                                            } else if (numericVal > maxAmount) {
                                                setAmount(maxAmount.toFixed(2))
                                                toast.warning(`El monto no puede exceder la deuda total ($${maxAmount.toFixed(2)})`)
                                            }
                                        }}
                                        min="0"
                                        max={cronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)}
                                        autoFocus
                                        className="pl-10 h-12 text-lg bg-slate-950/50 border-slate-700 text-white placeholder:text-slate-600 focus-visible:ring-blue-600 rounded-xl"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-3 pt-2">
                                <label className="text-sm font-medium text-slate-300">Método de Pago</label>
                                <select 
                                    value={metodoPago}
                                    onChange={(e) => setMetodoPago(e.target.value)}
                                    className="w-full h-12 px-4 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-600 appearance-none text-base"
                                >
                                    <option value="Efectivo">💵 Efectivo</option>
                                    <option value="Yape">📱 Yape</option>
                                </select>
                            </div>

                            <DialogFooter className="gap-2 sm:gap-0 mt-4">
                                <Button 
                                    variant="ghost" 
                                    onClick={() => setPayingQuota(null)}
                                    className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    onClick={handlePayment} 
                                    disabled={loading || !amount || parseFloat(amount) <= 0 || (!canPayDueToTime && (userRol as any) !== 'admin')} 
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[120px] rounded-xl shadow-lg shadow-emerald-900/20"
                                >
                                    {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : (!canPayDueToTime && (userRol as any) !== 'admin') ? 'Cerrado' : 'Confirmar'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Receipt Modal */}
            <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-sm overflow-hidden p-0">
                    <div ref={receiptRef} className="bg-slate-900">
                        <div className="bg-emerald-600 p-6 text-center">
                            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                                <CheckCircle className="w-10 h-10 text-white" />
                            </div>
                            <DialogTitle className="text-2xl font-bold text-white">¡Pago Exitoso!</DialogTitle>
                            <p className="text-emerald-100 text-sm mt-1">La transacción se procesó correctamente.</p>
                        </div>
                        
                        <div className="p-6 space-y-6 pt-4">
                            {lastPayment && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                                        <span className="text-slate-400 text-sm">Monto Pagado</span>
                                        <span className="text-2xl font-bold text-white">${lastPayment.monto.toFixed(2)}</span>
                                    </div>
                                    
                                    {/* DEBT SUMMARY - Updated as requested */}
                                    <div className="bg-slate-800/80 rounded-lg p-3 border border-white/10">
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Estado Actual</p>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-300">Cuota Actual</span>
                                            <span className="text-emerald-400 font-bold">{lastPayment.cuotaActual || lastPayment.pagadas} de {lastPayment.totalCuotas} cuotas</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300">Atrasadas</span>
                                            <div className="text-right">
                                                {lastPayment.cuotasAtrasadas > 0 && (
                                                     <span className="block text-xs text-red-400 font-bold mb-0.5">
                                                        {lastPayment.cuotasAtrasadas} Cuotas Atrasadas
                                                     </span>
                                                )}
                                                <span className="block text-white font-bold">
                                                    Deuda Restante: ${lastPayment.saldoPendiente?.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Operación</span>
                                            <span className="font-mono text-slate-300">{lastPayment.operacion}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Cliente</span>
                                            <span className="text-slate-300 font-medium text-right">{lastPayment.cliente}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Fecha</span>
                                            <span className="text-slate-300">{lastPayment.fecha} - {lastPayment.hora}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 bg-slate-950 flex gap-3">
                        <Button onClick={() => setShowReceipt(false)} variant="ghost" className="flex-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl">
                            Cerrar
                        </Button>
                        <Button onClick={handleShare} disabled={sharing} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20">
                            {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                            Compartir
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
