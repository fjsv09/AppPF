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
    prestamoId?: string // Optional if prestamo object is passed
    prestamo?: any // Optional if prestamoId is passed
    today?: string // Optional, will calculate if missing
    userRol?: 'admin' | 'supervisor' | 'asesor'
    onSuccess?: (result?: any) => void
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        desbloqueo_hasta: string
    }
    isBlockedByCuadre?: boolean
    blockReasonCierre?: string
}

export function QuickPayModal({ 
    open, 
    onOpenChange, 
    prestamoId,
    prestamo: initialPrestamo, 
    today: initialToday, 
    userRol = 'asesor', 
    onSuccess, 
    systemSchedule, 
    isBlockedByCuadre, 
    blockReasonCierre 
}: QuickPayModalProps) {
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState('')
    const [metodoPago, setMetodoPago] = useState('Efectivo')
    const [quota, setQuota] = useState<any>(null)
    const [fetching, setFetching] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [fullCronograma, setFullCronograma] = useState<any[]>([])
    const [prestamo, setPrestamo] = useState<any>(initialPrestamo)

    // Sharing State
    const receiptRef = useRef<HTMLDivElement>(null)
    const [sharing, setSharing] = useState(false)
    const [lastPayment, setLastPayment] = useState<any>(null)

    const supabase = createClient()

    // Calculate Today Peru if not provided
    const today = initialToday || new Date().toLocaleString("en-CA", { timeZone: "America/Lima" }).split(',')[0]

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
    const cierre = systemSchedule?.horario_cierre || '22:00' // Default higher for flexibility
    const desbloqueoHasta = systemSchedule?.desbloqueo_hasta ? new Date(systemSchedule.desbloqueo_hasta) : null
    
    const isWithinHours = currentHourString >= apertura && currentHourString < cierre
    const isTemporaryUnlocked = desbloqueoHasta && now < desbloqueoHasta
    
    const canPayDueToTime = isWithinHours || isTemporaryUnlocked || userRol === 'admin'
    // --- FIN LOGICA DE HORARIO ---

    useEffect(() => {
        if (open && !result) {
            if (initialPrestamo) {
                setPrestamo(initialPrestamo)
                fetchSmartQuota(initialPrestamo.id)
            } else if (prestamoId) {
                fetchPrestamoData(prestamoId)
            }
            setLastPayment(null)
        }
    }, [open, prestamoId, initialPrestamo, result])

    useEffect(() => {
        if (!open) {
            setResult(null)
            setLastPayment(null)
        }
    }, [open])

    const fetchPrestamoData = async (id: string) => {
        setFetching(true)
        try {
            const { data, error } = await supabase
                .from('prestamos')
                .select('*, clientes(id, nombres, dni, telefono)')
                .eq('id', id)
                .single()
            
            if (data) {
                setPrestamo(data)
                fetchSmartQuota(id)
            }
        } catch (error) {
            console.error('Error fetching loan', error)
            toast.error('Error al cargar datos del préstamo')
        }
    }

    const fetchSmartQuota = async (id: string) => {
        setFetching(true)
        try {
            const { data: cronograma } = await supabase
                .from('cronograma_cuotas')
                .select('*')
                .eq('prestamo_id', id)
                .order('fecha_vencimiento', { ascending: true })

            if (cronograma) {
                setFullCronograma(cronograma)
                
                // Prioritize Today's quota, then Oldest Pending
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
            setLoading(false)
            setFetching(false)
        }
    }

    const handleShare = async () => {
        if (!receiptRef.current) return
        setSharing(true)
        try {
            const canvas = await toBlob(receiptRef.current, { cacheBust: true, pixelRatio: 2 })
            if (!canvas) throw new Error('Error al generar imagen')

            const file = new File([canvas], `comprobante-${lastPayment?.operacion}.png`, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Comprobante de Pago',
                    text: `Pago registrado de ${prestamo?.clientes?.nombres}`
                })
            } else {
                const link = document.createElement('a')
                link.download = `comprobante-${lastPayment?.operacion}.png`
                link.href = URL.createObjectURL(canvas)
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
        if (!quota || !amount || parseFloat(amount) <= 0) return
        setLoading(true)
        try {
            const payAmount = parseFloat(amount)
            const res = await api.pagos.registrar({ 
                cuota_id: quota.id, 
                monto: payAmount,
                metodo_pago: metodoPago
            })
            setResult(res)
            
            // Re-fetch cronograma to ensure stats are 100% accurate AFTER the payment
            const { data: updatedCronograma } = await supabase
                .from('cronograma_cuotas')
                .select('*')
                .eq('prestamo_id', prestamo.id)
                .order('fecha_vencimiento', { ascending: true })
            
            const freshCronograma = updatedCronograma || fullCronograma
            if (updatedCronograma) setFullCronograma(updatedCronograma)

            const totalCuotas = freshCronograma.length
            const totalPagadas = freshCronograma.filter(c => c.estado === 'pagado').length
            const atrasadasAfter = freshCronograma.filter(c => c.fecha_vencimiento < today && c.estado !== 'pagado').length
            const saldoTotal = freshCronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)

            setLastPayment({
                monto: payAmount,
                cuota: quota.numero_cuota,
                fecha: new Date().toLocaleDateString('es-PE'),
                hora: new Date().toLocaleTimeString('es-PE'),
                operacion: res?.pago_id?.slice?.(-10)?.toUpperCase() || Math.random().toString(36).substr(2, 9).toUpperCase(),
                cliente: prestamo?.clientes?.nombres || 'Cliente',
                pagadas: totalPagadas,
                totalCuotas: totalCuotas,
                cuotasAtrasadas: atrasadasAfter,
                saldoPendiente: saldoTotal,
                pago_id: res?.pago_id
            })

            toast.success('Pago registrado correctamente')
            if (onSuccess) onSuccess(res)
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
                                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950 rounded-xl border border-slate-800">
                                    <div>
                                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Total de la Cuota</p>
                                        <p className="text-lg font-semibold text-slate-300">${quota?.monto_cuota?.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Monto Pendiente</p>
                                        <p className="text-lg font-bold text-rose-400">
                                            ${(quota?.monto_cuota - (quota?.monto_pagado||0)).toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3 mt-2">
                                    <Label htmlFor="amount" className="text-sm font-medium text-slate-300">¿Cuánto va a cobrar?</Label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                        <Input
                                            id="amount"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                const numericVal = parseFloat(val)
                                                const maxAmount = fullCronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)
                                                
                                                if (val === '' || (numericVal >= 0 && numericVal <= maxAmount + 0.01)) {
                                                    setAmount(val)
                                                } else if (numericVal > maxAmount) {
                                                    setAmount(maxAmount.toFixed(2))
                                                    toast.warning(`El monto no puede exceder la deuda total ($${maxAmount.toFixed(2)})`)
                                                }
                                            }}
                                            className="pl-10 h-12 text-xl font-bold bg-slate-950 border-slate-700 text-white rounded-xl focus-visible:ring-emerald-500/50"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                
                                <div className="space-y-2 mt-2">
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

                        {isBlockedByCuadre && (
                            <div className="mx-6 mt-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-rose-400 font-bold text-sm">Registro de Pagos Bloqueado</h4>
                                    <p className="text-rose-200/80 text-xs mt-1 leading-tight">
                                        {blockReasonCierre}
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
                                disabled={loading || !amount || !canPayDueToTime || isBlockedByCuadre}
                                className={`bg-emerald-600 hover:bg-emerald-500 text-white font-bold w-full sm:w-auto shadow-lg shadow-emerald-900/20 ${
                                    (!canPayDueToTime || isBlockedByCuadre) ? 'opacity-50 grayscale cursor-not-allowed' : ''
                                }`}
                            >
                                {loading ? 'Procesando...' : !canPayDueToTime ? 'Sistema Cerrado' : isBlockedByCuadre ? 'Bloqueado' : 'Confirmar Cobro'}
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
                                                <span className="text-slate-300">Progreso</span>
                                                <span className="text-emerald-400 font-bold">{lastPayment.pagadas} de {lastPayment.totalCuotas} cuotas</span>
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
