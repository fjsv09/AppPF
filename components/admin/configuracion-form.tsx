'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, Save, AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react'
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
        nombre: 'Umbral CPP (Cartera Pesada)',
        descripcion: 'Número de cuotas vencidas para marcar préstamo como CPP',
        min: 1,
        max: 30
    },
    'umbral_moroso_cuotas': {
        nombre: 'Umbral Moroso',
        descripcion: 'Número de cuotas vencidas para marcar préstamo como Moroso',
        min: 1,
        max: 90
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
    'desbloqueo_hasta': {
        nombre: 'Desbloqueo Temporal',
        descripcion: 'Fecha y hora hasta la cual el sistema está desbloqueado por excepción (ISO)',
    }
}

export function ConfiguracionForm({ initialConfig }: ConfiguracionFormProps) {
    const router = useRouter()
    const [config, setConfig] = useState<Record<string, string>>(
        initialConfig.reduce((acc, item) => ({ ...acc, [item.clave]: item.valor }), {})
    )
    const [saving, setSaving] = useState(false)
    const [unlocking, setUnlocking] = useState(false)
    const [editingKey, setEditingKey] = useState<string | null>(null)

    const handleUnlock = async () => {
        setUnlocking(true)
        try {
            const response = await fetch('/api/configuracion/desbloquear', { method: 'POST' })
            if (!response.ok) throw new Error('Error al desbloquear')
            
            const data = await response.json()
            toast.success('Sistema desbloqueado por 15 minutos', {
                description: `Habilitado hasta: ${new Date(data.activo_hasta).toLocaleTimeString()}`
            })
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setUnlocking(false)
        }
    }

    const handleSave = async (clave: string) => {
        setSaving(true)
        try {
            const valor = config[clave]
            const meta = CONFIG_LABELS[clave]

            // Validación (Solo para números)
            if (!clave.includes('horario') && !clave.includes('desbloqueo')) {
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
        return '⚙️'
    }

    // Ensure all required keys exist in the display list
    const requiredKeys = [
        'renovacion_min_pagado', 
        'umbral_cpp_cuotas', 
        'umbral_moroso_cuotas', 
        'refinanciacion_min_mora',
        'horario_apertura',
        'horario_cierre',
        'desbloqueo_hasta'
    ]

    const displayConfig = [...initialConfig]
    requiredKeys.forEach(key => {
        if (!displayConfig.find(item => item.clave === key)) {
            displayConfig.push({
                clave: key,
                valor: key === 'horario_apertura' ? '07:00' : key === 'horario_cierre' ? '20:00' : 'N/A',
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
                                        type={item.clave.includes('horario') ? 'text' : item.clave.includes('desbloqueo') ? 'text' : 'number'}
                                        value={currentValue}
                                        onChange={(e) => setConfig({ ...config, [item.clave]: e.target.value })}
                                        disabled={!isEditing}
                                        className={cn(
                                            "h-9 bg-slate-950/40 border-slate-800 text-white text-sm font-mono transition-all",
                                            isEditing ? "border-blue-500/40 bg-slate-950" : "opacity-60 cursor-default"
                                        )}
                                    />
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
                                    Desbloquear Sistema (15m)
                                </Button>
                            ) : null}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
