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
    { value: 'recaudacion', label: 'Recaudación Total (S/)', desc: 'Suma de dinero cobrada en el periodo (cuotas, mora, etc)', icon: DollarSign },
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

    const [formData, setFormData] = useState(() => {
        const base = {
            asesor_id: '',
            rol_seleccionado: '',
            tipo_meta: 'cobro',
            periodo: 'mensual',
            valor_objetivo: '',
            bono_monto: '',
            bono_por_cliente: '',
            monto_minimo_prestamo: '500',
            escalones: [
                { mora: '5', bono: '500' },
                { mora: '7', bono: '250' },
                { mora: '9', bono: '150' }
            ]
        }

        if (!initialData) return base

        let tipo = 'cobro'
        let valor = ''
        
        if (initialData.meta_cobro !== null && initialData.meta_cobro !== undefined) { tipo = 'cobro'; valor = initialData.meta_cobro.toString(); }
        else if (initialData.meta_recaudacion_total !== null && initialData.meta_recaudacion_total !== undefined) { tipo = 'recaudacion'; valor = initialData.meta_recaudacion_total.toString(); }
        else if (initialData.meta_colocacion !== null && initialData.meta_colocacion !== undefined) { tipo = 'colocacion'; valor = initialData.meta_colocacion.toString(); }
        else if (initialData.meta_morosidad_max !== null && initialData.meta_morosidad_max !== undefined) { tipo = 'mora'; valor = initialData.meta_morosidad_max.toString(); }
        else if (initialData.escalones_mora) { tipo = 'mora'; valor = ''; }
        else if (initialData.meta_cantidad_clientes !== null && initialData.meta_cantidad_clientes !== undefined) { tipo = 'clientes'; valor = initialData.meta_cantidad_clientes.toString(); }
        else if (initialData.meta_retencion_clientes !== null && initialData.meta_retencion_clientes !== undefined) { tipo = 'retencion'; valor = initialData.meta_retencion_clientes.toString(); }
        else if (initialData.meta_colocacion_clientes) { tipo = 'colocacion_clientes'; valor = ''; }
        else if (initialData.meta_capital_cartera !== null && initialData.meta_capital_cartera !== undefined) { tipo = 'capital'; valor = initialData.meta_capital_cartera.toString(); }

        return {
            asesor_id: initialData.asesor_id || '',
            rol_seleccionado: initialData.perfiles?.rol || '',
            tipo_meta: tipo,
            periodo: (initialData.periodo || 'mensual').toLowerCase().trim(),
            valor_objetivo: valor,
            bono_monto: initialData.bono_monto?.toString() || '',
            bono_por_cliente: initialData.bono_por_cliente?.toString() || '',
            monto_minimo_prestamo: initialData.monto_minimo_prestamo?.toString() || '500',
            escalones: initialData.escalones_mora ? (typeof initialData.escalones_mora === 'string' ? JSON.parse(initialData.escalones_mora) : initialData.escalones_mora) : [
                { mora: '5', bono: '500' },
                { mora: '7', bono: '250' },
                { mora: '9', bono: '150' }
            ]
        }
    })

    useEffect(() => {
        if (initialData) {
            let tipo = 'cobro'
            let valor = ''
            
            if (initialData.meta_cobro !== null && initialData.meta_cobro !== undefined) { tipo = 'cobro'; valor = initialData.meta_cobro.toString(); }
            else if (initialData.meta_recaudacion_total !== null && initialData.meta_recaudacion_total !== undefined) { tipo = 'recaudacion'; valor = initialData.meta_recaudacion_total.toString(); }
            else if (initialData.meta_colocacion !== null && initialData.meta_colocacion !== undefined) { tipo = 'colocacion'; valor = initialData.meta_colocacion.toString(); }
            else if (initialData.meta_morosidad_max !== null && initialData.meta_morosidad_max !== undefined) { tipo = 'mora'; valor = initialData.meta_morosidad_max.toString(); }
            else if (initialData.escalones_mora) { tipo = 'mora'; valor = ''; }
            else if (initialData.meta_cantidad_clientes !== null && initialData.meta_cantidad_clientes !== undefined) { tipo = 'clientes'; valor = initialData.meta_cantidad_clientes.toString(); }
            else if (initialData.meta_retencion_clientes !== null && initialData.meta_retencion_clientes !== undefined) { tipo = 'retencion'; valor = initialData.meta_retencion_clientes.toString(); }
            else if (initialData.meta_colocacion_clientes) { tipo = 'colocacion_clientes'; valor = ''; }
            else if (initialData.meta_capital_cartera !== null && initialData.meta_capital_cartera !== undefined) { tipo = 'capital'; valor = initialData.meta_capital_cartera.toString(); }

            setFormData({
                asesor_id: initialData.asesor_id || '',
                rol_seleccionado: initialData.perfiles?.rol || '',
                tipo_meta: tipo,
                periodo: (initialData.periodo || 'mensual').toLowerCase().trim(),
                valor_objetivo: valor,
                bono_monto: initialData.bono_monto?.toString() || '',
                bono_por_cliente: initialData.bono_por_cliente?.toString() || '',
                monto_minimo_prestamo: initialData.monto_minimo_prestamo?.toString() || '500',
                escalones: initialData.escalones_mora ? (typeof initialData.escalones_mora === 'string' ? JSON.parse(initialData.escalones_mora) : initialData.escalones_mora) : [
                    { mora: '5', bono: '500' },
                    { mora: '7', bono: '250' },
                    { mora: '9', bono: '150' }
                ]
            })
        } else {
            setFormData({
                asesor_id: '',
                rol_seleccionado: '',
                tipo_meta: 'cobro',
                periodo: 'mensual',
                valor_objetivo: '',
                bono_monto: '',
                bono_por_cliente: '',
                monto_minimo_prestamo: '500',
                escalones: [
                    { mora: '5', bono: '500' },
                    { mora: '7', bono: '250' },
                    { mora: '9', bono: '150' }
                ]
            })
        }
    }, [initialData])

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
        } else if (!formData.valor_objetivo && formData.tipo_meta !== 'mora') {
            toast.error('Complete el campo de objetivo')
            return
        }

        setLoading(true)
        try {
            const dataToInsert: any = {
                asesor_id: formData.asesor_id,
                periodo: formData.periodo as any,
                bono_monto: formData.bono_monto ? parseFloat(formData.bono_monto) : 0,
                activo: true
            }

            // Ensure null for resetting fields
            dataToInsert.meta_cobro = null;
            dataToInsert.meta_colocacion = null;
            dataToInsert.meta_recaudacion_total = null;
            dataToInsert.meta_morosidad_max = null;
            dataToInsert.meta_cantidad_clientes = null;
            dataToInsert.meta_retencion_clientes = null;
            dataToInsert.meta_colocacion_clientes = null;
            dataToInsert.meta_capital_cartera = null;
            dataToInsert.bono_por_cliente = null;
            dataToInsert.monto_minimo_prestamo = null;
            dataToInsert.escalones_mora = null;

            if (formData.tipo_meta === 'mora') {
                dataToInsert.escalones_mora = JSON.stringify(formData.escalones);
            }

            switch (formData.tipo_meta) {
                case 'cobro': 
                    dataToInsert.meta_cobro = parseFloat(formData.valor_objetivo); 
                    break;
                case 'recaudacion':
                    dataToInsert.meta_recaudacion_total = parseFloat(formData.valor_objetivo);
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
                        <SelectContent className="bg-slate-900 border-slate-700 text-white">
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

                {/* Valor Objetivo - solo si NO es colocación por cliente ni mora por escalones */}
                {!esColocacionClientes && formData.tipo_meta !== 'mora' && (
                    <div className="space-y-2">
                        <Label className="text-slate-300">
                            {formData.tipo_meta === 'retencion' ? 'Clientes a mantener' : 'Objetivo'}
                        </Label>
                        <Input
                            type="number"
                            placeholder={
                                formData.tipo_meta === 'cobro' ? 'Ej. 90 (%)' :
                                formData.tipo_meta === 'recaudacion' ? 'Ej. 5000 (S/)' :
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

            {/* Escalones de Morosidad */}
            {formData.tipo_meta === 'mora' && (
                <div className="space-y-4 p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                    <h4 className="text-sm font-bold text-orange-400 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        Escalones de Morosidad
                    </h4>
                    <div className="space-y-3">
                        {formData.escalones.map((esc: any, idx: number) => (
                            <div key={idx} className="grid grid-cols-2 gap-4 items-end bg-slate-900/30 p-2 rounded-lg border border-slate-800">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] text-slate-500 uppercase">Mora Máxima % (E{idx+1})</Label>
                                    <Input
                                        type="number"
                                        value={esc.mora}
                                        onChange={(e) => {
                                            const newEsc = [...formData.escalones]
                                            newEsc[idx].mora = e.target.value
                                            setFormData({ ...formData, escalones: newEsc })
                                        }}
                                        className="h-9 bg-slate-800 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] text-slate-500 uppercase">Bono S/ (E{idx+1})</Label>
                                    <Input
                                        type="number"
                                        value={esc.bono}
                                        onChange={(e) => {
                                            const newEsc = [...formData.escalones]
                                            newEsc[idx].bono = e.target.value
                                            setFormData({ ...formData, escalones: newEsc })
                                        }}
                                        className="h-9 bg-slate-800 border-slate-700"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 italic">El bono se asigna automáticamente al mejor escalón que cumpla el asesor.</p>
                </div>
            )}

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

            {/* Bono fijo (solo si NO es colocación ni mora escalonada) */}
            {!esColocacionClientes && formData.tipo_meta !== 'mora' && (
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
