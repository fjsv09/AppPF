'use client'

import { useState, useEffect, Fragment } from 'react'
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

    const metasByUser = metas.reduce((acc, meta) => {
        const userId = meta.asesor_id || String(meta.id); 
        if (!acc[userId]) {
            acc[userId] = {
                user: meta.perfiles || { nombre_completo: 'Usuario Desconocido', rol: 'N/A' },
                metas: []
            };
        }
        acc[userId].metas.push(meta);
        return acc;
    }, {} as Record<string, {user: any, metas: any[]}>);

    const usersList = Object.values(metasByUser).sort((a: any, b: any) => 
        (a.user?.nombre_completo || '').localeCompare(b.user?.nombre_completo || '')
    );

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Gestión de Metas y Bonos</h1>
                            <p className="page-subtitle">Asigna objetivos mensuales y configura bonos de rendimiento por usuario.</p>
                        </div>
                    </div>
                </div>
                
                <button 
                    onClick={() => {
                        setMetaToEdit(null)
                        setShowCreate(true)
                    }}
                    className="btn-action bg-blue-600 hover:bg-blue-700 shadow-blue-500/20 active:scale-95 whitespace-nowrap flex items-center gap-2"
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

            {/* Resumen de Cumplimiento */}
            <div className="kpi-grid md:grid-cols-4">
                <div className="kpi-card group">
                    <div className="kpi-card-icon">
                        <Target className="w-16 h-16 text-white" />
                    </div>
                    <p className="kpi-label">Metas Activas</p>
                    <h3 className="kpi-value">{metas.length}</h3>
                </div>
                <div className="kpi-card group hover:border-emerald-500/30">
                    <div className="kpi-card-icon">
                        <Percent className="w-16 h-16 text-emerald-500" />
                    </div>
                    <p className="kpi-label">Promedio Cobranza</p>
                    <h3 className="kpi-value text-emerald-400">92.4%</h3>
                </div>
                <div className="kpi-card group hover:border-amber-500/30">
                    <div className="kpi-card-icon">
                        <Award className="w-16 h-16 text-amber-500" />
                    </div>
                    <p className="kpi-label">Total Bonos Proyectados</p>
                    <h3 className="kpi-value text-amber-500">S/ 4,500</h3>
                </div>
                <div className="kpi-card group hover:border-rose-500/30">
                    <div className="kpi-card-icon">
                        <ShieldAlert className="w-16 h-16 text-rose-500" />
                    </div>
                    <p className="kpi-label">Mora Promedio</p>
                    <h3 className="kpi-value text-rose-400">6.8%</h3>
                </div>
            </div>

            {/* Title for Card Grid */}
            <div className="mt-8 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                        <Users className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="font-bold text-xl text-white leading-tight">
                            Listado por Usuario
                        </h2>
                        <p className="text-xs text-slate-400 font-medium tracking-wide">Desglose de metas y objetivos individuales</p>
                    </div>
                </div>
            </div>
            
            {/* Grid Layout Principal */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 border border-slate-800 rounded-3xl bg-slate-900/50 shadow-2xl">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                    <p className="font-bold text-slate-400 animate-pulse text-lg">Cargando la información de metas...</p>
                </div>
            ) : usersList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 border border-slate-800 rounded-3xl bg-slate-900/50 shadow-2xl">
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-2">
                        <Target className="w-10 h-10 text-slate-500 opacity-50" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-300">Sin Metas Asignadas</h3>
                    <p className="text-slate-500 font-medium max-w-sm text-center">No hay metas activas registradas en el sistema para este periodo. Haz clic en "Nueva Meta" para asignar objetivos.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {usersList.map(({ user, metas: userMetas }) => (
                        <div key={user.nombre_completo} className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col group hover:border-slate-700 hover:shadow-blue-500/5 transition-all duration-300">
                            {/* Card Header (User Profile) */}
                            <div className="p-5 border-b border-slate-800 bg-slate-950/40 relative overflow-hidden">
                                <div className="absolute -top-4 -right-4 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:rotate-12 group-hover:scale-110 duration-500">
                                    <Target className="w-32 h-32" />
                                </div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-xl border-2 shadow-lg shrink-0 ${
                                        user.rol === 'supervisor' 
                                            ? 'bg-purple-600/20 text-purple-400 border-purple-500/30 shadow-purple-900/50' 
                                            : 'bg-blue-600/20 text-blue-400 border-blue-500/30 shadow-blue-900/50'
                                    }`}>
                                        {user.nombre_completo?.charAt(0) || '?'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-bold text-white text-lg group-hover:text-blue-400 transition-colors truncate">
                                            {user.nombre_completo}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className={`font-bold uppercase tracking-widest text-[9px] px-2 py-0.5 ${
                                                user.rol === 'supervisor' ? 'text-purple-400 border-purple-500/30 bg-purple-500/10' : 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                                            }`}>
                                                {user.rol || 'Asesor'}
                                            </Badge>
                                            <span className="text-[10px] text-slate-400 font-bold bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-800 flex items-center gap-1">
                                                <Target className="w-3 h-3 text-slate-500" />
                                                {userMetas.length} {userMetas.length === 1 ? 'Meta' : 'Metas'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Card Body (Goals List) */}
                            <div className="flex-1 p-5 bg-slate-950/20">
                                <div className="flex flex-col gap-3">
                                    {userMetas.map((meta: any) => (
                                        <div key={meta.id} className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/80 flex flex-col gap-3 hover:bg-slate-800 hover:border-slate-700 shadow-sm transition-all group/goal">
                                            
                                            {/* Meta Header */}
                                            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant="default" className="bg-slate-800 hover:bg-slate-700 capitalize font-bold text-slate-200">
                                                        {meta.meta_cobro ? 'Cobranza' : 
                                                         meta.meta_colocacion ? 'Colocación' : 
                                                         meta.meta_morosidad_max ? 'Morosidad' : 
                                                         meta.meta_cantidad_clientes ? 'Clientes' : 
                                                         meta.meta_retencion_clientes ? 'Retención' :
                                                         meta.meta_colocacion_clientes ? 'Coloc. x Cliente' :
                                                         meta.meta_capital_cartera ? 'Capital' : 'General'}
                                                    </Badge>
                                                    <Badge variant="outline" className={`capitalize font-bold bg-slate-950/50 ${
                                                        meta.periodo === 'diario' ? 'border-emerald-500/30 text-emerald-400' :
                                                        meta.periodo === 'semanal' ? 'border-blue-500/30 text-blue-400' :
                                                        'border-amber-500/30 text-amber-500'
                                                    }`}>
                                                        {meta.periodo}
                                                    </Badge>
                                                </div>
                                                
                                                <div className="flex items-center gap-0.5 bg-slate-950/80 rounded-lg p-0.5 border border-slate-800/50 opacity-100 md:opacity-0 group-hover/goal:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => {
                                                            setMetaToEdit(meta);
                                                            setShowCreate(true);
                                                        }}
                                                        className="p-1.5 hover:bg-blue-600/20 rounded-md transition-colors text-slate-400 hover:text-blue-400" 
                                                        title="Editar meta"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5"></div>
                                                    <button 
                                                        onClick={() => setMetaToDeactivate(meta)}
                                                        className="p-1.5 hover:bg-rose-600/20 rounded-md transition-colors text-slate-400 hover:text-rose-500" 
                                                        title="Desactivar meta"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Meta Details */}
                                            <div className="grid grid-cols-2 gap-3 mt-0.5">
                                                <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/40">
                                                    <p className="text-[9px] uppercase font-black tracking-widest text-slate-500 mb-1.5 flex items-center gap-1.5">
                                                        <Target className="w-3 h-3 opacity-60" /> Objetivo
                                                    </p>
                                                    <span className="text-sm font-bold text-slate-200">
                                                        {meta.meta_cobro ? `${meta.meta_cobro}%` : 
                                                         meta.meta_colocacion ? `S/ ${meta.meta_colocacion.toLocaleString()}` : 
                                                         meta.meta_morosidad_max ? `${meta.meta_morosidad_max}%` : 
                                                         meta.meta_cantidad_clientes ? `${meta.meta_cantidad_clientes}` : 
                                                         meta.meta_retencion_clientes ? `${meta.meta_retencion_clientes}` :
                                                         meta.meta_colocacion_clientes ? `Min S/ ${meta.monto_minimo_prestamo || 500}` :
                                                         meta.meta_capital_cartera ? `S/ ${meta.meta_capital_cartera.toLocaleString()}` : '-'}
                                                    </span>
                                                </div>
                                                <div className="bg-amber-500/5 rounded-xl p-3 border border-amber-500/10">
                                                    <p className="text-[9px] uppercase font-black tracking-widest text-amber-500/70 mb-1.5 flex items-center gap-1.5">
                                                        <Award className="w-3 h-3 opacity-80" /> Bono
                                                    </p>
                                                    <span className="text-sm font-bold text-amber-500">
                                                        {meta.meta_colocacion_clientes 
                                                          ? `S/ ${meta.bono_por_cliente || 0} p/cl`
                                                          : `S/ ${meta.bono_monto || 0}`}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Card Footer */}
                            <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800/80 mt-auto">
                                <button 
                                    onClick={() => {
                                        setMetaToEdit(null);
                                        setShowCreate(true);
                                    }}
                                    className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-400 hover:bg-slate-900 rounded-xl transition-colors border border-transparent hover:border-slate-800 group/btn"
                                >
                                    <Plus className="w-3.5 h-3.5 group-hover/btn:scale-125 transition-transform" /> 
                                    Añadir otra meta
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
