import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { CheckCircle2, DollarSign, Calendar, AlertCircle, FileText, ArrowRight, X, Share2, Loader2, CheckCircle, Lock } from 'lucide-react'
import { api } from '@/services/api'
import { toBlob } from 'html-to-image'

interface QuickPayModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prestamo: any
    today: string // YYYY-MM-DD
    userRol?: 'admin' | 'supervisor' | 'asesor'
    onSuccess: () => void
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        desbloqueo_hasta: string
    }
}

export function QuickPayModal({ open, onOpenChange, prestamo, today, userRol = 'asesor', onSuccess, systemSchedule }: QuickPayModalProps) {
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState('')
    const [metodoPago, setMetodoPago] = useState('Efectivo')
    const [quota, setQuota] = useState<any>(null)
    const [fetching, setFetching] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [fullCronograma, setFullCronograma] = useState<any[]>([]) // Store full schedule for stats

    // Sharing State
    const receiptRef = useRef<HTMLDivElement>(null)
    const [sharing, setSharing] = useState(false)
    const [lastPayment, setLastPayment] = useState<any>(null)

    const supabase = createClient()

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
    
    const isWithinHours = currentHourString >= apertura && currentHourString < cierre
    const isTemporaryUnlocked = desbloqueoHasta && now < desbloqueoHasta
    
    // Solo admin se salta el bloqueo de horario
    const canPayDueToTime = isWithinHours || isTemporaryUnlocked || userRol === 'admin'
    // --- FIN LOGICA DE HORARIO ---

    useEffect(() => {
        if (open && prestamo) {
            fetchSmartQuota()
            setResult(null)
            setLastPayment(null)
        }
    }, [open, prestamo])

    const fetchSmartQuota = async () => {
        setFetching(true)
        try {
            const { data: cronograma } = await supabase
                .from('cronograma_cuotas')
                .select('*')
                .eq('prestamo_id', prestamo.id)
                .order('fecha_vencimiento', { ascending: true }) // FIFO: Oldest first

            if (cronograma) {
                setFullCronograma(cronograma) // Save detailed schedule
                
                // Lógica "Ruta del Día": Priorizar la cuota de HOY.
                const todayQuota = cronograma.find((c: any) => c.fecha_vencimiento === today && c.estado !== 'pagado')
                const oldestPending = cronograma.find((c: any) => c.estado !== 'pagado')
                
                const targetQuota = todayQuota || oldestPending

                if (targetQuota) {
                     const pendiente = targetQuota.monto_cuota - (targetQuota.monto_pagado || 0)
                     setAmount(pendiente.toFixed(2))
                     setQuota(targetQuota)
                } 
            }
        } catch (error) {
            console.error('Error fetching quota', error)
            toast.error('Error al cargar cuota')
        } finally {
            setFetching(false)
        }
    }

    const handleShare = async () => {
        if (!receiptRef.current) return
        setSharing(true)
        try {
            const blob = await toBlob(receiptRef.current, { cacheBust: true })
            if (!blob) throw new Error('Error al generar imagen')

            const file = new File([blob], `comprobante-${lastPayment?.operacion}.png`, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Comprobante de Pago',
                    text: `Pago registrado de ${prestamo.clientes?.nombres}`
                })
            } else {
                // Fallback for desktop: Download
                const link = document.createElement('a')
                link.download = `comprobante-${lastPayment?.operacion}.png`
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

    const handlePayment = async () => {
        if (!quota || !amount) return
        setLoading(true)
        try {
            const payAmount = parseFloat(amount)
            const res = await api.pagos.registrar({ 
                cuota_id: quota.id, 
                monto: payAmount,
                metodo_pago: metodoPago
            })
            setResult(res)
            
            // --- CALCULATE RECEIPTS STATS (Borrowed logic from cronograma-client) ---
            // 1. Obtener la suma de TODO lo que se había pagado antes en el préstamo
            const totalPagadoHistorico = fullCronograma.reduce((acc, c) => acc + parseFloat(c.monto_pagado || 0), 0)
            
            // 2. Sumarle el monto que estamos pagando justo AHORA
            let remainingToDistribute = totalPagadoHistorico + payAmount
            
            // 3. Simular la distribución en cascada a través de todas las cuotas
            const simCronograma = [...fullCronograma].sort((a, b) => a.numero_cuota - b.numero_cuota).map(c => {
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
            const hoy = new Date().toISOString().split('T')[0]
            const atrasadasCount = simCronograma.filter(c => {
                const pending = c.cuota - c.pagado > 0.01
                const isOverdue = c.fecha_vencimiento < hoy;
                return pending && isOverdue
            }).length

            const totalCuotas = fullCronograma.length
            
            setLastPayment({
                monto: payAmount,
                cuota: quota.numero_cuota,
                fecha: new Date().toLocaleDateString('es-PE'),
                hora: new Date().toLocaleTimeString('es-PE'),
                operacion: res?.pago_id?.slice?.(-10)?.toUpperCase() || Math.random().toString(36).substr(2, 9).toUpperCase(),
                cliente: prestamo.clientes?.nombres,
                // Stats
                pagadas: totalCuotas - cuotasPendientesCount,
                cuotaActual: quota.numero_cuota, // Fijado al numero de la cuota objetivo
                totalCuotas: totalCuotas,
                cuotasAtrasadas: atrasadasCount,
                saldoPendiente: saldoPendienteTotal,
                pago_id: res?.pago_id
            })

            toast.success('Pago registrado correctamente')
            onSuccess() 
        } catch (error: any) {
            toast.error('Error al registrar pago', { description: error.message })
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        onOpenChange(false)
        setResult(null)
        setAmount('')
        setMetodoPago('Efectivo')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 p-0 overflow-hidden">
                {!result ? (
                    <div className="p-6">
                        <DialogHeader className="mb-4">
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <DollarSign className="w-5 h-5 text-emerald-500" />
                                Pagar Cuota Rápida
                            </DialogTitle>
                            <DialogDescription className="text-slate-400">
                                {prestamo?.clientes?.nombres}
                                <br/> 
                                <span className={quota?.fecha_vencimiento <= today ? "text-rose-400 font-bold" : "text-emerald-400"}>
                                    Cuota #{quota?.numero_cuota} • Vence: {quota?.fecha_vencimiento === today ? 'HOY' : quota?.fecha_vencimiento}
                                </span>
                            </DialogDescription>
                        </DialogHeader>

                        {fetching ? (
                            <div className="py-8 flex justify-center">
                                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="grid gap-6 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="amount" className="text-slate-300">Monto a Cobrar</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">$</span>
                                        <Input
                                            id="amount"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                const numericVal = parseFloat(val)
                                                
                                                // Calculate max possible payment (Total Debt)
                                                const maxAmount = fullCronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)
                                                
                                                // Allow empty string or valid number <= maxAmount
                                                if (val === '' || (numericVal >= 0 && numericVal <= maxAmount + 0.01)) { // Added small buffer for float precision
                                                    setAmount(val)
                                                } else if (numericVal > maxAmount) {
                                                    // Clamp to max
                                                    setAmount(maxAmount.toFixed(2))
                                                    toast.warning(`El monto no puede exceder la deuda total ($${maxAmount.toFixed(2)})`)
                                                }
                                            }}
                                            min="0"
                                            max={fullCronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)}
                                            className="pl-8 text-2xl font-bold bg-slate-950 border-slate-700 h-14 focus-visible:ring-emerald-500/50"
                                            autoFocus
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mb-2">
                                        Saldo Pendiente Cuota #{quota?.numero_cuota}: <b>${(quota?.monto_cuota - (quota?.monto_pagado||0)).toFixed(2)}</b>
                                    </p>
                                    
                                    <div className="space-y-2 mt-4">
                                        <Label className="text-slate-300">Método de Pago</Label>
                                        <select 
                                            value={metodoPago}
                                            onChange={(e) => setMetodoPago(e.target.value)}
                                            className="w-full h-12 px-4 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500/50 appearance-none text-sm"
                                        >
                                            <option value="Efectivo">💵 Efectivo</option>
                                            <option value="Yape">📱 Yape</option>
                                        </select>
                                    </div>
                                </div>
                                
                                {fullCronograma.filter(c => c.fecha_vencimiento < new Date().toISOString().split('T')[0] && c.estado !== 'pagado').length > 0 && quota?.fecha_vencimiento === today && (
                                    <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-3 flex gap-3">
                                        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
                                        <div className="text-xs text-blue-200/80">
                                            <span className="font-bold text-blue-400">Modo Ruta:</span> Se prioriza el cobro de la cuota del día para mantener la meta diaria. 
                                            {fullCronograma.filter(c => c.fecha_vencimiento < new Date().toISOString().split('T')[0] && c.estado !== 'pagado').length} cuotas antiguas seguirán pendientes.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!canPayDueToTime && (
                           <div className="mx-6 mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                               <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0">
                                   <Lock className="w-5 h-5 text-rose-500" />
                               </div>
                               <div>
                                   <p className="text-rose-400 font-bold text-sm">Sistema Cerrado</p>
                                   <p className="text-slate-400 text-xs leading-tight">
                                       Registro habilitado de {apertura} a {cierre}. 
                                       {isTemporaryUnlocked ? " (Desbloqueo activo)" : " Solicite un desbloqueo si es urgente."}
                                   </p>
                               </div>
                           </div>
                        )}
                        
                        <DialogFooter className="sm:justify-between gap-2 mt-4 p-6 pt-0">
                            <Button variant="ghost" onClick={handleClose} disabled={loading} className="text-slate-400 hover:text-white">
                                Cancelar
                            </Button>
                            <Button 
                                onClick={handlePayment} 
                                disabled={loading || !amount || !canPayDueToTime}
                                className={`bg-emerald-600 hover:bg-emerald-500 text-white font-bold w-full sm:w-auto shadow-lg shadow-emerald-900/20 ${
                                    !canPayDueToTime ? 'opacity-50 grayscale cursor-not-allowed' : ''
                                }`}
                            >
                                {loading ? 'Procesando...' : !canPayDueToTime ? 'Sistema Cerrado' : 'Confirmar Cobro'}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    // VOUCHER STATE (Replicated from CronogramaClient)
                    <div className="bg-slate-900 border-slate-800 text-white w-full overflow-hidden p-0">
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
                                        
                                        {/* DEBT SUMMARY */}
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
                            <Button onClick={handleClose} variant="ghost" className="flex-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl">
                                Cerrar
                            </Button>
                            <Button onClick={handleShare} disabled={sharing} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20">
                                {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                                Compartir
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
