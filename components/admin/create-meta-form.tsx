'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Target, Loader2, Award, Percent, TrendingUp, ShieldAlert, X, Users, DollarSign, Info } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface CreateMetaFormProps {
    onSuccess?: () => void
    onCancel?: () => void
    initialData?: any
}

const TIPOS_META = [
    { value: 'cobro', label: 'Cobranza (%)', desc: 'Porcentaje de cobranza diaria/semanal/mensual', icon: Percent },
    { value: 'colocacion', label: 'Colocación (S/)', desc: 'Monto total de colocación', icon: TrendingUp },
    { value: 'mora', label: 'Morosidad Máxima (%)', desc: 'Porcentaje máximo de mora permitido', icon: ShieldAlert },
    { value: 'clientes', label: 'Nuevos Clientes (Meta)', desc: 'Lograr un mínimo de clientes nuevos en el periodo', icon: Users },
    { value: 'retencion', label: 'Retención de Cartera', desc: 'Mantener X clientes activos al cierre de mes', icon: Users },
    { value: 'colocacion_clientes', label: 'Colocación por Cliente', desc: 'Bono por cada cliente nuevo colocado. Requiere monto mínimo de préstamo.', icon: DollarSign },
    { value: 'capital', label: 'Capital de Cartera (S/)', desc: 'Capital total gestionado (supervisor)', icon: Target },
]

export function CreateMetaForm({ onSuccess, onCancel, initialData }: CreateMetaFormProps) {
    const [loading, setLoading] = useState(false)
    const [usuarios, setUsuarios] = useState<any[]>([])
    const [fetchingUsers, setFetchingUsers] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        if (initialData) {
            let tipo = 'cobro'
            let valor = ''
            
            if (initialData.meta_cobro) { tipo = 'cobro'; valor = initialData.meta_cobro.toString(); }
            else if (initialData.meta_colocacion) { tipo = 'colocacion'; valor = initialData.meta_colocacion.toString(); }
            else if (initialData.meta_morosidad_max) { tipo = 'mora'; valor = initialData.meta_morosidad_max.toString(); }
            else if (initialData.meta_cantidad_clientes) { tipo = 'clientes'; valor = initialData.meta_cantidad_clientes.toString(); }
            else if (initialData.meta_retencion_clientes) { tipo = 'retencion'; valor = initialData.meta_retencion_clientes.toString(); }
            else if (initialData.meta_colocacion_clientes) { tipo = 'colocacion_clientes'; valor = ''; }
            else if (initialData.meta_capital_cartera) { tipo = 'capital'; valor = initialData.meta_capital_cartera.toString(); }

            setFormData({
                asesor_id: initialData.asesor_id || '',
                rol_seleccionado: initialData.perfiles?.rol || '',
                tipo_meta: tipo,
                periodo: initialData.periodo || 'mensual',
                valor_objetivo: valor,
                bono_monto: initialData.bono_monto?.toString() || '',
                bono_por_cliente: initialData.bono_por_cliente?.toString() || '',
                monto_minimo_prestamo: initialData.monto_minimo_prestamo?.toString() || '500'
            })
        }
    }, [initialData])

    const [formData, setFormData] = useState({
        asesor_id: initialData?.asesor_id || '',
        rol_seleccionado: initialData?.perfiles?.rol || '',
        tipo_meta: 'cobro', // Overridden in effect
        periodo: initialData?.periodo || 'mensual',
        valor_objetivo: '', // Overridden in effect
        bono_monto: initialData?.bono_monto?.toString() || '',
        bono_por_cliente: initialData?.bono_por_cliente?.toString() || '',
        monto_minimo_prestamo: initialData?.monto_minimo_prestamo?.toString() || '500'
    })

    useEffect(() => {
        async function fetchUsers() {
            try {
                const { data } = await supabase
                    .from('perfiles')
                    .select('id, nombre_completo, rol')
                    .in('rol', ['asesor', 'supervisor'])
                    .order('nombre_completo')
                setUsuarios(data || [])
            } catch (err) {
                console.error(err)
            } finally {
                setFetchingUsers(false)
            }
        }
        fetchUsers()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!formData.asesor_id) {
            toast.error('Selecciona un usuario')
            return
        }

        // Validación según tipo
        if (formData.tipo_meta === 'colocacion_clientes') {
            if (!formData.bono_por_cliente) {
                toast.error('Ingresa el bono por cliente')
                return
            }
        } else if (!formData.valor_objetivo) {
            toast.error('Complete el campo de objetivo')
            return
        }

        setLoading(true)
        try {
            const dataToInsert: any = {
                asesor_id: formData.asesor_id,
                periodo: formData.periodo as any,
                bono_monto: formData.bono_monto ? parseFloat(formData.bono_monto) : 0
            }

            // Ensure null for resetting fields
            dataToInsert.meta_cobro = null;
            dataToInsert.meta_colocacion = null;
            dataToInsert.meta_morosidad_max = null;
            dataToInsert.meta_cantidad_clientes = null;
            dataToInsert.meta_retencion_clientes = null;
            dataToInsert.meta_colocacion_clientes = null;
            dataToInsert.meta_capital_cartera = null;
            dataToInsert.bono_por_cliente = null;
            dataToInsert.monto_minimo_prestamo = null;

            switch (formData.tipo_meta) {
                case 'cobro': 
                    dataToInsert.meta_cobro = parseFloat(formData.valor_objetivo); 
                    break;
                case 'colocacion': 
                    dataToInsert.meta_colocacion = parseFloat(formData.valor_objetivo); 
                    break;
                case 'mora': 
                    dataToInsert.meta_morosidad_max = parseFloat(formData.valor_objetivo); 
                    break;
                case 'clientes': 
                    dataToInsert.meta_cantidad_clientes = parseInt(formData.valor_objetivo); 
                    break;
                case 'retencion':
                    dataToInsert.meta_retencion_clientes = parseInt(formData.valor_objetivo);
                    break;
                case 'colocacion_clientes':
                    dataToInsert.meta_colocacion_clientes = 1;
                    dataToInsert.bono_por_cliente = parseFloat(formData.bono_por_cliente);
                    dataToInsert.monto_minimo_prestamo = parseFloat(formData.monto_minimo_prestamo || '500');
                    dataToInsert.bono_monto = 0;
                    break;
                case 'capital': 
                    dataToInsert.meta_capital_cartera = parseFloat(formData.valor_objetivo); 
                    break;
            }

            if (initialData?.id) {
                const { error } = await supabase
                    .from('metas_asesores')
                    .update(dataToInsert)
                    .eq('id', initialData.id)
                if (error) throw error
                toast.success('Meta actualizada correctamente')
            } else {
                const { error } = await supabase
                    .from('metas_asesores')
                    .insert(dataToInsert)
                if (error) throw error
                toast.success('Meta asignada correctamente')
            }

            onSuccess?.()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const tipoActual = TIPOS_META.find(t => t.value === formData.tipo_meta)
    const esColocacionClientes = formData.tipo_meta === 'colocacion_clientes'

    return (
        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
            <div className="grid grid-cols-2 gap-4">
                {/* Usuario */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Usuario</Label>
                    <Select 
                        value={formData.asesor_id} 
                        onValueChange={(val) => {
                            const user = usuarios.find(u => u.id === val)
                            setFormData({ ...formData, asesor_id: val, rol_seleccionado: user?.rol || '' })
                        }}
                    >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                            <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                            {usuarios.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                    {u.nombre_completo} ({u.rol})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Tipo de Meta */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Tipo de Meta</Label>
                    <Select 
                        value={formData.tipo_meta} 
                        onValueChange={(val) => setFormData({ ...formData, tipo_meta: val, valor_objetivo: '', bono_por_cliente: '', bono_monto: '' })}
                    >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            {TIPOS_META.map(tipo => (
                                !(tipo.value === 'capital' && formData.rol_seleccionado !== 'supervisor') && (
                                    <SelectItem key={tipo.value} value={tipo.value}>
                                        {tipo.label}
                                    </SelectItem>
                                )
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Descripción del tipo de meta */}
            {tipoActual && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-400">{tipoActual.desc}</p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                {/* Periodo */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Periodo</Label>
                    <Select 
                        value={formData.periodo} 
                        onValueChange={(val) => setFormData({ ...formData, periodo: val })}
                    >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-white">
                            <SelectItem value="diario">Diario</SelectItem>
                            <SelectItem value="semanal">Semanal</SelectItem>
                            <SelectItem value="mensual">Mensual</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Valor Objetivo - solo si NO es colocación por cliente */}
                {!esColocacionClientes && (
                    <div className="space-y-2">
                        <Label className="text-slate-300">
                            {formData.tipo_meta === 'retencion' ? 'Clientes a mantener' : 'Objetivo'}
                        </Label>
                        <Input
                            type="number"
                            placeholder={
                                formData.tipo_meta === 'cobro' ? 'Ej. 90 (%)' :
                                formData.tipo_meta === 'retencion' ? 'Ej. 15 clientes' :
                                formData.tipo_meta === 'clientes' ? 'Ej. 5 clientes' :
                                'Ej. 5000'
                            }
                            value={formData.valor_objetivo}
                            onChange={(e) => setFormData({ ...formData, valor_objetivo: e.target.value })}
                            className="bg-slate-800/50 border-slate-700 text-white h-11"
                        />
                    </div>
                )}
            </div>

            {/* Campos específicos para Colocación por Cliente */}
            {esColocacionClientes && (
                <div className="space-y-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Configuración de Bono por Cliente
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-slate-300 text-xs">Bono por cada cliente (S/)</Label>
                            <Input
                                type="number"
                                placeholder="Ej. 30"
                                value={formData.bono_por_cliente}
                                onChange={(e) => setFormData({ ...formData, bono_por_cliente: e.target.value })}
                                className="bg-slate-800/50 border-slate-700 text-white h-11"
                            />
                            <p className="text-[10px] text-slate-500">Se paga por cada cliente nuevo colocado</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300 text-xs">Monto mínimo préstamo (S/)</Label>
                            <Input
                                type="number"
                                placeholder="500"
                                value={formData.monto_minimo_prestamo}
                                onChange={(e) => setFormData({ ...formData, monto_minimo_prestamo: e.target.value })}
                                className="bg-slate-800/50 border-slate-700 text-white h-11"
                            />
                            <p className="text-[10px] text-slate-500">Préstamo mínimo o promedio ≥ este monto</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Bono fijo (solo si NO es colocación por cliente) */}
            {!esColocacionClientes && (
                <div className="space-y-2">
                    <Label className="text-slate-300 flex items-center gap-2">
                        <Award className="w-3.5 h-3.5 text-yellow-400" />
                        Bono por cumplir esta meta (S/)
                    </Label>
                    <Input
                        type="number"
                        placeholder="Ej. 100"
                        value={formData.bono_monto}
                        onChange={(e) => setFormData({ ...formData, bono_monto: e.target.value })}
                        className="bg-slate-800/50 border-slate-700 text-white h-11"
                    />
                </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={onCancel}
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                >
                    Cancelar
                </Button>
                <Button 
                    type="submit" 
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                        initialData?.id ? 'Guardar Cambios' : 'Asignar Meta'
                    }
                </Button>
            </div>
        </form>
    )
}
