'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
    Settings, Save, AlertCircle, Loader2, Lock, Upload, X, 
    Clock, MapPin, Scale, Activity, Award, Layout, ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

interface ConfigItem {
    clave: string
    valor: string
    descripcion: string | null
    tipo: string
}

interface ConfiguracionFormProps {
    initialConfig: ConfigItem[]
}

const CONFIG_LABELS: Record<string, { nombre: string; descripcion: string; min?: number; max?: number }> = {
    'renovacion_min_pagado': {
        nombre: 'Límite de Renovación',
        descripcion: 'Porcentaje mínimo pagado requerido para renovar un préstamo activo',
        min: 50,
        max: 100
    },
    'umbral_cpp_cuotas': {
        nombre: 'Umbral CPP (Diario)',
        descripcion: 'Cuotas vencidas para marcar como CPP en créditos diarios',
        min: 1,
        max: 30
    },
    'umbral_moroso_cuotas': {
        nombre: 'Umbral Moroso (Diario)',
        descripcion: 'Cuotas vencidas para marcar como Moroso en créditos diarios',
        min: 1,
        max: 90
    },
    'umbral_cpp_otros': {
        nombre: 'Umbral CPP (Sem/Quin/Mens)',
        descripcion: 'Cuotas vencidas para marcar como CPP en créditos NO diarios',
        min: 1,
        max: 10
    },
    'umbral_moroso_otros': {
        nombre: 'Umbral Moroso (Sem/Quin/Mens)',
        descripcion: 'Cuotas vencidas para marcar como Moroso en créditos NO diarios',
        min: 1,
        max: 20
    },
    'refinanciacion_min_mora': {
        nombre: 'Límite de Refinanciación Directa (Admin)',
        descripcion: 'Mora mínima para permitir botón de refinanciación directa',
        min: 10,
        max: 100
    },
    'horario_apertura': {
        nombre: 'Horario de Apertura',
        descripcion: 'Hora en la que se habilita el registro de pagos (HH:MM)',
    },
    'horario_cierre': {
        nombre: 'Horario de Cierre',
        descripcion: 'Hora en la que se bloquea el registro de pagos (HH:MM)',
    },
    'horario_fin_turno_1': {
        nombre: 'Fin Primer Turno / Límite Cuadre',
        descripcion: 'Hora en la que finaliza el turno y se exige el cuadre parcial (HH:MM)',
    },
    'tiempo_gracia_post_cuadre': {
        nombre: 'Tiempo Espera Post-Cuadre (min)',
        descripcion: 'Minutos que el sistema permanece bloqueado tras aprobarse el Cierre Mañana',
        min: 0,
        max: 60
    },
    'desbloqueo_hasta': {
        nombre: 'Sesión de Emergencia (Minutos)',
        descripcion: 'Ingresa los minutos que deseas desbloquear el sistema desde ahora',
        min: 1,
        max: 480
    },
    'nombre_sistema': {
        nombre: 'Nombre del Sistema',
        descripcion: 'Nombre principal de la plataforma (Título y Navegación)',
    },
    'logo_sistema_url': {
        nombre: 'Logo del Sistema',
        descripcion: 'URL de la imagen del logo principal del sistema',
    },
    'visita_tiempo_minimo': {
        nombre: 'Tiempo Mínimo de Visita (min)',
        descripcion: 'Minutos que el asesor debe permanecer en la ubicación',
        min: 1,
        max: 60
    },
    'asistencia_radio_metros': {
        nombre: 'Radio de Asistencia (metros)',
        descripcion: 'Distancia máxima permitida desde la oficina',
        min: 10,
        max: 500
    },
    'asistencia_descuento_por_minuto': {
        nombre: 'Descuento por Tardanza (S/ x min)',
        descripcion: 'Monto en soles que se descuenta por cada minuto de tardanza',
    },
    'asistencia_tolerancia_minutos': {
        nombre: 'Tolerancia de Asistencia (min)',
        descripcion: 'Minutos de gracia antes de marcar tardanza',
        min: 0,
        max: 60
    },
    'asistencia_minutos_permanencia': {
        nombre: 'Minutos de Permanencia Obligatoria',
        descripcion: 'Tiempo mínimo que el usuario debe permanecer en la oficina tras marcar entrada',
        min: 1,
        max: 120
    },
    'oficina_lat': {
        nombre: 'Latitud de la Oficina',
        descripcion: 'Coordenada GPS latitud',
    },
    'oficina_lon': {
        nombre: 'Longitud de la Oficina',
        descripcion: 'Coordenada GPS longitud',
    },
    'visita_radio_maximo': {
        nombre: 'Radio Máximo de Visita (metros)',
        descripcion: 'Distancia máxima permitida para iniciar/finalizar visita',
        min: 10,
        max: 5000
    },
    'score_peso_puntual': {
        nombre: 'Peso: Puntualidad (+)',
        descripcion: 'Puntos por cuota pagada a tiempo',
        min: 0,
        max: 20
    },
    'score_peso_adelantado': {
        nombre: 'Peso: Adelanto (+)',
        descripcion: 'Puntos por adelantar cuotas',
        min: 0,
        max: 20
    },
    'score_peso_diario_atraso': {
        nombre: 'Penalidad: Día Atrasado (-)',
        descripcion: 'Puntos que se RESTAN por cada día vencido',
        min: 0,
        max: 10
    },
    'score_tope_atraso_cuota': {
        nombre: 'Tope: Penalidad por Cuota (-)',
        descripcion: 'Punto máximo de descuento por una sola cuota',
        min: 0,
        max: 100
    },
    'score_peso_tarde': {
        nombre: 'Peso: Pago Tarde (-)',
        descripcion: 'Puntos que se RESTAN por cuota fuera de fecha',
        min: 0,
        max: 50
    },
    'score_peso_cpp': {
        nombre: 'Peso: Riesgo CPP (-)',
        descripcion: 'Puntos que se RESTAN por riesgo bajo (2 a 8 días)',
        min: 0,
        max: 50
    },
    'score_peso_moroso': {
        nombre: 'Peso: Riesgo Moroso (-)',
        descripcion: 'Puntos que se RESTAN por riesgo medio (8 a 30 días)',
        min: 0,
        max: 100
    },
    'score_peso_vencido': {
        nombre: 'Peso: Riesgo Vencido (-)',
        descripcion: 'Puntos que se RESTAN por riesgo alto (> 30 días)',
        min: 0,
        max: 100
    },
    'score_mult_semanal': {
        nombre: 'Multiplicador Semanal',
        descripcion: 'Factor para préstamos semanales',
        min: 1,
        max: 10
    },
    'score_mult_quincenal': {
        nombre: 'Multiplicador Quincenal',
        descripcion: 'Factor para préstamos quincenales',
        min: 1,
        max: 20
    },
    'score_mult_mensual': {
        nombre: 'Multiplicador Mensual',
        descripcion: 'Factor para préstamos mensuales',
        min: 1,
        max: 50
    },
    'reputation_bonus_finalizado': {
        nombre: 'Bono por Finalizado (+)',
        descripcion: 'Puntos cuando un préstamo se liquida con éxito.',
        min: 0,
        max: 50
    },
    'reputation_bonus_renovado': {
        nombre: 'Bono por Renovación (+)',
        descripcion: 'Puntos al renovar un préstamo activo.',
        min: 0,
        max: 50
    },
    'reputation_bonus_salud_excelente': {
        nombre: 'Bono Salud Excelente (+)',
        descripcion: 'Puntos extra si el promedio de salud es > 85%.',
        min: 0,
        max: 30
    },
    'reputation_penalty_refinanciado': {
        nombre: 'Castigo Refinanciado (-)',
        descripcion: 'Puntos que se RESTAN por préstamo refinanciado.',
        min: 0,
        max: 100
    },
    'reputation_penalty_vencido': {
        nombre: 'Castigo Vencido (-)',
        descripcion: 'Puntos que se RESTAN por préstamo vencido.',
        min: 0,
        max: 100
    },
    'reputation_penalty_salud_pobre': {
        nombre: 'Castigo Salud Pobre (-)',
        descripcion: 'Puntos que se RESTAN si salud histórica < 50%.',
        min: 0,
        max: 100
    },
    'reputation_bonus_antiguedad_mensual': {
        nombre: 'Bono Antigüedad (+)',
        descripcion: 'Puntos por cada mes de antigüedad.',
        min: 0,
        max: 10
    }
}

const CATEGORIES = [
    {
        id: 'horarios',
        nombre: 'Configuración Horarios',
        descripcion: 'Control de apertura, cierre y sesiones de emergencia.',
        icon: Clock,
        iconColor: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        keys: ['horario_apertura', 'horario_cierre', 'horario_fin_turno_1', 'tiempo_gracia_post_cuadre', 'desbloqueo_hasta']
    },
    {
        id: 'asistencia',
        nombre: 'Configuración de Asistencia',
        descripcion: 'Parámetros de puntualidad y ubicación de oficina.',
        icon: MapPin,
        iconColor: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        keys: ['asistencia_descuento_por_minuto', 'asistencia_radio_metros', 'asistencia_tolerancia_minutos', 'asistencia_minutos_permanencia', 'oficina_lat', 'oficina_lon']
    },
    {
        id: 'politicas',
        nombre: 'Políticas de Crédito',
        descripcion: 'Reglas para renovaciones y refinanciaciones.',
        icon: Scale,
        iconColor: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        keys: ['renovacion_min_pagado', 'refinanciacion_min_mora', 'umbral_cpp_cuotas', 'umbral_moroso_cuotas', 'umbral_cpp_otros', 'umbral_moroso_otros']
    },
    {
        id: 'salud',
        nombre: 'Health Score (Salud)',
        descripcion: 'Pesos y multiplicadores para el cálculo de salud del préstamo.',
        icon: Activity,
        iconColor: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        keys: ['score_peso_puntual', 'score_peso_adelantado', 'score_peso_tarde', 'score_peso_cpp', 'score_peso_moroso', 'score_peso_vencido', 'score_peso_diario_atraso', 'score_tope_atraso_cuota', 'score_mult_semanal', 'score_mult_quincenal', 'score_mult_mensual']
    },
    {
        id: 'reputacion',
        nombre: 'Reputación del Cliente',
        descripcion: 'Bonos y penalidades del sistema de reputación.',
        icon: Award,
        iconColor: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        keys: ['reputation_bonus_finalizado', 'reputation_bonus_renovado', 'reputation_bonus_salud_excelente', 'reputation_penalty_refinanciado', 'reputation_penalty_vencido', 'reputation_penalty_salud_pobre', 'reputation_bonus_antiguedad_mensual']
    },
    {
        id: 'sistema',
        nombre: 'Sistema & Seguimiento',
        descripcion: 'Personalización básica y límites de visitas.',
        icon: Layout,
        iconColor: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
        keys: ['nombre_sistema', 'logo_sistema_url', 'visita_tiempo_minimo', 'visita_radio_maximo']
    }
]

export function ConfiguracionForm({ initialConfig }: ConfiguracionFormProps) {
    const router = useRouter()
    const [config, setConfig] = useState<Record<string, string>>(() => {
        return initialConfig.reduce((acc: any, item) => {
            let val = item.valor;
            if ((item.clave.includes('horario') || item.clave.includes('cuadre')) && val && !val.includes(':') && !isNaN(Number(val))) {
                val = `${val.padStart(2, '0')}:00`;
            }
            if (item.clave === 'desbloqueo_hasta' && val && val.includes('T')) {
                const target = new Date(val)
                const now = new Date()
                const diffMs = target.getTime() - now.getTime()
                const mins = Math.max(0, Math.ceil(diffMs / 60000))
                val = mins > 0 ? mins.toString() : ''
            }
            return { ...acc, [item.clave]: val };
        }, {});
    });
    const [saving, setSaving] = useState(false)
    const [unlocking, setUnlocking] = useState(false)
    const [editingKey, setEditingKey] = useState<string | null>(null)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [gettingLocation, setGettingLocation] = useState(false)

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            toast.error("Tu navegador no soporta geolocalización")
            return
        }

        setGettingLocation(true)
        toast.info("Obteniendo ubicación...", {
            description: "Por favor, permite el acceso si se te solicita."
        })

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords
                setConfig(prev => ({
                    ...prev,
                    oficina_lat: latitude.toString(),
                    oficina_lon: longitude.toString()
                }))
                toast.success("Ubicación obtenida", {
                    description: `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`
                })
                setGettingLocation(false)
            },
            (error) => {
                let msg = "Error desconocido"
                switch(error.code) {
                    case error.PERMISSION_DENIED: msg = "Permiso denegado"; break;
                    case error.POSITION_UNAVAILABLE: msg = "Ubicación no disponible"; break;
                    case error.TIMEOUT: msg = "Tiempo de espera agotado"; break;
                }
                toast.error("Error de GPS", { description: msg })
                setGettingLocation(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const handleUnlock = async () => {
        setUnlocking(true)
        const mins = parseInt(config['desbloqueo_hasta']) || 15
        
        try {
            const response = await fetch('/api/configuracion/desbloquear', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minutos: mins })
            })
            if (!response.ok) throw new Error('Error al desbloquear')
            
            const data = await response.json()
            toast.success(`Sistema desbloqueado por ${mins} minutos`, {
                description: `Habilitado hasta: ${new Date(data.activo_hasta).toLocaleTimeString()}`
            })
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setUnlocking(false)
        }
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadingLogo(true)

        try {
            if (!file.type.startsWith('image/')) {
                throw new Error('El archivo debe ser una imagen')
            }
            if (file.size > 2 * 1024 * 1024) {
                throw new Error('La imagen es demasiado grande (máx 2MB)')
            }
            const formData = new FormData()
            formData.append('file', file)
            const response = await fetch('/api/configuracion/upload-logo', {
                method: 'POST',
                body: formData
            })
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Error al subir el logo')
            }
            const data = await response.json()
            const freshUrl = data.publicUrl
            setConfig(prev => ({ ...prev, logo_sistema_url: freshUrl }))
            toast.success('Logo subido', {
                description: 'La imagen ha sido cargada. Recuerda guardar el cambio.'
            })
        } catch (error: any) {
            toast.error('Error al subir logo', {
                description: error.message
            })
        } finally {
            setUploadingLogo(false)
        }
    }

    const handleSave = async (clave: string) => {
        setSaving(true)
        try {
            let valor = config[clave]
            const meta = CONFIG_LABELS[clave]

            if (clave.includes('horario')) {
                if (valor && !valor.includes(':') && !isNaN(Number(valor))) {
                    const hour = valor.padStart(2, '0')
                    valor = `${hour}:00`
                }
            }

            if (!clave.includes('horario') && !clave.includes('desbloqueo') && !clave.includes('nombre') && !clave.includes('logo')) {
                const numValor = parseInt(valor)
                if (isNaN(numValor)) {
                    throw new Error('El valor debe ser un número')
                }
                if (meta?.min !== undefined && numValor < meta.min) {
                    throw new Error(`El valor mínimo es ${meta.min}`)
                }
                if (meta?.max !== undefined && numValor > meta.max) {
                    throw new Error(`El valor máximo es ${meta.max}`)
                }
            }

            const response = await fetch('/api/configuracion', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clave, valor })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Error al guardar')
            }

            toast.success('Configuración actualizada', {
                description: `${meta?.nombre} ahora es ${valor}`
            })
            setEditingKey(null)
            router.refresh()
        } catch (error: any) {
            toast.error('Error al guardar', {
                description: error.message
            })
        } finally {
            setSaving(false)
        }
    }

    const getIcon = (clave: string) => {
        if (clave.includes('renovacion')) return '📊'
        if (clave.includes('cpp')) return '⏱️'
        if (clave.includes('moroso')) return '⚠️'
        if (clave.includes('horario')) return '🕒'
        if (clave.includes('desbloqueo')) return '🔓'
        if (clave.includes('score') || clave.includes('reputation')) return '📈'
        if (clave.includes('nombre')) return '🏷️'
        if (clave.includes('logo')) return '🖼️'
        if (clave.includes('visita')) return '📍'
        if (clave.includes('asistencia') || clave.includes('hora_limite')) return '🕐'
        if (clave.includes('oficina')) return '🏢'
        return '⚙️'
    }

    const requiredKeys = CATEGORIES.flatMap(c => c.keys)
    const displayConfig = [...initialConfig]
    requiredKeys.forEach(key => {
        if (!displayConfig.find(item => item.clave === key)) {
            displayConfig.push({
                clave: key,
                valor: 
                    key === 'horario_apertura' ? '10:00' : 
                    key === 'horario_cierre' ? '19:00' : 
                    key === 'horario_fin_turno_1' ? '13:30' :
                    '0',
                descripcion: CONFIG_LABELS[key]?.descripcion || 'Configuración del sistema',
                tipo: 'string'
            })
        }
    })

    return (
        <div className="pb-12">
            <Accordion type="multiple" defaultValue={['horarios']} className="space-y-4">
                {CATEGORIES.map((cat) => (
                    <AccordionItem 
                        key={cat.id} 
                        value={cat.id}
                        className="bg-slate-900/40 backdrop-blur-sm border border-slate-800/50 rounded-2xl overflow-hidden px-1"
                    >
                        <AccordionTrigger className="hover:no-underline py-4 px-4 group">
                            <div className="flex items-center gap-4 text-left">
                                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-all group-data-[state=open]:scale-110", cat.bgColor)}>
                                    <cat.icon className={cn("h-6 w-6 transition-colors", cat.iconColor)} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100 tracking-tight leading-none mb-1">
                                        {cat.nombre}
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium opacity-70">
                                        {cat.descripcion}
                                    </p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-800/50 mt-2">
                                {cat.keys.map((key) => {
                                    const item = displayConfig.find(i => i.clave === key)
                                    if (!item) return null
                                    
                                    const meta = CONFIG_LABELS[item.clave]
                                    const isEditing = editingKey === item.clave
                                    const currentValue = config[item.clave] || item.valor

                                    return (
                                        <div 
                                            key={item.clave}
                                            className={cn(
                                                "bg-slate-950/40 border border-slate-800/50 rounded-xl p-4 transition-all flex flex-col justify-between group/card",
                                                isEditing ? "border-blue-500/30 bg-slate-900/60 ring-1 ring-blue-500/10" : "hover:border-slate-700/50"
                                            )}
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 shrink-0 rounded-lg bg-slate-800/50 flex items-center justify-center text-xl border border-slate-700/30">
                                                            {getIcon(item.clave)}
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-bold text-slate-200 leading-tight">
                                                                {meta?.nombre || item.clave}
                                                            </h3>
                                                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                                                                {meta?.descripcion || item.descripcion}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {!isEditing && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setEditingKey(item.clave)}
                                                            className="h-7 w-7 text-slate-600 hover:text-blue-400 hover:bg-slate-800 rounded-md"
                                                        >
                                                            <Settings className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <Label htmlFor={item.clave} className="text-[9px] uppercase font-black tracking-widest text-slate-600">
                                                                Valor
                                                            </Label>
                                                            {meta?.min !== undefined && isEditing && (
                                                                <span className="text-[9px] text-slate-500 italic">
                                                                    Min: {meta.min} - Max: {meta.max}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="relative">
                                                            <Input
                                                                id={item.clave}
                                                                type={
                                                                    (item.clave.includes('horario') || item.clave.includes('cuadre') || item.clave.includes('nombre') || item.clave.includes('logo')) 
                                                                        ? 'text' 
                                                                        : 'number'
                                                                }
                                                                placeholder={
                                                                    item.clave.includes('horario') ? 'HH:MM' : 
                                                                    item.clave.includes('nombre') ? 'Ej: Sistema PF' : 
                                                                    item.clave.includes('desbloqueo') ? 'Ej: 15' : ''
                                                                }
                                                                value={
                                                                    (isEditing) 
                                                                        ? currentValue 
                                                                        : ((item.clave.includes('horario') || item.clave.includes('cuadre')) && currentValue && !currentValue.includes(':') && !isNaN(Number(currentValue))) 
                                                                            ? `${currentValue.padStart(2, '0')}:00` 
                                                                            : currentValue
                                                                }
                                                                onChange={(e) => setConfig({ ...config, [item.clave]: e.target.value })}
                                                                disabled={!isEditing}
                                                                className={cn(
                                                                    "h-9 bg-slate-950/40 border-slate-800 text-white text-sm font-mono transition-all",
                                                                    isEditing ? "border-blue-500/40 bg-slate-950" : "opacity-60 cursor-default",
                                                                    (item.clave === 'logo_sistema_url' || item.clave === 'oficina_lat' || item.clave === 'oficina_lon') && "pr-10"
                                                                )}
                                                            />
                                                            {isEditing && (item.clave === 'oficina_lat' || item.clave === 'oficina_lon') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={handleGetLocation}
                                                                    disabled={gettingLocation}
                                                                    className="absolute right-0 top-0 h-9 w-9 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg"
                                                                >
                                                                    {gettingLocation ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <MapPin className="h-4 w-4" />}
                                                                </Button>
                                                            )}
                                                        </div>
                                                        {item.clave === 'logo_sistema_url' && isEditing && (
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="hidden"
                                                                    ref={fileInputRef}
                                                                    onChange={handleLogoUpload}
                                                                />
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    disabled={uploadingLogo}
                                                                    onClick={() => fileInputRef.current?.click()}
                                                                    className="w-full bg-slate-800 text-xs text-slate-300 border-slate-700 hover:bg-slate-700"
                                                                >
                                                                    {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Upload className="h-3 w-3 mr-2" />}
                                                                    {uploadingLogo ? 'Subiendo...' : 'Subir Imagen'}
                                                                </Button>
                                                            </div>
                                                        )}
                                                        {item.clave === 'logo_sistema_url' && currentValue && (
                                                            <div className="mt-2 relative group/logo">
                                                                <div className="flex justify-center p-2 bg-slate-800/20 rounded-lg border border-slate-700/30">
                                                                    <>
                                                                        <img src={currentValue} alt="Logo Preview" className="h-16 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                                    </>
                                                                    {isEditing && (
                                                                        <button 
                                                                            onClick={() => setConfig({ ...config, [item.clave]: '' })}
                                                                            className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5 text-white shadow-lg opacity-0 group-hover/logo:opacity-100 transition-opacity"
                                                                        >
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {(item.clave === 'renovacion_min_pagado' || item.clave === 'refinanciacion_min_mora') && (
                                                        <div className="flex items-center gap-2 p-2 bg-slate-800/30 border border-slate-700/30 rounded-lg">
                                                            <AlertCircle className="h-3 w-3 text-slate-500 shrink-0" />
                                                            <p className="text-[9px] text-slate-400 leading-tight">
                                                                {item.clave === 'renovacion_min_pagado' 
                                                                    ? `Requiere ${currentValue}% pagado para renovar.`
                                                                    : `Mora > ${currentValue}% para refinanciar.`}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                {isEditing ? (
                                                    <div className="flex gap-2">
                                                        <Button
                                                            onClick={() => handleSave(item.clave)}
                                                            disabled={saving}
                                                            className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-900/20"
                                                        >
                                                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-2" />}
                                                            {saving ? '' : 'Guardar'}
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => {
                                                                setConfig({ ...config, [item.clave]: item.valor || '' })
                                                                setEditingKey(null)
                                                            }}
                                                            disabled={saving}
                                                            className="h-8 bg-transparent border-slate-700 text-slate-400 hover:text-white text-xs"
                                                        >
                                                            X
                                                        </Button>
                                                    </div>
                                                ) : item.clave === 'desbloqueo_hasta' ? (
                                                    <Button 
                                                        onClick={handleUnlock} 
                                                        disabled={unlocking}
                                                        className="w-full h-8 bg-purple-600/90 hover:bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-lg shadow-purple-900/20 group/unlock"
                                                    >
                                                        {unlocking ? <Loader2 className="animate-spin mr-2 h-3 w-3" /> : <Lock className="mr-2 h-3 w-3 group-hover/unlock:animate-bounce" />}
                                                        DESBLOQUEAR SISTEMA ({parseInt(config['desbloqueo_hasta']) || 15}M)
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    )
}
