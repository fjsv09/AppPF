'use client'

import { useState, useMemo, useEffect } from 'react'
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
    Plus, 
    Search, 
    User, 
    DollarSign, 
    Calendar, 
    Hash, 
    Percent, 
    Loader2, 
    CheckCircle2, 
    AlertTriangle,
    CreditCard,
    ArrowRight
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { 
    CUOTAS_ESTANDAR, 
    calcularFechasProyectadas, 
    calcularInteresProporcional 
} from '@/lib/financial-logic'
import { formatDate } from '@/utils/format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'

interface Cliente {
    id: string
    nombres: string
    dni: string
    telefono?: string
    direccion?: string
    referencia?: string
    ocupacion?: string
    limite_prestamo?: number
}

interface Cuenta {
    id: string
    nombre: string
    saldo: number
}

interface AdminNuevoPrestamoModalProps {
    isOpen: boolean
    onClose: () => void
    cuentas: Cuenta[]
    feriados: string[]
}

export function AdminNuevoPrestamoModal({ isOpen, onClose, cuentas, feriados }: AdminNuevoPrestamoModalProps) {
    const [loading, setLoading] = useState(false)
    const [searching, setSearching] = useState(false)
    const [clients, setClients] = useState<Cliente[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
    const [showSuccess, setShowSuccess] = useState(false)
    const [wasNotified, setWasNotified] = useState(false)
    const [createdLoanId, setCreatedLoanId] = useState<string>('')
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])

    const feriadosSet = useMemo(() => new Set(feriados), [feriados])

    // Form data
    const [formData, setFormData] = useState({
        monto: '',
        interes_base: '20',
        fecha_inicio: new Date().toISOString().split('T')[0],
        modalidad: 'diario' as keyof typeof CUOTAS_ESTANDAR,
        cuotas: '24',
        cuenta_id: ''
    })

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // Client search logic - DIRECT TO DB
    useEffect(() => {
        const controller = new AbortController()
        
        if (!searchTerm || searchTerm.length < 3) {
            setClients([])
            setSearching(false)
            return () => controller.abort()
        }

        const runSearch = async () => {
            setSearching(true)
            try {
                const { data, error } = await supabase
                    .from('clientes')
                    .select('id, nombres, dni, telefono, direccion, referencia, ocupacion, limite_prestamo')
                    .or(`nombres.ilike.%${searchTerm}%,dni.ilike.%${searchTerm}%`)
                    .limit(20)

                if (!controller.signal.aborted) {
                    if (error) {
                        toast.error('Error al buscar clientes')
                    } else {
                        setClients(data || [])
                    }
                }
            } catch (err: any) {
                if (!controller.signal.aborted) toast.error('Fallo en búsqueda')
            } finally {
                if (!controller.signal.aborted) setSearching(false)
            }
        }

        const timer = setTimeout(runSearch, 300)
        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [searchTerm, supabase])

    // Financial calculations
    const calcInteres = useMemo(() => {
        return calcularInteresProporcional(
            parseInt(formData.cuotas) || 0,
            formData.modalidad,
            parseFloat(formData.interes_base) || 20
        )
    }, [formData.cuotas, formData.modalidad, formData.interes_base])

    const calcFechas = useMemo(() => {
        return calcularFechasProyectadas(
            formData.fecha_inicio,
            parseInt(formData.cuotas) || 0,
            formData.modalidad,
            feriadosSet
        )
    }, [formData.fecha_inicio, formData.cuotas, formData.modalidad, feriadosSet])

    const monto = parseFloat(formData.monto) || 0
    const totalPagar = monto * (1 + calcInteres.interes / 100)
    const cuotaMonto = (parseInt(formData.cuotas) || 1) > 0 ? totalPagar / (parseInt(formData.cuotas) || 1) : 0

    const handleCreate = async () => {
        if (!selectedClient) {
            toast.error('Debe seleccionar un cliente')
            return
        }
        if (!formData.monto || !formData.cuotas || !formData.cuenta_id) {
            toast.error('Faltan campos obligatorios')
            return
        }

        const currentAccount = cuentas.find(c => c.id === formData.cuenta_id)
        if (currentAccount && currentAccount.saldo < monto) {
            toast.error('Saldo insuficiente', {
                description: `La cuenta seleccionada no tiene fondos suficientes (${currentAccount.saldo.toLocaleString()}).`
            })
            return
        }

        const clientLimit = selectedClient.limite_prestamo || 0
        if (clientLimit > 0 && monto > clientLimit) {
            toast.error('Límite excedido', {
                description: `El monto (S/ ${monto}) supera el límite permitido para este cliente (S/ ${clientLimit}).`
            })
            return
        }

        setLoading(true)
        try {
            // CREACIÓN DIRECTA EN UN SOLO PASO (Bypass de solicitudes)
            const response = await fetch('/api/prestamos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: selectedClient.id,
                    monto: monto,
                    interes: calcInteres.interes,
                    cuotas: parseInt(formData.cuotas),
                    frecuencia: formData.modalidad,
                    fecha_inicio: formData.fecha_inicio,
                    cuenta_id: formData.cuenta_id
                })
            })

            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.error || 'Fallo en la creación del préstamo')
            }

            // ÉXITO TOTAL
            toast.success('¡Préstamo Desembolsado!', {
                description: 'El crédito ha sido activado y el dinero descontado de la cuenta.'
            })
            
            setCreatedLoanId(result.id)
            setShowSuccess(true)
            
            // Navegación rápida (solo refresh, no push aun)
            router.refresh()

        } catch (error: any) {
            console.error('Error in Admin Creation Flow:', error)
            toast.error('Fallo en desembolso', {
                description: error.message
            })
        } finally {
            setLoading(false)
        }
    }

    const handleSendWhatsApp = () => {
        if (!selectedClient) return
        const phone = selectedClient.telefono?.replace(/\D/g, '') || ''
        const montoStr = monto.toLocaleString('en-US')
        const message = encodeURIComponent(`Hola ${selectedClient.nombres}, le saludamos de ProFinanzas. Le informamos que su nuevo préstamo por un monto de S/ ${montoStr} ha sido DESEMBOLSADO. ¡Muchas gracias por su preferencia!`)
        
        window.open(`https://wa.me/51${phone}?text=${message}`, '_blank')
        setWasNotified(true)
    }

    const closeAndRedirect = () => {
        setShowSuccess(false)
        setWasNotified(false)
        onClose()
        if (createdLoanId) {
            router.push(`/dashboard/prestamos/${createdLoanId}`)
        }
    }

    return (
        <Dialog 
            open={isOpen} 
            onOpenChange={(open) => {
                if (!open) {
                    if (showSuccess && !wasNotified) return
                    onClose()
                    setShowSuccess(false)
                    setWasNotified(false)
                }
            }}
        >
            <DialogContent className="max-w-2xl bg-[#0b121d] border-slate-800 text-white p-0 overflow-hidden shadow-2xl rounded-2xl md:rounded-3xl max-h-[95vh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 shrink-0" />
                
                <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                    <DialogHeader className="mb-4 space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                <Plus className="w-5 h-5 text-emerald-400" />
                            </div>
                            <DialogTitle className="text-xl md:text-2xl font-bold text-white tracking-tight uppercase">
                                Crear Préstamo Directo
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-slate-500 text-[10px] md:text-xs font-medium italic pl-10">
                            Potestad Administrativa: Genera contrato y contabilidad al instante.
                        </DialogDescription>
                    </DialogHeader>

                    {!showSuccess ? (
                        <div className="space-y-4 md:space-y-5">
                            {/* SECCIÓN CLIENTE */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Paso 1: Identificación del Cliente</label>
                                    <div className="h-px flex-1 bg-slate-800/50" />
                                </div>
                                {selectedClient ? (
                                    <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl relative overflow-hidden group animate-in zoom-in-95 duration-300">
                                         <div className="relative z-10 flex items-center gap-4">
                                             <div className="p-3 bg-emerald-600/20 border border-emerald-500/30 rounded-xl shadow-lg">
                                                <User className="w-6 h-6 text-emerald-400" />
                                             </div>
                                              <div>
                                                <p className="font-bold text-white uppercase tracking-tight text-lg">{selectedClient.nombres}</p>
                                                <div className="flex items-center gap-3">
                                                    <p className="text-[11px] text-emerald-500/80 font-bold font-mono">DNI: {selectedClient.dni}</p>
                                                    {selectedClient.limite_prestamo ? (
                                                        <p className="text-[11px] text-amber-400 font-bold uppercase tracking-tight">
                                                            Límite: S/ {selectedClient.limite_prestamo}
                                                        </p>
                                                    ) : (
                                                        <p className="text-[11px] text-slate-500 italic uppercase">
                                                            Sin límite asignado
                                                        </p>
                                                    )}
                                                </div>
                                             </div>
                                         </div>
                                         <button 
                                            disabled={loading}
                                            onClick={() => setSelectedClient(null)}
                                            className="relative z-10 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all font-bold uppercase text-[10px] h-8 px-3 rounded-lg border border-transparent hover:border-emerald-500/20"
                                         >
                                             Cambiar
                                         </button>
                                    </div>
                                ) : (
                                    <div className="relative group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
                                        <input
                                            placeholder="Buscar por Nombre completo o DNI..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            disabled={loading}
                                            className="w-full pl-10 h-11 bg-slate-900/50 border border-slate-800 text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 outline-none transition-all placeholder:text-slate-600 text-xs md:text-sm font-medium"
                                        />
                                        {searching && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                                            </div>
                                        )}
                                        
                                        {!searching && clients.length > 0 && (
                                            <div className="absolute z-50 w-full mt-2 bg-[#0b121d] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div className="p-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                                                    {clients.map(c => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => setSelectedClient(c)}
                                                            className="w-full text-left p-4 hover:bg-emerald-500/10 rounded-xl transition-colors flex items-center justify-between group"
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="p-2 bg-slate-800 group-hover:bg-emerald-500/20 rounded-lg transition-colors">
                                                                    <User className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-bold uppercase text-slate-200 group-hover:text-emerald-300 transition-colors">{c.nombres}</p>
                                                                    <p className="text-[10px] text-slate-500 font-mono italic">DNI: {c.dni}</p>
                                                                </div>
                                                            </div>
                                                            <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-emerald-500 transition-transform group-hover:translate-x-1" />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* SECCIÓN PRÉSTAMO */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Monto Desembolsar</label>
                                    <div className="relative w-full">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-lg">S/</div>
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={formData.monto}
                                            disabled={loading}
                                            onChange={(e) => updateField('monto', e.target.value)}
                                            className="w-full pl-10 !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 font-bold text-lg text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 outline-none transition-all text-right pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 w-full">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cuenta de Salida</label>
                                    <Select value={formData.cuenta_id} onValueChange={(v) => updateField('cuenta_id', v)} disabled={loading} key="cuenta-select">
                                        <SelectTrigger className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white rounded-xl focus:ring-emerald-500/20 focus:border-emerald-500/30 transition-all flex items-center">
                                            <SelectValue placeholder="Elegir caja..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#0b121d] border-slate-800 text-white z-[9999] rounded-xl">
                                            {cuentas && cuentas.length > 0 ? (
                                                cuentas.map(q => (
                                                    <SelectItem key={q.id} value={q.id} className="focus:bg-emerald-500/10 cursor-pointer py-3 rounded-lg mx-1 my-0.5 transition-colors">
                                                            <div className="flex items-center justify-between w-full min-w-[200px] gap-4">
                                                            <span className="font-bold uppercase text-[11px] truncate">{q.nombre}</span>
                                                            <span className="text-emerald-400 font-bold font-mono text-xs shrink-0">S/ {q.saldo.toLocaleString()}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))
                                            ) : (
                                                <div className="p-4 text-center text-slate-500 text-xs italic">
                                                    No hay cajas con saldo disponibles
                                                </div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                 <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center block">Tasa (%)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.interes_base}
                                            disabled={loading}
                                            onChange={(e) => updateField('interes_base', e.target.value)}
                                            className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white text-center font-bold text-base rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <Percent className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/30" />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 w-full text-center">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center block">Frecuencia</label>
                                    <Select value={formData.modalidad} onValueChange={(v) => updateField('modalidad', v as any)} disabled={loading} key="frecuencia-select">
                                        <SelectTrigger className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white rounded-xl text-xs font-bold uppercase text-center focus:ring-emerald-500/20 focus:border-emerald-500/30 transition-all flex items-center justify-center">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#0b121d] border-slate-800 text-white rounded-xl">
                                            <SelectItem value="diario">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                    <span>Diario</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="semanal">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                    <span>Semanal</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="quincenal">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                    <span>Quincenal</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="mensual">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                    <span>Mensual</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center block">N° Cuotas</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.cuotas}
                                            disabled={loading}
                                            onChange={(e) => updateField('cuotas', e.target.value)}
                                            className="w-full !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white text-center font-bold text-base rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <Hash className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/30" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Fecha de Inicio</label>
                                <div className="relative">
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500/30" />
                                    <input
                                        type="date"
                                        value={formData.fecha_inicio}
                                        disabled={loading}
                                        onChange={(e) => updateField('fecha_inicio', e.target.value)}
                                        className="w-full pl-10 !h-[44px] !py-0 bg-slate-900/50 border border-slate-800 text-white rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/30 outline-none font-bold text-sm transition-all"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                            </div>

                            {/* ESTRUCTURA DE COBRANZA - DINÁMICA */}
                            {formData.monto && formData.cuotas && (
                                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl relative overflow-hidden group shadow-xl">
                                    <div className="flex justify-between items-center gap-4 mb-4">
                                         <div>
                                            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-0.5">Amortización</h4>
                                            <p className="text-[8px] text-slate-500 font-medium">Validado al {formatDate(formData.fecha_inicio)}</p>
                                         </div>
                                         <div className="text-right bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/10">
                                            <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest mb-0.5">Cuota {formData.modalidad}</p>
                                            <p className="text-lg font-black text-white tabular-nums">S/ {cuotaMonto.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                         </div>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                        <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                            <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Interés</p>
                                            <p className="text-[10px] font-bold text-emerald-400 font-mono">{calcInteres.interes}%</p>
                                        </div>
                                        <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                            <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Total</p>
                                            <p className="text-[10px] font-bold text-white font-mono">S/ {totalPagar.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                        </div>
                                        <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                            <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Inicio</p>
                                            <p className="text-[10px] font-bold text-emerald-500 font-mono">{formatDate(calcFechas.fechaInicio)}</p>
                                        </div>
                                        <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                            <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Fin</p>
                                            <p className="text-[10px] font-bold text-emerald-600 font-mono">{formatDate(calcFechas.fechaFin)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12 space-y-8 animate-in zoom-in-95 duration-500">
                            <div className="space-y-3">
                                <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-2xl shadow-emerald-500/20">
                                    <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                                </div>
                                <h3 className="text-3xl font-black text-white tracking-tighter uppercase">¡Desembolso Exitoso!</h3>
                                <p className="text-slate-400 max-w-sm mx-auto text-sm font-medium">
                                    El crédito para <span className="text-white font-bold">{selectedClient?.nombres}</span> ha sido activado correctamente.
                                </p>
                            </div>

                            <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6 space-y-4 max-w-md mx-auto">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Comunicación Directa</p>
                                <Button 
                                    onClick={handleSendWhatsApp}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-14 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/40 transition-all active:scale-[0.98] group"
                                >
                                    <svg className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.565.928 3.178 1.416 4.856 1.417 5.341 0 9.69-4.348 9.693-9.691.002-2.59-1.01-5.025-2.847-6.865-1.838-1.837-4.271-2.847-6.863-2.848-5.341 0-9.69 4.349-9.692 9.691-.001 1.831.515 3.614 1.491 5.162l-.994 3.63 3.712-.974zm11.367-7.46c-.066-.11-.244-.176-.511-.309-.267-.133-1.583-.781-1.827-.87-.245-.089-.423-.133-.6.133-.177.266-.689.87-.845 1.047-.156.177-.311.199-.578.066-.267-.133-1.127-.416-2.146-1.326-.793-.707-1.329-1.58-1.485-1.847-.156-.266-.016-.411.117-.544.12-.119.267-.31.4-.466.133-.155.177-.266.267-.443.089-.178.044-.333-.022-.466-.067-.133-.6-1.446-.822-1.979-.217-.518-.434-.447-.6-.456-.153-.008-.328-.01-.502-.01-.174 0-.457.065-.696.327-.24.262-.915.894-.915 2.178 0 1.284.934 2.525 1.065 2.702.131.177 1.836 2.805 4.448 3.931.621.267 1.106.427 1.484.547.623.198 1.19.17 1.637.104.498-.074 1.583-.647 1.805-1.27.222-.623.222-1.157.156-1.27z" />
                                    </svg>
                                    Enviar Comprobante WhatsApp
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="bg-slate-900/30 p-4 md:p-6 flex flex-col-reverse md:flex-row items-center justify-between border-t border-slate-800/50 gap-3 shrink-0">
                    {!showSuccess ? (
                        <>
                            <Button 
                                variant="ghost" 
                                onClick={onClose} 
                                disabled={loading}
                                className="text-slate-500 hover:text-white hover:bg-slate-800 uppercase font-bold text-[10px] tracking-widest px-8 h-10 w-full md:w-auto rounded-xl transition-all"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                disabled={loading || !selectedClient || !formData.monto || !formData.cuenta_id}
                                onClick={handleCreate}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-10 h-12 md:h-14 rounded-xl shadow-xl shadow-emerald-900/20 transition-all active:scale-[0.98] w-full md:flex-1 relative overflow-hidden group"
                            >
                                <div className="relative z-10 flex items-center justify-center gap-2">
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="uppercase tracking-widest text-[10px] font-black">Procesando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="uppercase tracking-tight text-xs font-black">Realizar Desembolso</span>
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </div>
                                {loading && (
                                    <div className="absolute bottom-0 left-0 h-1 bg-emerald-400 animate-pulse w-full" />
                                )}
                            </Button>
                        </>
                        ) : (
                        <Button 
                            onClick={closeAndRedirect}
                            disabled={!wasNotified}
                            className={cn(
                                "w-full font-black h-12 rounded-xl transition-all",
                                wasNotified 
                                    ? "bg-slate-800 hover:bg-slate-700 text-white" 
                                    : "bg-slate-800/50 text-slate-500 cursor-not-allowed"
                            )}
                        >
                            {wasNotified ? 'Finalizar y Ver Préstamo' : 'Debe notificar para finalizar'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
