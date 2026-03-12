'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Send, DollarSign, Calendar, Hash, RefreshCw, User, FileText, Phone, MapPin, Briefcase, CreditCard, ArrowRight, ArrowLeft, Check, AlertTriangle, Percent } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatMoney, formatDate } from '@/utils/format'

interface Client {
    id: string
    nombres: string
    dni: string
}

interface SolicitudFormProps {
    clients: Client[]
    defaultClientId?: string
    feriados?: string[] // Lista de fechas en formato YYYY-MM-DD
}

// Cuotas estándar por modalidad (base para el cálculo proporcional)
const CUOTAS_ESTANDAR = {
    diario: 24,   // 24 días
    semanal: 4,   // 4 semanas
    quincenal: 2, // 2 quincenas
    mensual: 1,   // 1 mes
}

export function SolicitudForm({ clients, defaultClientId, feriados = [] }: SolicitudFormProps) {
    const [loading, setLoading] = useState(false)
    const [currentStep, setCurrentStep] = useState(1)
    const router = useRouter()

    // Set de feriados para búsqueda rápida
    const feriadosSet = useMemo(() => new Set(feriados), [feriados])

    // Obtener fecha local en formato YYYY-MM-DD
    const getFechaLocal = () => {
        const hoy = new Date()
        const year = hoy.getFullYear()
        const month = String(hoy.getMonth() + 1).padStart(2, '0')
        const day = String(hoy.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    // Form data state
    const [formData, setFormData] = useState({
        // Prospecto
        prospecto_nombres: '',
        prospecto_dni: '',
        prospecto_telefono: '',
        prospecto_direccion: '',
        prospecto_referencia: '',
        prospecto_sector_id: '',
        // Préstamo
        monto: '',
        interes_base: '20', // Interés base (editable)
        fecha_inicio: getFechaLocal(), // Usa fecha local, no UTC
        modalidad: 'diario' as keyof typeof CUOTAS_ESTANDAR,
        cuotas: ''
    })

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    // Función para verificar si es día hábil (no feriado ni domingo)
    const esDiaHabil = (fecha: Date): boolean => {
        const fechaStr = fecha.toISOString().split('T')[0]
        const diaSemana = fecha.getDay()
        // 0 = Domingo
        return diaSemana !== 0 && !feriadosSet.has(fechaStr)
    }

    // Función para obtener siguiente día hábil (AVANZA 1 día min) - Para iteraciones
    const siguienteDiaHabil = (fecha: Date): Date => {
        const siguiente = new Date(fecha)
        siguiente.setDate(siguiente.getDate() + 1)
        while (!esDiaHabil(siguiente)) {
            siguiente.setDate(siguiente.getDate() + 1)
        }
        return siguiente
    }

    // Función para validar día actual o mover al siguiente (SIN avanzar forzosamente) - Para Hitos
    const validarDiaHabil = (fecha: Date): Date => {
        const valid = new Date(fecha)
        while (!esDiaHabil(valid)) {
            valid.setDate(valid.getDate() + 1)
        }
        return valid
    }

    // Calcular interés proporcional según cuotas
    // Fórmula: interes_final = (cuotas_solicitadas / cuotas_estandar) * interes_base
    const calcularInteres = useMemo(() => {
        const modalidad = formData.modalidad
        const cuotas = parseInt(formData.cuotas) || 0
        const interesBase = parseFloat(formData.interes_base) || 20
        const cuotasEstandar = CUOTAS_ESTANDAR[modalidad]

        if (cuotas <= 0) return { interes: interesBase, esAjustado: false }

        // Calcular proporcionalmente
        const interesFinal = (cuotas / cuotasEstandar) * interesBase
        
        return { 
            interes: Math.round(interesFinal * 100) / 100, // Redondear a 2 decimales
            esAjustado: cuotas !== cuotasEstandar,
            cuotasEstandar
        }
    }, [formData.modalidad, formData.cuotas, formData.interes_base])

    // Calcular fechas de inicio y fin del préstamo
    const calcularFechas = useMemo(() => {
        if (!formData.fecha_inicio) return { fechaInicio: null, fechaFin: null }
        
        // Usar T12:00:00 para evitar desfaces
        const fechaAprobacion = new Date(formData.fecha_inicio + 'T12:00:00') 
        
        if (isNaN(fechaAprobacion.getTime())) return { fechaInicio: null, fechaFin: null }

        const cuotas = parseInt(formData.cuotas) || 0
        
        if (cuotas <= 0) return { fechaInicio: null, fechaFin: null }

        let fechaPrimeraCuota: Date
        
        if (formData.modalidad === 'diario') {
            // Diario: Inicio + 2 días (Día de Gracia)
            const baseDate = new Date(fechaAprobacion)
            baseDate.setDate(baseDate.getDate() + 2)
            fechaPrimeraCuota = validarDiaHabil(baseDate)
        } else {
             // Periódico: Start + Intervalo
             const baseDate = new Date(fechaAprobacion)
             let daysToAdd = 0
             let monthsToAdd = 0
             
             if (formData.modalidad === 'semanal') daysToAdd = 7
             else if (formData.modalidad === 'quincenal') daysToAdd = 14
             else if (formData.modalidad === 'mensual') monthsToAdd = 1
             
             baseDate.setDate(baseDate.getDate() + daysToAdd)
             baseDate.setMonth(baseDate.getMonth() + monthsToAdd)
             
             fechaPrimeraCuota = validarDiaHabil(baseDate)
        }

        // Calcular fecha fin según modalidad
        let fechaUltimaCuota = new Date(fechaAprobacion) 
        // FIX: Usar 'fechaAprobacion' (Start) como ancla para Periodic (Snap to Grid)
        // Para Diario, seguimos usando la lógica de iteración desde la primera.
        
        const n = cuotas // Total cuotas
        
        if (formData.modalidad === 'mensual') {
             fechaUltimaCuota.setMonth(fechaUltimaCuota.getMonth() + n)
        } else if (formData.modalidad === 'diario') {
             // Revertimos a usar fechaPrimeraCuota como base para el diario
             fechaUltimaCuota = new Date(fechaPrimeraCuota)
             // Iteramos N-1 veces
             let count = 0
             let cursor = new Date(fechaPrimeraCuota)
             while (count < (n - 1)) {
                 cursor = siguienteDiaHabil(cursor)
                 count++
             }
             fechaUltimaCuota = cursor
        } else {
             // Semanal / Quincenal
             let interval = 7
             if (formData.modalidad === 'quincenal') interval = 14
             
             fechaUltimaCuota.setDate(fechaUltimaCuota.getDate() + (n * interval))
        }
        
        // Ajustar ultima cuota si cae inhabil
        fechaUltimaCuota = validarDiaHabil(fechaUltimaCuota)

        return { 
            fechaInicio: fechaPrimeraCuota, 
            fechaFin: fechaUltimaCuota 
        }
    }, [formData.fecha_inicio, formData.modalidad, formData.cuotas, feriadosSet])


    const [validating, setValidating] = useState(false)
    const [dniError, setDniError] = useState('')
    const [telefonoError, setTelefonoError] = useState('')

    const validateStep1 = async (): Promise<boolean> => {
        // Reset errors
        setDniError('')
        setTelefonoError('')

        // Validaciones locales primero
        if (!formData.prospecto_nombres.trim()) {
            toast.error('Ingrese el nombre del prospecto')
            return false
        }
        if (!formData.prospecto_dni.trim() || formData.prospecto_dni.length < 8) {
            toast.error('Ingrese un DNI válido (8 dígitos)')
            return false
        }
        if (!formData.prospecto_telefono.trim()) {
            toast.error('Ingrese el teléfono del prospecto')
            return false
        }

        // Validar DNI y teléfono contra la base de datos
        setValidating(true)
        try {
            const response = await fetch('/api/validar-duplicados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dni: formData.prospecto_dni,
                    telefono: formData.prospecto_telefono
                })
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Error al validar')
            }

            let hasErrors = false

            if (result.dniExiste) {
                setDniError(`Este DNI ya está registrado (${result.dniCliente || 'Cliente existente'})`)
                toast.error('DNI duplicado', { description: 'Ya existe un cliente o solicitud con este DNI' })
                hasErrors = true
            }

            if (result.telefonoExiste) {
                setTelefonoError(`Este teléfono ya está registrado (${result.telefonoCliente || 'Cliente existente'})`)
                toast.error('Teléfono duplicado', { description: 'Ya existe un cliente o solicitud con este teléfono' })
                hasErrors = true
            }

            return !hasErrors

        } catch (e: any) {
            console.error(e)
            toast.error('Error al validar datos', { description: e.message })
            return false
        } finally {
            setValidating(false)
        }
    }

    const nextStep = async () => {
        const isValid = await validateStep1()
        if (!isValid) return
        setCurrentStep(2)
    }

    const prevStep = () => {
        setCurrentStep(1)
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)

        const solicitudData = {
            prospecto_nombres: formData.prospecto_nombres,
            prospecto_dni: formData.prospecto_dni,
            prospecto_telefono: formData.prospecto_telefono,
            prospecto_direccion: formData.prospecto_direccion || null,
            prospecto_referencia: formData.prospecto_referencia || null,
            prospecto_sector_id: formData.prospecto_sector_id || null,
            monto_solicitado: parseFloat(formData.monto),
            interes: calcularInteres.interes, // Interés calculado
            cuotas: parseInt(formData.cuotas),
            modalidad: formData.modalidad,
            fecha_inicio_propuesta: formData.fecha_inicio,
        }

        try {
            const response = await fetch('/api/solicitudes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(solicitudData)
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Error al crear solicitud')
            }

            toast.success('Solicitud creada', { 
                description: 'Se ha enviado a supervisión para aprobación' 
            })
            router.push('/dashboard/solicitudes')
            router.refresh()

        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error inesperado')
        } finally {
            setLoading(false)
        }
    }

    // Calcular montos
    const monto = parseFloat(formData.monto) || 0
    const cuotas = parseInt(formData.cuotas) || 1
    const totalPagar = monto * (1 + calcularInteres.interes / 100)
    const cuotaMonto = totalPagar / cuotas

    // Descripción de cuotas estándar
    const getModalidadLabel = (mod: keyof typeof CUOTAS_ESTANDAR) => {
        const labels = {
            diario: `Diario (base: ${CUOTAS_ESTANDAR.diario} días)`,
            semanal: `Semanal (base: ${CUOTAS_ESTANDAR.semanal} sem)`,
            quincenal: `Quincenal (base: ${CUOTAS_ESTANDAR.quincenal} quin)`,
            mensual: `Mensual (base: ${CUOTAS_ESTANDAR.mensual} mes)`,
        }
        return labels[mod]
    }

    // Efecto para buscar Sectores desde supabase
    const [sectores, setSectores] = useState<any[]>([])
    useEffect(() => {
        const fetchSectores = async () => {
            const res = await fetch('/api/sectores')
            if(res.ok) {
                const data = await res.json()
                setSectores(data)
            }
        }
        fetchSectores()
    }, [])

    return (
        <Card className="max-w-2xl mx-auto bg-slate-900/50 border border-purple-500/20 shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-purple-500 to-blue-600" />
            
            {/* Stepper Header */}
            <CardHeader className="border-b border-white/5 pb-6">
                <div className="flex items-center justify-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                            currentStep >= 1 
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                                : 'bg-slate-800 text-slate-500'
                        }`}>
                            {currentStep > 1 ? <Check className="w-5 h-5" /> : '1'}
                        </div>
                        <span className={`text-sm font-medium hidden sm:inline ${
                            currentStep >= 1 ? 'text-purple-400' : 'text-slate-500'
                        }`}>
                            Prospecto
                        </span>
                    </div>
                    
                    <div className={`w-16 h-1 rounded-full transition-all ${
                        currentStep >= 2 ? 'bg-purple-600' : 'bg-slate-800'
                    }`} />
                    
                    <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                            currentStep >= 2 
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' 
                                : 'bg-slate-800 text-slate-500'
                        }`}>
                            2
                        </div>
                        <span className={`text-sm font-medium hidden sm:inline ${
                            currentStep >= 2 ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                            Préstamo
                        </span>
                    </div>
                </div>

                <CardTitle className="text-2xl font-bold text-white text-center">
                    {currentStep === 1 ? (
                        <span className="flex items-center justify-center gap-2">
                            <User className="h-6 w-6 text-purple-400" />
                            Datos del Prospecto
                        </span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">
                            <DollarSign className="h-6 w-6 text-emerald-400" />
                            Datos del Préstamo
                        </span>
                    )}
                </CardTitle>
                <p className="text-slate-400 text-sm text-center mt-1">
                    {currentStep === 1 
                        ? 'Ingrese la información del cliente prospecto'
                        : 'Configure las condiciones del préstamo'
                    }
                </p>
            </CardHeader>

            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-6 pt-6">
                    
                    {/* ===== STEP 1: Datos del Prospecto ===== */}
                    {currentStep === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 ml-1">Nombres Completos *</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                    <Input
                                        value={formData.prospecto_nombres}
                                        onChange={(e) => updateField('prospecto_nombres', e.target.value)}
                                        placeholder="Juan Pérez García"
                                        className="pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">DNI *</label>
                                    <div className="relative">
                                        <CreditCard className={`absolute left-3 top-3 h-4 w-4 ${dniError ? 'text-red-500' : 'text-slate-500'}`} />
                                        <Input
                                            value={formData.prospecto_dni}
                                            onChange={(e) => {
                                                updateField('prospecto_dni', e.target.value)
                                                setDniError('')
                                            }}
                                            placeholder="12345678"
                                            maxLength={8}
                                            className={`pl-9 h-12 bg-slate-950/50 text-slate-200 rounded-xl text-base ${
                                                dniError ? 'border-red-500 focus:border-red-500' : 'border-slate-700'
                                            }`}
                                        />
                                    </div>
                                    {dniError && (
                                        <p className="text-xs text-red-400 ml-1 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {dniError}
                                        </p>
                                    )}
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Teléfono *</label>
                                    <div className="relative">
                                        <Phone className={`absolute left-3 top-3 h-4 w-4 ${telefonoError ? 'text-red-500' : 'text-slate-500'}`} />
                                        <Input
                                            value={formData.prospecto_telefono}
                                            onChange={(e) => {
                                                updateField('prospecto_telefono', e.target.value)
                                                setTelefonoError('')
                                            }}
                                            placeholder="999888777"
                                            className={`pl-9 h-12 bg-slate-950/50 text-slate-200 rounded-xl text-base ${
                                                telefonoError ? 'border-red-500 focus:border-red-500' : 'border-slate-700'
                                            }`}
                                        />
                                    </div>
                                    {telefonoError && (
                                        <p className="text-xs text-red-400 ml-1 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {telefonoError}
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 ml-1">Dirección</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                    <Input
                                        value={formData.prospecto_direccion}
                                        onChange={(e) => updateField('prospecto_direccion', e.target.value)}
                                        placeholder="Av. Principal 123"
                                        className="pl-9 h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base"
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Sector (Zona / Rubro)</label>
                                    <div className="relative">
                                        <Briefcase className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                        <select
                                            value={formData.prospecto_sector_id}
                                            onChange={(e) => updateField('prospecto_sector_id', e.target.value)}
                                            className="flex h-12 w-full rounded-xl border border-slate-700 bg-slate-950/50 pl-9 pr-3 py-2 text-base text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
                                        >
                                            <option value="">Seleccione un sector...</option>
                                            {sectores.map((sec) => (
                                                <option key={sec.id} value={sec.id}>{sec.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Referencia</label>
                                    <Input
                                        value={formData.prospecto_referencia}
                                        onChange={(e) => updateField('prospecto_referencia', e.target.value)}
                                        placeholder="Cerca al mercado"
                                        className="h-12 bg-slate-950/50 border-slate-700 text-slate-200 rounded-xl text-base"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== STEP 2: Datos del Préstamo ===== */}
                    {currentStep === 2 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right duration-300">
                            {/* Summary of prospect */}
                            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                <p className="text-xs text-purple-400 mb-1">👤 Prospecto</p>
                                <p className="text-white font-medium">{formData.prospecto_nombres}</p>
                                <p className="text-sm text-slate-400">DNI: {formData.prospecto_dni} • Tel: {formData.prospecto_telefono}</p>
                            </div>

                            {/* Monto e Interés Base */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Monto Solicitado *</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-emerald-500" />
                                        <Input
                                            type="number"
                                            value={formData.monto}
                                            onChange={(e) => updateField('monto', e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            required
                                            className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-emerald-500/50 text-slate-200 rounded-xl text-base"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Interés Base % *</label>
                                    <div className="relative">
                                        <Percent className="absolute left-3 top-3 h-4 w-4 text-blue-500" />
                                        <Input
                                            type="number"
                                            value={formData.interes_base}
                                            onChange={(e) => updateField('interes_base', e.target.value)}
                                            placeholder="20"
                                            step="0.01"
                                            required
                                            className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Modalidad y Cuotas */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Modalidad *</label>
                                    <div className="relative">
                                        <RefreshCw className="absolute left-3 top-3 h-4 w-4 text-purple-500" />
                                        <select
                                            value={formData.modalidad}
                                            onChange={(e) => updateField('modalidad', e.target.value)}
                                            required
                                            className="flex h-12 w-full rounded-xl border border-slate-700 bg-slate-950/50 pl-10 pr-3 py-2 text-base text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
                                        >
                                            <option value="diario">Diario</option>
                                            <option value="semanal">Semanal</option>
                                            <option value="quincenal">Quincenal</option>
                                            <option value="mensual">Mensual</option>
                                        </select>
                                    </div>
                                    <p className="text-xs text-slate-500 ml-1">
                                        Base: {CUOTAS_ESTANDAR[formData.modalidad]} cuotas = {formData.interes_base}%
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 ml-1">Cantidad de Cuotas *</label>
                                    <div className="relative">
                                        <Hash className="absolute left-3 top-3 h-4 w-4 text-blue-500" />
                                        <Input
                                            type="number"
                                            value={formData.cuotas}
                                            onChange={(e) => updateField('cuotas', e.target.value)}
                                            placeholder={`Ej: ${CUOTAS_ESTANDAR[formData.modalidad]}`}
                                            required
                                            min="1"
                                            className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-blue-500/50 text-slate-200 rounded-xl text-base"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Fecha Inicio */}
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 ml-1">Fecha de Solicitud *</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-orange-500" />
                                    <Input
                                        type="date"
                                        value={formData.fecha_inicio}
                                        onChange={(e) => updateField('fecha_inicio', e.target.value)}
                                        required
                                        className="pl-9 h-12 bg-slate-950/50 border-slate-700 focus:border-orange-500/50 text-slate-200 rounded-xl text-base"
                                    />
                                </div>
                            </div>

                            {/* Alert si interés es ajustado */}
                            {calcularInteres.esAjustado && formData.cuotas && (
                                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                                    <p className="text-xs text-yellow-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Interés ajustado: {formData.cuotas} cuotas ÷ {calcularInteres.cuotasEstandar} base × {formData.interes_base}% = <strong>{calcularInteres.interes}%</strong>
                                    </p>
                                </div>
                            )}

                            {/* Resumen completo */}
                            {formData.monto && formData.cuotas && (
                                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                                    <p className="text-xs text-emerald-400 font-bold">💰 Resumen del Préstamo</p>
                                    
                                    {/* Montos */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-center p-2 rounded-lg bg-slate-900/50">
                                            <p className="text-xs text-slate-400">Monto</p>
                                            <p className="text-white font-bold">${monto.toFixed(2)}</p>
                                        </div>
                                        <div className="text-center p-2 rounded-lg bg-slate-900/50">
                                            <p className="text-xs text-slate-400">Interés Final</p>
                                            <p className={`font-bold ${calcularInteres.esAjustado ? 'text-yellow-400' : 'text-blue-400'}`}>
                                                {calcularInteres.interes}%
                                            </p>
                                        </div>
                                        <div className="text-center p-2 rounded-lg bg-slate-900/50">
                                            <p className="text-xs text-slate-400">Total</p>
                                            <p className="text-emerald-400 font-bold">${totalPagar.toFixed(2)}</p>
                                        </div>
                                    </div>
                                    
                                    {/* Cuota */}
                                    <div className="text-center p-3 rounded-lg bg-emerald-600/20 border border-emerald-500/30">
                                        <p className="text-xs text-emerald-300">Cuota {formData.modalidad}</p>
                                        <p className="text-2xl font-bold text-white">${cuotaMonto.toFixed(2)}</p>
                                    </div>
                                    
                                    {/* Fechas */}
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="p-2 rounded-lg bg-slate-900/50">
                                            <p className="text-xs text-slate-400 mb-1">📅 Inicia a pagar</p>
                                            <p className="text-white font-medium">
                                                {formatDate(calcularFechas.fechaInicio)}
                                            </p>
                                        </div>
                                        <div className="p-2 rounded-lg bg-slate-900/50">
                                            <p className="text-xs text-slate-400 mb-1">🏁 Última cuota</p>
                                            <p className="text-white font-medium">
                                                {formatDate(calcularFechas.fechaFin)}
                                            </p>
                                        </div>
                                    </div>

                                    {formData.modalidad === 'diario' && (
                                        <p className="text-xs text-slate-400 text-center">
                                            ℹ️ Modalidad diaria: día libre después de aprobación
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Info Banner */}
                            <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-3">
                                <p className="text-xs text-blue-400 font-bold mb-1">ℹ️ Flujo de Aprobación</p>
                                <p className="text-xs text-slate-400">
                                    1. Supervisor revisa → 2. Admin aprueba → 3. Cliente y préstamo creados automáticamente
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex justify-between border-t border-white/5 pt-6 bg-slate-950/30">
                    {currentStep === 1 ? (
                        <>
                            <Button 
                                variant="ghost" 
                                type="button" 
                                onClick={() => router.back()} 
                                className="text-slate-400 hover:text-white hover:bg-white/5 rounded-xl"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                type="button"
                                onClick={nextStep}
                                disabled={validating}
                                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-900/20 border border-purple-400/20 rounded-xl px-6"
                            >
                                {validating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Validando...
                                    </>
                                ) : (
                                    <>
                                        Siguiente
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button 
                                variant="ghost" 
                                type="button" 
                                onClick={prevStep}
                                className="text-slate-400 hover:text-white hover:bg-white/5 rounded-xl"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Anterior
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={loading || !formData.monto || !formData.cuotas} 
                                className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-900/20 border border-emerald-400/20 rounded-xl px-6"
                            >
                                {loading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <Send className="mr-2 h-4 w-4" />
                                        Enviar a Supervisión
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                </CardFooter>
            </form>
        </Card>
    )
}
