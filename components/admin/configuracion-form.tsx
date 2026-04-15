'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Save, AlertCircle, CheckCircle2, Loader2, Lock, Upload, Image as ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { cn } from '@/lib/utils'

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
        descripcion: 'Porcentaje mínimo de mora (cuotas vencidas vs totales) para permitir botón de refinanciación directa (Aprobación automática)',
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
        max: 480 // Máximo 8 horas
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
        descripcion: 'Minutos que el asesor debe permanecer en la ubicación para dar por válida la visita',
        min: 1,
        max: 60
    },
    'asistencia_radio_metros': {
        nombre: 'Radio de Asistencia (metros)',
        descripcion: 'Distancia máxima permitida desde la oficina para marcar asistencia GPS',
        min: 10,
        max: 500
    },
    'asistencia_descuento_por_minuto': {
        nombre: 'Descuento por Tardanza (S/ x min)',
        descripcion: 'Monto en soles que se descuenta por cada minuto de tardanza',
    },
    'asistencia_tolerancia_minutos': {
        nombre: 'Tolerancia de Asistencia (min)',
        descripcion: 'Minutos de gracia después de la hora de apertura antes de marcar tardanza',
        min: 0,
        max: 60
    },
    'oficina_lat': {
        nombre: 'Latitud de la Oficina',
        descripcion: 'Coordenada GPS latitud del centro de la oficina principal',
    },
    'oficina_lon': {
        nombre: 'Longitud de la Oficina',
        descripcion: 'Coordenada GPS longitud del centro de la oficina principal',
    },
    'visita_radio_maximo': {
        nombre: 'Radio Máximo de Visita (metros)',
        descripcion: 'Distancia máxima permitida entre el asesor y el cliente para iniciar/finalizar una visita',
        min: 10,
        max: 5000
    }
}

export function ConfiguracionForm({ initialConfig }: ConfiguracionFormProps) {
    const router = useRouter()
    const [config, setConfig] = useState<Record<string, string>>(() => {
        return initialConfig.reduce((acc: any, item) => {
            let val = item.valor;
            // Normalizar horarios (ej: "3" -> "03:00")
            if ((item.clave.includes('horario') || item.clave.includes('cuadre')) && val && !val.includes(':') && !isNaN(Number(val))) {
                val = `${val.padStart(2, '0')}:00`;
            }
            // [NUEVO] Si es desbloqueo, calcular minutos restantes para mostrar
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
            // Validar tipo de archivo
            if (!file.type.startsWith('image/')) {
                throw new Error('El archivo debe ser una imagen')
            }

            // Validar tamaño (2MB)
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
                description: 'La imagen ha sido cargada. Recuerda guardar el cambio para aplicarlo permanentemente.'
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

            // Formateo automático de horarios
            if (clave.includes('horario')) {
                // Si solo pone un número (ej: "3" o "15"), convertir a "03:00" o "15:00"
                if (valor && !valor.includes(':') && !isNaN(Number(valor))) {
                    const hour = valor.padStart(2, '0')
                    valor = `${hour}:00`
                }
            }

            // Validación (Solo para números)
            if (!clave.includes('horario') && !clave.includes('desbloqueo') && !clave.includes('nombre') && !clave.includes('logo')) {
                const numValor = parseInt(valor)
                if (isNaN(numValor)) {
                    throw new Error('El valor debe ser un número')
                }
                if (meta?.min && numValor < meta.min) {
                    throw new Error(`El valor mínimo es ${meta.min}`)
                }
                if (meta?.max && numValor > meta.max) {
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
        if (clave.includes('nombre')) return '🏷️'
        if (clave.includes('logo')) return '🖼️'
        if (clave.includes('visita')) return '📍'
        if (clave.includes('asistencia') || clave.includes('hora_limite')) return '🕐'
        if (clave.includes('oficina')) return '🏢'
        return '⚙️'
    }

    // Ensure all required keys exist in the display list
    const requiredKeys = [
        'renovacion_min_pagado', 
        'umbral_cpp_cuotas', 
        'umbral_moroso_cuotas', 
        'umbral_cpp_otros',
        'umbral_moroso_otros',
        'refinanciacion_min_mora',
        'horario_apertura',
        'horario_cierre',
        'horario_fin_turno_1',
        'tiempo_gracia_post_cuadre',
        'desbloqueo_hasta',
        'nombre_sistema',
        'logo_sistema_url',
        'visita_tiempo_minimo',
        'asistencia_radio_metros',
        'asistencia_descuento_por_minuto',
        'asistencia_tolerancia_minutos',
        'oficina_lat',
        'oficina_lon',
        'visita_radio_maximo'
    ]

    const displayConfig = [...initialConfig]
    requiredKeys.forEach(key => {
        if (!displayConfig.find(item => item.clave === key)) {
            displayConfig.push({
                clave: key,
                valor: 
                    key === 'horario_apertura' ? '10:00' : 
                    key === 'horario_cierre' ? '19:00' : 
                    key === 'horario_fin_turno_1' ? '13:30' :
                    'N/A',
                descripcion: CONFIG_LABELS[key]?.descripcion || 'Configuración del sistema',
                tipo: 'string'
            })
        }
    })

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            {displayConfig.map((item) => {
                const meta = CONFIG_LABELS[item.clave]
                const isEditing = editingKey === item.clave
                const currentValue = config[item.clave] || item.valor

                return (
                    <div 
                        key={item.clave}
                        className={cn(
                            "bg-slate-900/40 backdrop-blur-sm border border-slate-800/50 rounded-xl p-4 transition-all flex flex-col justify-between group",
                            isEditing ? "border-blue-500/30 bg-slate-900/60 ring-1 ring-blue-500/10" : "hover:border-slate-700"
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
                                    <Input
                                        id={item.clave}
                                        type={
                                            (item.clave.includes('horario') || item.clave.includes('cuadre') || item.clave.includes('nombre') || item.clave.includes('logo')) 
                                                ? 'text' 
                                                : (item.clave.includes('desbloqueo') || item.clave.includes('umbral') || item.clave.includes('renovacion') || item.clave.includes('visita') || item.clave.includes('radio') || item.clave.includes('asistencia') || item.clave.includes('tolerancia'))
                                                    ? 'number' 
                                                    : 'text'
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
                                            item.clave === 'logo_sistema_url' && "pr-10"
                                        )}
                                    />
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
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

                                {/* Compact Info Blocks */}
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
                                            setConfig({ ...config, [item.clave]: item.valor })
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
                                    className="w-full h-8 bg-purple-600/90 hover:bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-lg shadow-purple-900/20 group"
                                >
                                    {unlocking ? <Loader2 className="animate-spin mr-2 h-3 w-3" /> : <Lock className="mr-2 h-3 w-3 group-hover:animate-bounce" />}
                                    DESBLOQUEAR SISTEMA ({parseInt(config['desbloqueo_hasta']) || 15}M)
                                </Button>
                            ) : null}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
