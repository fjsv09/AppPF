'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Lock, CheckCircle, RefreshCw } from 'lucide-react'
import { toBlob } from 'html-to-image'
import { EditQuotaModal } from './edit-quota-modal'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'


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
    systemAccess?: any
    pagos?: any[]
}

export function CronogramaClient({ 
    prestamo, 
    cronograma, 
    userRol = 'asesor', 
    systemSchedule, 
    isBlockedByCuadre, 
    blockReasonCierre,
    systemAccess,
    pagos = []
}: Props) {
    // Solo se bloquean los pagos si el bloqueo es TOTAL (Horario, Feriado, Noche, Corte Mañana)
    // El bloqueo por falta de cuadre (Mañana) AHORA TAMBIÉN BLOQUEA pagos (Requerimiento de obligar entrega de dinero).
    const isTotalBlock = ['OUT_OF_HOURS', 'NIGHT_RESTRICTION', 'HOLIDAY_BLOCK', 'PENDING_SALDO', 'MISSING_MORNING_CUADRE'].includes(systemAccess?.code);
    const isBlockedForPayments = isBlockedByCuadre && isTotalBlock;
    // Admin, Supervisor y Asesor pueden realizar pagos
    const puedePagar = userRol === 'asesor' || userRol === 'admin' || userRol === 'supervisor'
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [selectedQuota, setSelectedQuota] = useState<any>(null)


    // --- LOGICA DE HORARIO ---
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
    
    // Si cierre es 19:00, y son 19:19 -> isWithinHours será False
    const isWithinHours = tNow >= tApertura && tNow < tCierre;
    const isTemporaryUnlocked = tDesbloqueo && now < tDesbloqueo;
    
    // Para ver si el sistema está operando, no eximimos al admin (para que pueda testear)
    const canPayDueToTime = isWithinHours || isTemporaryUnlocked
    // --- FIN LOGICA DE HORARIO ---


    // Calculate Global State for Display
    const sorted = [...cronograma].sort((a, b) => a.numero_cuota - b.numero_cuota)
    
    // Today's date for comparison (start of day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Today's date in Peru (YYYY-MM-DD)
    const todayStr = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'America/Lima', 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
    }).format(new Date())

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
        
        // Display pending amount - ONLY show if partially paid
        // If nothing paid (0) -> 0 (user wants it to assume full debt if not touched)
        // If fully paid -> 0
        const displayPending = (c.montoPagado <= 0.01 || isMathematicallyPaid) ? 0 : c.pendiente

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

    return (
        <div className="flex flex-col gap-4">
            {/* Action Blocked by Cuadre */}
            {isBlockedForPayments && userRol === 'asesor' && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0">
                        <Lock className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-rose-400 font-bold text-sm">Registro de Pagos Bloqueado</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                            {blockReasonCierre || "Fuera de horario de operación o día feriado."}
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
                                <th className="px-2 md:px-4 py-3 text-right text-blue-400">Saldo</th>
                                <th className="hidden sm:table-cell px-4 py-3 text-center">Estado</th>
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
                                                {cuota.visitado && <Badge variant="outline" className="ml-2 bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[8px]">VISITADO</Badge>}
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
                                                
                                                {/* Indicador de Pago por Sistema (Excedente) */}
                                                {isPaid && (pagos || []).some(p => (p.pagos_distribucion || []).some((d: any) => d.cuota_id === cuota.id && d.tipo !== 'directo')) && (
                                                    <div className="mt-1">
                                                        <span className="text-[7px] md:text-[8px] bg-blue-500/20 text-blue-300 px-1 py-0.5 rounded border border-blue-500/30 font-black uppercase tracking-tighter">
                                                            Saldado (+)
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {userRol === 'admin' && isPaid && cuota.fecha_vencimiento === todayStr && (
                                                <td className="px-2 md:px-4 py-3 text-center border-l border-slate-800/50">
                                                    <Button 
                                                       variant="ghost" 
                                                       size="sm" 
                                                       className="h-7 w-7 p-0 rounded-md text-blue-400 hover:text-white hover:bg-blue-600/20"
                                                       onClick={() => {
                                                           setSelectedQuota(cuota)
                                                           setIsEditModalOpen(true)
                                                       }}
                                                    >
                                                       <Pencil className="w-3.5 h-3.5" />
                                                    </Button>
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

            <EditQuotaModal 
                open={isEditModalOpen}
                onOpenChange={setIsEditModalOpen}
                quota={selectedQuota}
                onSuccess={() => router.refresh()}
            />
        </div>
    )
}



