'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { BackButton } from '@/components/ui/back-button'
import { 
    Target, 
    Users, 
    Plus, 
    TrendingUp, 
    Percent, 
    ShieldAlert,
    Calendar,
    Award,
    Trash2,
    Pencil,
    Loader2,
    AlertTriangle
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { CreateMetaForm } from '@/components/admin/create-meta-form'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"

export default function AdminMetasPage() {
    const [metas, setMetas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [metaToEdit, setMetaToEdit] = useState<any | null>(null)
    const [metaToDeactivate, setMetaToDeactivate] = useState<any | null>(null)
    const [isDeactivating, setIsDeactivating] = useState(false)
    const supabase = createClient()

    async function fetchMetas() {
        setLoading(true)
        const { data } = await supabase
            .from('metas_asesores')
            .select(`
                *,
                perfiles:asesor_id (nombre_completo, rol)
            `)
            .eq('activo', true)
            .order('created_at', { ascending: false })
        setMetas(data || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchMetas()
    }, [])

    const handleConfirmDeactivate = async () => {
        if (!metaToDeactivate) return;
        setIsDeactivating(true);
        
        try {
            const { error } = await supabase
                .from('metas_asesores')
                .update({ activo: false })
                .eq('id', metaToDeactivate.id)

            if (error) throw error;

            toast.success('Meta desactivada correctamente');
            setMetaToDeactivate(null);
            fetchMetas();
        } catch (error: any) {
            console.error('Error deactivating meta:', error);
            toast.error('Error al desactivar la meta: ' + error.message);
        } finally {
            setIsDeactivating(false);
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            <Target className="w-8 h-8 text-blue-500" />
                            Gestión de Metas y Bonos
                        </h1>
                    </div>
                    <p className="text-slate-400 mt-2 ml-11">Asigna objetivos mensuales y configura bonos de rendimiento.</p>
                </div>
                
                <button 
                    onClick={() => {
                        setMetaToEdit(null)
                        setShowCreate(true)
                    }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95 whitespace-nowrap"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Meta
                </button>
            </div>

            {/* Modal de Creación / Edición */}
            <Dialog open={showCreate} onOpenChange={(open) => {
                setShowCreate(open)
                if (!open) setMetaToEdit(null)
            }}>
                <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-800 text-white shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Target className="w-5 h-5 text-blue-500" />
                            {metaToEdit ? 'Editar Meta' : 'Asignar Nueva Meta'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            {metaToEdit 
                                ? 'Modifica los objetivos y bonos de esta meta.' 
                                : 'Configura los objetivos operativos y bonos mensuales para el usuario.'}
                        </DialogDescription>
                    </DialogHeader>
                    <CreateMetaForm 
                        initialData={metaToEdit}
                        onSuccess={() => {
                            setShowCreate(false)
                            setMetaToEdit(null)
                            fetchMetas()
                        }}
                        onCancel={() => {
                            setShowCreate(false)
                            setMetaToEdit(null)
                        }}
                    />
                </DialogContent>
            </Dialog>

            {/* Modal de Confirmación de Desactivación */}
            <Dialog open={!!metaToDeactivate} onOpenChange={(open) => !open && setMetaToDeactivate(null)}>
                <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-white shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2 text-rose-500">
                            <AlertTriangle className="w-5 h-5" />
                            Desactivar Meta
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 mt-2">
                            ¿Estás seguro de que deseas desactivar esta meta para <strong>{metaToDeactivate?.perfiles?.nombre_completo}</strong>?
                            <br/><br/>
                            <span className="text-rose-400/80 text-sm">Esta acción ocultará la meta y dejará de generar bonos por ella en el futuro, pero mantendrá el historial de bonos ya pagados intacto.</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                        <button
                            onClick={() => setMetaToDeactivate(null)}
                            disabled={isDeactivating}
                            className="px-4 py-2 font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmDeactivate}
                            disabled={isDeactivating}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-rose-500/20 disabled:opacity-50"
                        >
                            {isDeactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Desactivar
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Resumen de Cumplimiento (Simulado basado en metas cargadas) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
                    <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Target className="w-16 h-16 text-white" />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Metas Activas</p>
                    <h3 className="text-2xl font-bold text-white">{metas.length}</h3>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
                    <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Percent className="w-16 h-16 text-emerald-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Promedio Cobranza</p>
                    <h3 className="text-2xl font-bold text-emerald-400">92.4%</h3>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
                    <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Award className="w-16 h-16 text-amber-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Bonos Proyectados</p>
                    <h3 className="text-2xl font-bold text-amber-500">S/ 4,500</h3>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl relative overflow-hidden group">
                    <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <ShieldAlert className="w-16 h-16 text-rose-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Mora Promedio</p>
                    <h3 className="text-2xl font-bold text-rose-400">6.8%</h3>
                </div>
            </div>

            {/* Listado de Metas */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/30">
                    <h2 className="font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-400" />
                        Asesores y Supervisores con Metas
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-950/50 text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-slate-800">
                                <th className="px-6 py-4">Usuario</th>
                                <th className="px-6 py-4 text-center">Tipo de Meta</th>
                                <th className="px-6 py-4 text-center">Periodo</th>
                                <th className="px-6 py-4 text-center">Objetivo</th>
                                <th className="px-6 py-4 text-center">Bono</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                                            <p className="font-bold animate-pulse">Cargando metas...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : metas.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <Target className="w-12 h-12 opacity-20" />
                                            <p>No hay metas asignadas para este periodo</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                metas.map((meta: any) => (
                                    <tr key={meta.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold border ${
                                                    meta.perfiles?.rol === 'supervisor' 
                                                        ? 'bg-purple-600/20 text-purple-400 border-purple-500/20' 
                                                        : 'bg-blue-600/20 text-blue-400 border-blue-500/20'
                                                }`}>
                                                    {meta.perfiles?.nombre_completo?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-200 group-hover:text-white transition-colors">
                                                        {meta.perfiles?.nombre_completo}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                                                        {meta.perfiles?.rol}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Badge variant="outline" className={`capitalize font-bold border-slate-700 text-slate-300`}>
                                                {meta.meta_cobro ? 'Cobranza' : 
                                                 meta.meta_colocacion ? 'Colocación' : 
                                                 meta.meta_morosidad_max ? 'Morosidad' : 
                                                 meta.meta_cantidad_clientes ? 'Clientes' : 
                                                 meta.meta_retencion_clientes ? 'Retención' :
                                                 meta.meta_colocacion_clientes ? 'Coloc. x Cliente' :
                                                 meta.meta_capital_cartera ? 'Capital' : 'General'}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Badge variant="outline" className={`capitalize font-bold ${
                                                meta.periodo === 'diario' ? 'border-emerald-500/50 text-emerald-400' :
                                                meta.periodo === 'semanal' ? 'border-blue-500/50 text-blue-400' :
                                                'border-purple-500/50 text-purple-400'
                                            }`}>
                                                {meta.periodo}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-bold text-white">
                                                {meta.meta_cobro ? `${meta.meta_cobro}%` : 
                                                 meta.meta_colocacion ? `S/ ${meta.meta_colocacion.toLocaleString()}` : 
                                                 meta.meta_morosidad_max ? `${meta.meta_morosidad_max}%` : 
                                                 meta.meta_cantidad_clientes ? `${meta.meta_cantidad_clientes} Clientes` : 
                                                 meta.meta_retencion_clientes ? `${meta.meta_retencion_clientes} Clientes` :
                                                 meta.meta_colocacion_clientes ? `Min S/ ${meta.monto_minimo_prestamo || 500}` :
                                                 meta.meta_capital_cartera ? `S/ ${meta.meta_capital_cartera.toLocaleString()}` : '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center text-sm font-bold text-yellow-500">
                                            {meta.meta_colocacion_clientes 
                                              ? `S/ ${meta.bono_por_cliente || 0}/cliente`
                                              : `S/ ${meta.bono_monto || 0}`}
                                        </td>
                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-1">
                                            <button 
                                                onClick={() => {
                                                    setMetaToEdit(meta)
                                                    setShowCreate(true)
                                                }}
                                                className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors text-blue-400 group/btn" 
                                                title="Editar meta"
                                            >
                                                <Pencil className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                            </button>
                                            <button 
                                                onClick={() => setMetaToDeactivate(meta)}
                                                className="p-2 hover:bg-rose-600/20 rounded-lg transition-colors text-rose-400 group/btn" 
                                                title="Desactivar meta"
                                            >
                                                <Trash2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
