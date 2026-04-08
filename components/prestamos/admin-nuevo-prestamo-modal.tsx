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
            
            // CIERRE INMEDIATO
            onClose() 
            
            // Navegación rápida
            router.refresh()
            if (result.id) {
                router.push(`/dashboard/prestamos/${result.id}`)
            }

        } catch (error: any) {
            console.error('Error in Admin Creation Flow:', error)
            toast.error('Fallo en desembolso', {
                description: error.message
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !loading && onClose()}>
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
                                     <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        disabled={loading}
                                        onClick={() => setSelectedClient(null)}
                                        className="relative z-10 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all font-bold uppercase text-[10px] h-8 px-3 rounded-lg"
                                     >
                                         Cambiar
                                     </Button>
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
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-lg">$</div>
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
                                                        <span className="text-emerald-400 font-bold font-mono text-xs shrink-0">${q.saldo.toLocaleString()}</span>
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
                                        <SelectItem value="diario">Diario</SelectItem>
                                        <SelectItem value="semanal">Semanal</SelectItem>
                                        <SelectItem value="quincenal">Quincenal</SelectItem>
                                        <SelectItem value="mensual">Mensual</SelectItem>
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
                                        <p className="text-lg font-black text-white tabular-nums">${cuotaMonto.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                     </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                    <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                        <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Interés</p>
                                        <p className="text-[10px] font-bold text-emerald-400 font-mono">{calcInteres.interes}%</p>
                                    </div>
                                    <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                                        <p className="text-[7px] text-slate-500 uppercase font-bold mb-0.5 tracking-wider">Total</p>
                                        <p className="text-[10px] font-bold text-white font-mono">${totalPagar.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
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
                </div>

                <DialogFooter className="bg-slate-900/30 p-4 md:p-6 flex flex-col-reverse md:flex-row items-center justify-between border-t border-slate-800/50 gap-3 shrink-0">
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
