'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Search, ChevronRight, CheckCircle, Smartphone, User, CreditCard, DollarSign, Printer, ArrowRight, FileText, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { VoucherContent } from '@/components/comunes/voucher-content'
import { api } from '@/services/api'
import { Lock, AlertCircle } from 'lucide-react'

interface PaymentWizardProps {
    userRol?: 'admin' | 'supervisor' | 'asesor'
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        desbloqueo_hasta: string
    }
    onClose?: () => void
}

interface PaymentResult {
    success: boolean
    cuotas_pagadas: number
    cuotas_abonadas: number
    monto_sobrante: number
    interes_cobrado: number
    capital_cobrado: number
    pago_id: string
    distribucion: Array<{
        cuota: number
        monto_aplicado: number
        tipo: 'pago_completo' | 'abono' | 'pago_mora' | 'abono_mora' | 'pago_adelantado' | 'abono_adelantado'
    }>
    // Nuevos campos del SP
    total_cuotas_pagadas?: number
    total_cuotas?: number
    cuotas_pendientes?: number
    saldo_pendiente_total?: number
}

export function PaymentWizard({ userRol = 'asesor', systemSchedule, onClose }: PaymentWizardProps) {
    const [step, setStep] = useState(1)
    const [query, setQuery] = useState('')
    const [clients, setClients] = useState<any[]>([])
    const [selectedClient, setSelectedClient] = useState<any>(null)
    const [loans, setLoans] = useState<any[]>([])
    const [selectedLoan, setSelectedLoan] = useState<any>(null)
    const [historyPayments, setHistoryPayments] = useState<any[]>([])
    const [quotas, setQuotas] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [payingQuota, setPayingQuota] = useState<any>(null)
    const [amount, setAmount] = useState('')
    const [metodoPago, setMetodoPago] = useState('')
    const [paymentResult, setPaymentResult] = useState<any>(null) // Para voucher
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
    const [locationError, setLocationError] = useState<boolean>(false)

    const supabase = createClient()
    const router = useRouter()

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

    const timeToMinutes = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number)
        return h * 60 + m
    }

    const tNow = timeToMinutes(currentHourString)
    const tApertura = timeToMinutes(apertura)
    const tCierre = timeToMinutes(cierre)
    const desbloqueoHasta = systemSchedule?.desbloqueo_hasta ? new Date(systemSchedule.desbloqueo_hasta) : null
    
    const isWithinHours = tNow >= tApertura && tNow < tCierre
    const isTemporaryUnlocked = desbloqueoHasta && now < desbloqueoHasta
    
    // Solo admin se salta el bloqueo de horario
    const canPayDueToTime = isWithinHours || isTemporaryUnlocked || userRol === 'admin'
    // --- FIN LOGICA DE HORARIO ---

    const searchClients = async (q: string) => {
        setQuery(q)
        if (q.length < 2) return
        const { data } = await supabase.from('clientes').select('id, nombres, dni').or(`nombres.ilike.%${q}%,dni.ilike.%${q}%`).limit(5)
        if (data) setClients(data)
    }

    const selectClient = async (client: any) => {
        setSelectedClient(client)
        setStep(2)
        // Fetch active loans
        const { data } = await supabase.from('prestamos').select('*').eq('cliente_id', client.id).eq('estado', 'activo')
        if (data) setLoans(data)
    }

    const selectLoan = async (loan: any) => {
        setSelectedLoan(loan)
        setStep(3)
        // 1. Fetch ALL quotas (active and paid)
        const { data: qData } = await supabase.from('cronograma_cuotas')
            .select('*')
            .eq('prestamo_id', loan.id)
            .order('numero_cuota', { ascending: true })
        if (qData) setQuotas(qData)

        // 2. Fetch history payments (for voucher calculations and virtual distribution)
        const idsCuotas = qData?.map((c: any) => c.id) || [];
        const { data: hDataRaw } = idsCuotas.length > 0 
            ? await supabase.from('pagos')
                .select('*, perfiles(nombre_completo)')
                .in('cuota_id', idsCuotas)
                .order('created_at', { ascending: true })
            : { data: [] };
        
        const hData = hDataRaw || [];
        setHistoryPayments(hData);
        
        // 3. Virtual Distribution (Para arreglar que la cuota 9 saga pendiente)
        let virtualQData = qData || [];
        if (qData) {
            const sorted = [...qData].sort((a, b) => a.numero_cuota - b.numero_cuota)
            const totalPagadoHistorico = hData.reduce((acc, p) => acc + (parseFloat(p.monto_pagado) || 0), 0)
            let remainingToDistribute = totalPagadoHistorico
            
            virtualQData = sorted.map(c => {
                const montoCuota = parseFloat(c.monto_cuota || 0)
                let pagadoEnEstaCuota = 0
                if (remainingToDistribute >= montoCuota - 0.01) {
                    pagadoEnEstaCuota = montoCuota
                    remainingToDistribute -= montoCuota
                } else if (remainingToDistribute > 0) {
                    pagadoEnEstaCuota = Math.round(remainingToDistribute * 100) / 100
                    remainingToDistribute = 0
                }
                
                // Actualizado dinámicamente para que la UI no permita re-pagar excedentes
                const estado = (montoCuota - pagadoEnEstaCuota) <= 0.01 ? 'pagado' : c.estado
                
                return {
                    ...c,
                    monto_pagado: pagadoEnEstaCuota,
                    estado: estado
                }
            })
            setQuotas(virtualQData)
        }

        if (qData) {
            // Lógica de Cuota Inteligente
            const today = new Date().toLocaleString("en-CA", { timeZone: "America/Lima" }).split(',')[0]
            const todayQuota = qData.find((c: any) => c.fecha_vencimiento === today && c.estado !== 'pagado')
            const oldestPending = qData.find((c: any) => c.estado !== 'pagado')
            const targetQuota = todayQuota || oldestPending
            if (targetQuota) initiatePayment(targetQuota)
        }
    }

    const initiatePayment = (quota: any) => {
        setPayingQuota(quota)
        const pending = quota.monto_cuota - (quota.monto_pagado || 0)
        setAmount(pending.toString())
        
        // Intentar capturar ubicación al iniciar pago
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => {
                    console.warn("Location denied or error:", err);
                    setLocationError(true);
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }

    const confirmPayment = async () => {
        if (!payingQuota || !amount || !selectedLoan) return
        setLoading(true)

        try {
            console.log('Confirmando Pago para Préstamo ID:', selectedLoan.id)
            
            const apiResult = await api.pagos.registrar({ 
                cuota_id: payingQuota.id, 
                monto: parseFloat(amount), 
                metodo_pago: metodoPago,
                latitud: location?.lat,
                longitud: location?.lng
            })
            
            // RE-FETCH DATA FROM DB WITH ABSOLUTE CERTAINTY
            const { data: qData } = await supabase.from('cronograma_cuotas')
                .select('*')
                .eq('prestamo_id', selectedLoan.id)
                .order('numero_cuota', { ascending: true });
                
            const idsCuotas = qData?.map((c: any) => c.id) || [];
            const { data: hData } = idsCuotas.length > 0 
                ? await supabase.from('pagos')
                    .select('*, perfiles(nombre_completo)')
                    .in('cuota_id', idsCuotas)
                    .order('created_at', { ascending: true })
                : { data: [] };

            const qRes = { data: qData };
            const hRes = { data: hData };

            console.log('Wizard Refetch Results:', { 
                quotasCount: qRes.data?.length, 
                historyCount: hRes.data?.length,
                lastPaymentId: apiResult.pago_id 
            })

            if (qRes.data) setQuotas(qRes.data)
            if (hRes.data) setHistoryPayments(hRes.data)

            // Buscar el pago específico recién creado en el historial real para el voucher
            const actualPayment = hRes.data?.find(p => p.id === apiResult.pago_id)
            
            if (actualPayment) {
                setPaymentResult(actualPayment)
                setStep(4) 
                toast.success('Pago Registrado Exitosamente')
            } else {
                setPaymentResult({
                    id: apiResult.pago_id,
                    created_at: new Date().toISOString(),
                    monto_pagado: parseFloat(amount),
                    pago_monto: parseFloat(amount),
                    prestamo_id: selectedLoan.id,
                    distribucion: apiResult.distribucion || []
                })
                setStep(4) 
            }
        } catch (err: any) {
            console.error('Wizard Confirm Payment Fatal Error:', err)
            toast.error('Error al registrar pago', { description: err.message })
        } finally {
            setLoading(false)
        }
    }

    const handleNewPayment = () => {
        // Reset todo para nuevo pago
        setStep(1)
        setQuery('')
        setClients([])
        setSelectedClient(null)
        setLoans([])
        setSelectedLoan(null)
        setQuotas([])
        setPayingQuota(null)
        setAmount('')
        setMetodoPago('Efectivo')
        setPaymentResult(null)
    }

    const getTipoLabel = (tipo: string) => {
        const labels: Record<string, { text: string, color: string }> = {
            'pago_completo': { text: 'Pago Completo', color: 'text-emerald-400' },
            'abono': { text: 'Abono Parcial', color: 'text-blue-400' },
            'pago_mora': { text: 'Pago Mora', color: 'text-orange-400' },
            'abono_mora': { text: 'Abono a Mora', color: 'text-orange-300' },
            'pago_adelantado': { text: 'Pago Adelantado', color: 'text-purple-400' },
            'abono_adelantado': { text: 'Abono Adelantado', color: 'text-purple-300' },
        }
        return labels[tipo] || { text: tipo, color: 'text-slate-400' }
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl mx-auto">
            {/* Steps Indicator - Premium Progress Bar (Adapted for Mobile) */}
            <div className="relative mb-10 md:mb-12">
                <div className="absolute left-0 top-1/2 w-full h-1 bg-slate-800 -z-10 rounded-full" />
                <div 
                    className={`absolute left-0 top-1/2 h-1 -z-10 rounded-full transition-all duration-500 ${
                        step === 4 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-purple-600'
                    }`}
                    style={{ width: `${((step - 1) / 3) * 100}%` }}
                />
                
                <div className="flex justify-between">
                    {[
                        { id: 1, label: 'Cliente', icon: User },
                        { id: 2, label: 'Préstamo', icon: CreditCard },
                        { id: 3, label: 'Pago', icon: DollarSign },
                        { id: 4, label: 'Voucher', icon: FileText }
                    ].map((s) => (
                        <div key={s.id} className="flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 sm:border-4 transition-all duration-300 ${
                                step >= s.id 
                                ? step === 4 && s.id === 4
                                    ? 'bg-slate-900 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                                    : 'bg-slate-900 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
                                : 'bg-slate-900 border-slate-700 text-slate-600'
                            }`}>
                                {s.id === 4 && step === 4 ? <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" /> : <s.icon className="w-3 h-3 sm:w-4 sm:h-4" />}
                            </div>
                            <span className={`text-[7px] sm:text-xs font-bold uppercase tracking-wider ${
                                step >= s.id ? (step === 4 && s.id === 4 ? 'text-emerald-400' : 'text-blue-400') : 'text-slate-600'
                            }`}>
                                <span className="hidden xs:inline">{s.label}</span>
                                <span className="xs:hidden">{s.label.charAt(0)}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Step 1: Search Client */}
            {step === 1 && (
                <div className="space-y-6">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl opacity-20 group-hover:opacity-30 blur-xl transition-all" />
                        <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
                            <Search className="absolute left-4 xs:left-6 top-4 xs:top-5 h-5 w-5 xs:h-6 xs:w-6 text-slate-400" />
                            <Input
                                placeholder="Buscar cliente por DNI o Nombre..."
                                value={query}
                                onChange={(e) => searchClients(e.target.value)}
                                className="pl-12 xs:pl-16 h-14 xs:h-16 bg-transparent border-none text-base xs:text-xl text-white placeholder:text-slate-500 focus-visible:ring-0"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="grid gap-3">
                        {clients.map(client => (
                            <div 
                                key={client.id} 
                                onClick={() => selectClient(client)}
                                className="group cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all duration-200 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold group-hover:bg-blue-500/10 group-hover:text-blue-400 transition-colors">
                                        {client.nombres.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-200 group-hover:text-white transition-colors">{client.nombres}</div>
                                        <div className="text-sm text-slate-500 font-mono">{client.dni}</div>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-blue-400 transition-colors" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Step 2: Select Loan */}
            {step === 2 && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-900/10 border border-blue-900/30">
                        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                            {selectedClient.nombres.charAt(0)}
                        </div>
                        <div>
                            <div className="text-xs text-blue-300/70 uppercase font-bold tracking-wider">Cliente Seleccionado</div>
                            <div className="text-blue-100 font-medium">{selectedClient.nombres}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="ml-auto text-blue-300 hover:text-white">
                            Cambiar
                        </Button>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider pl-1">Préstamos Activos</h3>
                        {loans.length === 0 ? (
                            <div className="text-center py-12 rounded-2xl bg-slate-900/30 border border-dashed border-slate-800 text-slate-500">
                                Sin préstamos activos para este cliente.
                            </div>
                        ) : (
                            loans.map(loan => (
                                <div 
                                    key={loan.id} 
                                    onClick={() => selectLoan(loan)}
                                    className="group cursor-pointer relative overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-blue-500/50 transition-all duration-300 shadow-lg hover:shadow-blue-900/20"
                                >
                                    <div className="absolute right-0 top-0 p-4 opacity-10">
                                        <CreditCard className="w-32 h-32 text-white transform translate-x-8 -translate-y-8" />
                                    </div>
                                    
                                    <div className="relative flex justify-between items-center">
                                        <div>
                                            <div className="text-sm text-slate-500 font-medium mb-1">Monto Principal</div>
                                            <div className="text-3xl font-bold text-white tracking-tight group-hover:text-blue-400 transition-colors">
                                                ${loan.monto}
                                            </div>
                                            <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                                                    {loan.fecha_inicio}
                                                </span>
                                                <span>a</span>
                                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                                                    {loan.fecha_fin}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Select Quota & Pay */}
            {step === 3 && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between text-sm text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                        <span>Préstamo de <b>${selectedLoan.monto}</b></span>
                        <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="h-auto py-1 px-2 hover:text-white">
                            Cambiar
                        </Button>
                    </div>

                    {!payingQuota ? (
                         <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {quotas.map(quota => {
                                const pending = quota.monto_cuota - (quota.monto_pagado || 0)
                                const isPaid = quota.estado === 'pagado'
                                const isOverdue = !isPaid && new Date(quota.fecha_vencimiento) < new Date()
                                
                                return (
                                    <div key={quota.id} className={`group p-4 rounded-xl border transition-all flex justify-between items-center ${
                                        isPaid 
                                            ? 'bg-emerald-900/10 border-emerald-900/30 opacity-70' 
                                            : 'bg-slate-900/40 border-slate-800 hover:bg-slate-900/80'
                                    }`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${
                                                isPaid 
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : isOverdue ? 'bg-red-500/10 text-red-500' : 'bg-slate-800 text-slate-300'
                                            }`}>
                                                {isPaid ? <CheckCircle className="w-5 h-5" /> : `#${quota.numero_cuota}`}
                                            </div>
                                            <div>
                                                <div className="text-sm text-slate-500 font-mono">{quota.fecha_vencimiento}</div>
                                                <div className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                                                    {isOverdue ? 'Vencido' : 'Pendiente'}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-right">
                                            <div className="font-bold text-white text-lg">${pending.toFixed(2)}</div>
                                            {isPaid ? (
                                                <Button size="sm" variant="ghost" disabled className="text-emerald-500 font-bold bg-transparent">
                                                    Pagado
                                                </Button>
                                            ) : (
                                                <Button 
                                                    size="sm" 
                                                    onClick={() => initiatePayment(quota)} 
                                                    disabled={quotas.some(q => q.numero_cuota < quota.numero_cuota && q.estado !== 'pagado')}
                                                    className="mt-1 h-8 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all w-full disabled:opacity-30 disabled:grayscale"
                                                >
                                                    {quotas.some(q => q.numero_cuota < quota.numero_cuota && q.estado !== 'pagado') ? 'Bloqueado' : 'Pagar'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            {quotas.length === 0 && <div className="text-center text-slate-500 py-8">¡Todo pagado! No hay cuotas pendientes.</div>}
                        </div>
                    ) : (
                        <div className="animate-in zoom-in-50 duration-300">
                             <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                                
                                <div className="text-center mb-8">
                                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
                                        <DollarSign className="w-8 h-8" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-white">Confirmar Pago</h2>
                                    <p className="text-slate-400 mt-1">Cuota #{payingQuota.numero_cuota} • Vence el {payingQuota.fecha_vencimiento}</p>
                                </div>

                                <div className="space-y-6 max-w-sm mx-auto">
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl font-bold">$</span>
                                        <Input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                const numericVal = parseFloat(val)
                                                // Calculate max logic (Total Debt)
                                                const maxAmount = quotas.reduce((acc, q) => acc + (q.monto_cuota - (q.monto_pagado || 0)), 0)
                                                
                                                if (val === '' || (numericVal >= 0 && numericVal <= maxAmount + 0.01)) {
                                                    setAmount(val)
                                                } else if (numericVal > maxAmount) {
                                                    setAmount(maxAmount.toFixed(2))
                                                    toast.warning(`El monto no puede exceder la deuda total ($${maxAmount.toFixed(2)})`)
                                                }
                                            }}
                                            min="0"
                                            max={quotas.reduce((acc, q) => acc + (q.monto_cuota - (q.monto_pagado || 0)), 0)}
                                            className="pl-10 text-center text-4xl font-bold bg-slate-950 border-slate-700 h-20 rounded-2xl focus:border-emerald-500/50 focus:ring-emerald-500/20"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-slate-300 text-xs font-bold uppercase tracking-wider ml-1">Método de Pago</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setMetodoPago('Efectivo')}
                                                className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all duration-200 ${
                                                    metodoPago === 'Efectivo' 
                                                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                                                    : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                                }`}
                                            >
                                                <span className="text-2xl">💵</span>
                                                <span className="font-bold text-xs">Efectivo</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMetodoPago('Yape')}
                                                className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all duration-200 ${
                                                    metodoPago === 'Yape' 
                                                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                                                    : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                                }`}
                                            >
                                                <span className="text-2xl">📱</span>
                                                <span className="font-bold text-xs">Yape</span>
                                            </button>
                                        </div>
                                    </div>

                                    {locationError && (
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 animate-in fade-in">
                                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                            <div className="text-left">
                                                <p className="text-amber-400 font-bold text-[10px] uppercase">Aviso de Ubicación</p>
                                                <p className="text-slate-400 text-[10px] leading-tight">GPS no disponible. El cobro se registrará sin ubicación pero es recomendable activarlo.</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 xs:gap-4">
                                        <Button 
                                            variant="outline" 
                                            onClick={() => onClose ? onClose() : setPayingQuota(null)} 
                                            className="h-12 border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300"
                                        >
                                            Cancelar
                                        </Button>
                                        <Button 
                                            onClick={confirmPayment} 
                                            disabled={loading || !canPayDueToTime || !metodoPago} 
                                            className={`h-12 font-bold shadow-lg transition-all ${
                                                !canPayDueToTime || !metodoPago
                                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                                : metodoPago === 'Efectivo'
                                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'
                                            }`}
                                        >
                                            {loading ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    <span>Procesando...</span>
                                                </div>
                                            ) : (
                                                !canPayDueToTime ? 'Sistema Cerrado' : !metodoPago ? 'Elegir Método' : 'Confirmar Pago'
                                            )}
                                        </Button>
                                    </div>

                                    {!canPayDueToTime && (
                                        <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                                            <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0">
                                                <Lock className="w-5 h-5 text-rose-500" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-rose-400 font-bold text-sm">Registro Inhabilitado</p>
                                                <p className="text-slate-400 text-xs leading-tight">
                                                    La jornada de cobros es de {apertura} a {cierre}. 
                                                    {isTemporaryUnlocked ? " (Desbloqueo temporal activo)" : " Fora de este horario solo el Administrador puede registrar."}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                             </div>
                        </div>
                    )}
                </div>
            )}

            {/* Step 4: Voucher */}
            {step === 4 && paymentResult && (
                <div className="animate-in zoom-in-50 duration-500">
                    <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl overflow-hidden shadow-2xl relative">
                        <VoucherContent 
                            payment={paymentResult}
                            loan={selectedLoan}
                            client={selectedClient}
                            cronograma={quotas}
                            allPayments={historyPayments}
                        />

                        {/* Acciones del Wizard */}
                        <div className="p-6 bg-slate-950/50 border-t border-slate-800 space-y-4">
                            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                <Button 
                                    variant="outline" 
                                    onClick={handleNewPayment}
                                    className="h-12 border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300"
                                >
                                    Nuevo Pago
                                </Button>
                                <Button 
                                    variant="outline"
                                    onClick={() => {
                                        router.push('/dashboard/pagos')
                                        router.refresh()
                                    }}
                                    className="h-12 border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300"
                                >
                                    <FileText className="w-4 h-4 mr-2" />
                                    Ver Pagos
                                </Button>
                            </div>
                            
                            {/* BOTÓN WHATSAPP DESTACADO */}
                            <Button 
                                onClick={() => {
                                    const mensaje = encodeURIComponent(
                                        `💸 *COMPROBANTE DE PAGO*\n\n` +
                                        `👤 *Cliente:* ${selectedClient.nombres}\n` +
                                        `💰 *Monto:* S/ ${parseFloat(amount).toFixed(2)}\n` +
                                        `✅ *Estado:* Pago Registrado\n\n` +
                                        `¡Gracias por su puntualidad!`
                                    )
                                    window.open(`https://wa.me/51${selectedClient.telefono || ''}?text=${mensaje}`, '_blank')
                                }}
                                className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg rounded-2xl shadow-lg shadow-emerald-900/40 group transition-all"
                            >
                                <MessageCircle className="w-6 h-6 mr-3 group-hover:scale-110 transition-transform" />
                                Enviar Recibo por WhatsApp
                            </Button>

                            {onClose && (
                                <div className="mt-4 border-t border-slate-800 pt-4">
                                    <Button 
                                        onClick={onClose}
                                        className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700"
                                    >
                                        <ArrowRight className="w-4 h-4 mr-2" />
                                        Finalizar y Cerrar
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
