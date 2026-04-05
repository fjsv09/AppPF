'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { UserMinus, Wallet, Loader2, CheckCircle2, AlertTriangle, CalendarDays, Calculator } from 'lucide-react'

interface LiquidacionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    trabajador: any // { id, nombre_completo, sueldo_base, fecha_ingreso }
    nominaActual: any // nomina del mes actual (puede ser null)
    onSuccess: () => void
}

export function LiquidacionModal({ open, onOpenChange, trabajador, nominaActual, onSuccess }: LiquidacionModalProps) {
    const [cuentas, setCuentas] = useState<any[]>([])
    const [selectedCuenta, setSelectedCuenta] = useState<string>('')
    const [diasTrabajados, setDiasTrabajados] = useState(0)
    const [totalYaPagado, setTotalYaPagado] = useState(0)
    const [loading, setLoading] = useState(false)
    const [loadingData, setLoadingData] = useState(true)
    const [notas, setNotas] = useState('')
    const supabase = createClient()

    useEffect(() => {
        if (open && trabajador) {
            fetchData()
            setSelectedCuenta('')
            setNotas('')
        }
    }, [open, trabajador])

    async function fetchData() {
        setLoadingData(true)

        // Fetch cuentas
        const { data: cuentasData } = await supabase
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo')
            .order('nombre')

        setCuentas(cuentasData || [])

        // Fetch attendance count for current month
        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()
        const primerDiaMes = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
        const hoy = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

        const { data: asistencias } = await supabase
            .from('asistencia_personal')
            .select('fecha')
            .eq('usuario_id', trabajador.id)
            .gte('fecha', primerDiaMes)
            .lte('fecha', hoy)

        setDiasTrabajados(asistencias?.length || now.getDate())

        // Fetch total ya pagado (de auditoría)
        if (nominaActual?.id) {
            const { data: pagos } = await supabase
                .from('auditoria')
                .select('detalle')
                .eq('accion', 'pago_nomina')
                .eq('registro_id', nominaActual.id)

            const sumaPagos = (pagos || []).reduce((acc: number, p: any) => 
                acc + parseFloat(p.detalle?.monto || 0), 0)
            setTotalYaPagado(sumaPagos)
        } else {
            setTotalYaPagado(0)
        }

        setLoadingData(false)
    }

    const sueldoBase = trabajador?.sueldo_base || 0
    const sueldoProporcional = parseFloat(((diasTrabajados / 30) * sueldoBase).toFixed(2))
    const bonos = nominaActual?.bonos || 0
    // Usar valores ORIGINALES para tener el total real del mes
    const descuentos = nominaActual?.descuentos_original || nominaActual?.descuentos || 0
    const adelantos = nominaActual?.adelantos_original || nominaActual?.adelantos || 0
    const totalLiquidacion = parseFloat((sueldoProporcional + bonos - descuentos - adelantos - totalYaPagado).toFixed(2))

    const cuentaSeleccionada = cuentas.find(c => c.id === selectedCuenta)
    const saldoSuficiente = totalLiquidacion <= 0 || (cuentaSeleccionada ? parseFloat(cuentaSeleccionada.saldo) >= totalLiquidacion : false)

    async function handleLiquidar() {
        if (totalLiquidacion > 0 && !selectedCuenta) return toast.error('Selecciona una cuenta de origen')
        if (totalLiquidacion > 0 && !saldoSuficiente) return toast.error('Saldo insuficiente')

        setLoading(true)
        try {
            const res = await fetch('/api/nomina/liquidar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trabajadorId: trabajador.id,
                    cuentaOrigenId: selectedCuenta || null,
                    notas
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast.success(data.message)
            onOpenChange(false)
            onSuccess()
        } catch (err: any) {
            toast.error(err.message || 'Error al procesar la liquidación')
        } finally {
            setLoading(false)
        }
    }

    if (!trabajador) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px] bg-slate-900 border-slate-800 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-500">
                        <UserMinus className="w-5 h-5" />
                        Liquidación por Renuncia
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Cálculo de liquidación para <strong className="text-white">{trabajador.nombre_completo}</strong>
                    </DialogDescription>
                </DialogHeader>

                {loadingData ? (
                    <div className="flex items-center justify-center py-12 gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-slate-400 font-bold">Calculando liquidación...</span>
                    </div>
                ) : (
                    <div className="space-y-4 pt-2">
                        {/* Datos del Trabajador */}
                        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Datos del Trabajador</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[9px] text-slate-600 uppercase font-bold">Nombre</p>
                                    <p className="text-sm text-white font-bold uppercase">{trabajador.nombre_completo}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-600 uppercase font-bold">Sueldo Base</p>
                                    <p className="text-sm text-white font-bold">S/ {sueldoBase.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-600 uppercase font-bold">Fecha de Ingreso</p>
                                    <p className="text-sm text-white font-bold">
                                        {trabajador.fecha_ingreso
                                            ? new Date(trabajador.fecha_ingreso + 'T00:00:00').toLocaleDateString('es-PE')
                                            : 'No registrada'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-600 uppercase font-bold">Días Trabajados (Mes)</p>
                                    <p className="text-sm text-white font-bold flex items-center gap-1">
                                        <CalendarDays className="w-3.5 h-3.5 text-blue-400" />
                                        {diasTrabajados} días
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Desglose de Liquidación */}
                        <div className="p-4 rounded-2xl bg-slate-950/60 border border-amber-500/20 space-y-3">
                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Calculator className="w-3 h-3" />
                                Desglose de Liquidación
                            </p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Sueldo Proporcional ({diasTrabajados}/30 días)</span>
                                    <span className="text-white font-bold">S/ {sueldoProporcional.toFixed(2)}</span>
                                </div>
                                {bonos > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Bonos Acumulados</span>
                                        <span className="text-emerald-400 font-bold">+ S/ {bonos.toFixed(2)}</span>
                                    </div>
                                )}
                                {descuentos > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Descuentos (Tardanzas)</span>
                                        <span className="text-rose-400 font-bold">- S/ {descuentos.toFixed(2)}</span>
                                    </div>
                                )}
                                {adelantos > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Adelantos de Sueldo</span>
                                        <span className="text-rose-400 font-bold">- S/ {adelantos.toFixed(2)}</span>
                                    </div>
                                )}
                                {totalYaPagado > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Ya Pagado (Cuotas Nómina)</span>
                                        <span className="text-rose-400 font-bold">- S/ {totalYaPagado.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                                    <span className="text-sm font-bold text-white">
                                        {totalLiquidacion >= 0 ? 'Total Liquidación' : 'Saldo a Favor Empresa'}
                                    </span>
                                    <span className={`text-2xl font-black ${totalLiquidacion > 0 ? 'text-emerald-400' : totalLiquidacion < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                        {totalLiquidacion < 0 ? '- ' : ''}S/ {Math.abs(totalLiquidacion).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {totalLiquidacion < 0 && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                                <p className="text-xs text-rose-400">El trabajador tiene un saldo pendiente con la empresa. Los pagos y adelantos recibidos superan el sueldo proporcional.</p>
                            </div>
                        )}

                        {totalLiquidacion === 0 && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                                <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
                                <p className="text-xs text-slate-400">El trabajador no tiene saldo a favor ni pendiente. La liquidación está saldada.</p>
                            </div>
                        )}

                        {/* Cuenta de origen (solo si hay monto positivo) */}
                        {totalLiquidacion > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cuenta de Origen (Desembolso)</p>
                                <div className="grid gap-2 max-h-36 overflow-y-auto">
                                    {cuentas.filter(c => parseFloat(c.saldo) > 0).map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSelectedCuenta(c.id)}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                                                selectedCuenta === c.id
                                                    ? 'bg-blue-500/10 border-blue-500/50'
                                                    : 'bg-slate-950/30 border-slate-800 hover:border-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Wallet className={`w-4 h-4 ${selectedCuenta === c.id ? 'text-blue-400' : 'text-slate-500'}`} />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-200 truncate max-w-[200px]">{c.nombre}</p>
                                                    <p className="text-[9px] text-slate-500 uppercase">{c.tipo}</p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-black ${parseFloat(c.saldo) >= totalLiquidacion ? 'text-emerald-400' : 'text-amber-500'}`}>
                                                S/ {parseFloat(c.saldo).toFixed(2)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notas */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Observaciones (Opcional)</p>
                            <textarea
                                value={notas}
                                onChange={(e) => setNotas(e.target.value)}
                                placeholder="Ej: Renuncia voluntaria por motivos personales..."
                                className="w-full h-20 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                            />
                        </div>

                        {/* Botones */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => onOpenChange(false)}
                                disabled={loading}
                                className="flex-1 py-2.5 text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleLiquidar}
                                disabled={loading || (totalLiquidacion > 0 && (!selectedCuenta || !saldoSuficiente))}
                                className="flex-[2] py-2.5 px-6 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        {totalLiquidacion > 0 ? `Liquidar — S/ ${totalLiquidacion.toFixed(2)}` : 'Registrar Liquidación'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
