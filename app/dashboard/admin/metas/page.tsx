'use client'

import { useState, useEffect, useTransition, Fragment } from 'react'
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
    AlertTriangle,
    CheckCircle2,
    History,
    Clock,
    X
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { CreateMetaForm } from '@/components/admin/create-meta-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/ui/tabs"

export default function AdminMetasPage() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    const [metas, setMetas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [metaToEdit, setMetaToEdit] = useState<any | null>(null)
    const [metaToDeactivate, setMetaToDeactivate] = useState<any | null>(null)
    const [isDeactivating, setIsDeactivating] = useState(false)
    const [pendingBonos, setPendingBonos] = useState<any[]>([])
    const [loadingBonos, setLoadingBonos] = useState(false)
    const supabase = createClient()

    // Sync tab with URL
    const activeTab = searchParams.get('tab') || 'configuracion'
    const setActiveTab = (tab: string) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('tab', tab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    const [showRejectModal, setShowRejectModal] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const [bonoToReject, setBonoToReject] = useState<any | null>(null)
    const [historyBonos, setHistoryBonos] = useState<any[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    async function fetchMetas() {
        setLoading(true)
        const { data } = await supabase
            .from('metas_asesores')
            .select('*, perfiles!asesor_id(nombre_completo, rol)')
            .order('activo', { ascending: false })
            .order('created_at', { ascending: false })
        setMetas(data || [])
        setLoading(false)
    }

    async function fetchPendingBonos() {
        setLoadingBonos(true)
        try {
            const res = await fetch('/api/metas/liquidaciones?status=pendiente');
            const result = await res.json();
            if (result.success) {
                setPendingBonos(result.data || []);
            } else {
                console.error('Error fetching pending bonos:', result.error);
                setPendingBonos([]);
            }
        } catch (error) {
            console.error('Error in fetchPendingBonos:', error);
            setPendingBonos([]);
        } finally {
            setLoadingBonos(false);
        }
    }

    async function fetchHistoryBonos() {
        try {
            const res = await fetch('/api/metas/liquidaciones?status=historial');
            const result = await res.json();
            if (result.success) {
                setHistoryBonos(result.data || []);
            }
        } catch (error) {
            console.error('Error in fetchHistoryBonos:', error);
        }
        setLoadingHistory(false)
    }

    useEffect(() => {
        fetchMetas()
        fetchPendingBonos()
        fetchHistoryBonos()
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

    const handleReactivateMeta = async (metaId: string) => {
        try {
            const { error } = await supabase
                .from('metas_asesores')
                .update({ activo: true })
                .eq('id', metaId)

            if (error) throw error;

            toast.success('Meta reactivada correctamente');
            fetchMetas();
        } catch (error: any) {
            console.error('Error reactivating meta:', error);
            toast.error('Error al reactivar la meta: ' + error.message);
        }
    }

    async function handleApproveBonus(bonusId: string, monto: number, userId: string) {
        try {
            // 1. Aprobar el bono
            const { error: approveError } = await supabase
                .from('bonos_pagados')
                .update({ estado: 'aprobado' })
                .eq('id', bonusId)
            
            if (approveError) throw approveError

            // 2. Actualizar la nómina (Bonos Ganados)
            const today = new Date()
            const mes = today.getMonth() + 1
            const anio = today.getFullYear()

            // Intentar obtener la nómina actual
            const { data: currentNomina } = await supabase
                .from('nomina_personal')
                .select('*')
                .eq('trabajador_id', userId)
                .eq('mes', mes)
                .eq('anio', anio)
                .single()

            if (currentNomina) {
                await supabase
                    .from('nomina_personal')
                    .update({ bonos: (currentNomina.bonos || 0) + monto })
                    .eq('id', currentNomina.id)
            } else {
                // Si no existe, crear una inicial (esto es un fallback)
                await supabase
                    .from('nomina_personal')
                    .insert({
                        trabajador_id: userId,
                        mes,
                        anio,
                        bonos: monto,
                        sueldo_base: 0, // Se ajustará luego
                        estado: 'pendiente'
                    })
            }
            toast.success('Bono aprobado y sumado a nómina')

            // Notificar al asesor
            try {
                fetch('/api/notificaciones/manual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        usuario_id: userId,
                        titulo: '✅ Bono Aprobado',
                        mensaje: `¡Felicidades! Tu liquidación de bono por S/ ${monto} ha sido aprobada y se sumó a tu nómina.`,
                        link: '/dashboard/metas',
                        tipo: 'success'
                    })
                });
            } catch (err) {
                console.error('Error notificando al asesor:', err);
            }

            fetchPendingBonos()
            fetchHistoryBonos()
        } catch (error: any) {
            console.error('Error approving bonus:', error)
            toast.error('Error al aprobar: ' + error.message)
        }
    }

    async function handleRejectBonus(bonusId: string, motivo: string) {
        if (!motivo) return toast.error('Debes ingresar un motivo')
        
        try {
            const { error } = await supabase
                .from('bonos_pagados')
                .update({ 
                    estado: 'rechazado',
                    motivo_rechazo: motivo 
                })
                .eq('id', bonusId)
            
            if (error) throw error

            toast.success('Bono rechazado correctamente')

            // Notificar al asesor
            if (bonoToReject?.asesor_id) {
                try {
                    fetch('/api/notificaciones/manual', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            usuario_id: bonoToReject.asesor_id,
                            titulo: '❌ Bono Rechazado',
                            mensaje: `Tu liquidación de bono ha sido rechazada. Motivo: ${motivo}`,
                            link: '/dashboard/metas',
                            tipo: 'error'
                        })
                    });
                } catch (err) {
                    console.error('Error notificando al asesor:', err);
                }
            }

            fetchPendingBonos()
            fetchHistoryBonos()
        } catch (error: any) {
            toast.error('Error al rechazar: ' + error.message)
        }
    }

    const checkIsActive = (m: any) => m.activo === true || m.activo === 'true' || m.activo === 1 || m.activo === '1';

    const activeMetasTotal = metas.filter(m => checkIsActive(m)).length;

    const metasByUser = metas.reduce((acc, meta) => {
        const userId = meta.asesor_id || 'global'; 
        if (!acc[userId]) {
            acc[userId] = {
                user: meta.perfiles || { nombre_completo: 'Global / Sin Asignar', rol: 'Global' },
                metas: []
            };
        }
        acc[userId].metas.push(meta);
        return acc;
    }, {} as Record<string, {user: any, metas: any[]}>);

    const totalMetasFetched = metas.length;
    const countActivas = metas.filter(m => checkIsActive(m)).length;
    const countInactivas = metas.filter(m => !checkIsActive(m)).length;
    
    const usersList: {user: any, metas: any[]}[] = (Object.values(metasByUser) as {user: any, metas: any[]}[]).sort((a: any, b: any) => 
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
                            <p className="page-subtitle">Asigna objetivos mensuales y configura bonos de rendimiento por usuario. ({totalMetasFetched} metas cargadas)</p>
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

            {/* Tabs de Navegación Principal */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
                <TabsList className="bg-slate-900 border border-slate-800 p-1 mb-6 w-full md:w-max grid grid-cols-3 md:flex h-12 md:h-11">
                    <TabsTrigger value="configuracion" className="data-[state=active]:bg-blue-600 font-bold h-full md:px-6">
                        <Users className="w-4 h-4 mr-1.5 md:mr-2" />
                        <span className="text-[10px] md:text-xs">Metas</span>
                        <span className="hidden lg:inline text-xs ml-1">y Configuración</span>
                    </TabsTrigger>
                    <TabsTrigger value="liquidaciones" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500 flex items-center justify-center h-full md:px-6 gap-1">
                        <Award className="w-4 h-4" />
                        <span className="font-bold text-[10px] md:text-xs">Pendientes</span>
                        {pendingBonos.length > 0 && (
                            <Badge className="bg-amber-500 text-white border-none h-4 min-w-[16px] px-1 flex items-center justify-center animate-pulse text-[9px] ml-0.5">
                                {pendingBonos.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="historial" className="data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 h-full md:px-6">
                        <History className="w-4 h-4 mr-1.5 md:mr-2" />
                        <span className="font-bold text-[10px] md:text-xs">Historial</span>
                        <span className="hidden lg:inline text-xs ml-1">de Bonos</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="configuracion" className="space-y-6">
                    {/* Resumen de Cumplimiento */}
                    <div className="kpi-grid md:grid-cols-4">
                        <div className="kpi-card group">
                            <div className="kpi-card-icon">
                                <Target className="w-16 h-16 text-white" />
                            </div>
                            <p className="kpi-label">Metas Activas</p>
                            <h3 className="kpi-value">{activeMetasTotal}</h3>
                        </div>
                        <div className="kpi-card group hover:border-emerald-500/30">
                            <div className="kpi-card-icon">
                                <Percent className="w-16 h-16 text-emerald-500" />
                            </div>
                            <p className="kpi-label">Aprobados Mes</p>
                            <h3 className="kpi-value text-emerald-400">
                                S/ {pendingBonos.filter(b => b.estado === 'aprobado').reduce((acc, b) => acc + (b.monto || 0), 0).toLocaleString()}
                            </h3>
                        </div>
                        <div className="kpi-card group hover:border-amber-500/30">
                            <div className="kpi-card-icon">
                                <Award className="w-16 h-16 text-amber-500" />
                            </div>
                            <p className="kpi-label">Pendientes Revisión</p>
                            <h3 className="kpi-value text-amber-500">{pendingBonos.length}</h3>
                        </div>
                        <div className="kpi-card group hover:border-rose-500/30">
                            <div className="kpi-card-icon">
                                <ShieldAlert className="w-16 h-16 text-rose-500" />
                            </div>
                            <p className="kpi-label">Metas Inactivas</p>
                            <h3 className="kpi-value text-rose-400">{countInactivas}</h3>
                        </div>
                    </div>

                    {/* Title for Card Grid */}
                    <div className="mt-6 mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                <Users className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="font-bold text-lg text-white leading-tight">Listado por Usuario</h2>
                                <p className="text-[10px] text-slate-400 font-medium tracking-wide">Desglose de metas y objetivos individuales</p>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-slate-800 rounded-3xl bg-slate-900/50 shadow-2xl">
                            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                            <p className="font-bold text-slate-400 animate-pulse text-lg">Cargando metas...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {usersList.map(({ user, metas: userMetas }) => (
                                <div key={user.nombre_completo} className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col group hover:border-slate-700 hover:shadow-blue-500/5 transition-all duration-300">
                                    <div className="p-4 border-b border-slate-800 bg-slate-950/40 relative overflow-hidden">
                                        <div className="flex items-center gap-3 relative z-10">
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg border-2 shadow-lg shrink-0 bg-blue-600/20 text-blue-400 border-blue-500/30">
                                                {user.nombre_completo?.charAt(0) || '?'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-bold text-white text-base truncate">{user.nombre_completo}</h3>
                                                <Badge variant="outline" className="text-[8px] uppercase tracking-widest text-blue-400 border-blue-500/30 mt-1">
                                                    {user.rol || 'Asesor'}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 bg-slate-950/20">
                                        <Tabs defaultValue="activas" className="w-full">
                                            <TabsList className="grid grid-cols-2 mb-3 bg-slate-950/50 border border-slate-800/50 p-1 rounded-xl h-9">
                                                <TabsTrigger value="activas" className="text-[10px] font-bold">Activas</TabsTrigger>
                                                <TabsTrigger value="desactivadas" className="text-[10px] font-bold">Inactivas</TabsTrigger>
                                            </TabsList>
                                            
                                            <TabsContent value="activas" className="space-y-2 mt-0">
                                                {userMetas.filter(m => checkIsActive(m)).length === 0 ? (
                                                    <div className="py-2 text-center border border-dashed border-slate-800 rounded-xl">
                                                        <p className="text-[10px] text-slate-500 italic">Sin metas activas</p>
                                                    </div>
                                                ) : (
                                                    userMetas.filter(m => checkIsActive(m)).map(meta => (
                                                        <div key={meta.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col gap-2 relative group/item">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-bold uppercase text-slate-500">{meta.periodo}</span>
                                                                    <span className="text-[10px] text-slate-700">•</span>
                                                                    <span className="text-[9px] text-slate-500 italic">
                                                                        {meta.periodo === 'diario' ? 'Abono: Hoy' : 
                                                                         meta.periodo === 'semanal' ? 'Abono: Próx. Sábado' : 
                                                                         'Abono: Últ. día hábil'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                                    <button onClick={() => { setMetaToEdit(meta); setShowCreate(true); }} className="p-1 hover:bg-blue-600/20 rounded-md text-blue-400"><Pencil className="w-3 h-3" /></button>
                                                                    <button onClick={() => setMetaToDeactivate(meta)} className="p-1 hover:bg-rose-600/20 rounded-md text-rose-400"><Trash2 className="w-3 h-3" /></button>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-between items-end">
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-200 uppercase tracking-tighter">
                                                                        {meta.meta_cobro ? 'Cobranza (%)' : 
                                                                         meta.meta_recaudacion_total ? 'Recaudación Total (S/)' :
                                                                         meta.meta_retencion_clientes ? 'Retención' : 
                                                                         meta.meta_colocacion_clientes ? 'Coloc. x Cliente' : 
                                                                         meta.meta_colocacion ? 'Colocación' :
                                                                         meta.meta_morosidad_max ? 'Morosidad' :
                                                                         meta.escalones_mora ? 'Morosidad (Escalones)' :
                                                                         meta.meta_cantidad_clientes ? 'Clientes Nuevos' :
                                                                         'General'}
                                                                    </p>
                                                                    <p className="text-[10px] text-slate-500">
                                                                        Bono: {meta.meta_colocacion_clientes ? 'S/ ' + (meta.bono_por_cliente || 0) + '/cli' : 
                                                                              meta.escalones_mora ? 'Variable' : 
                                                                              'S/ ' + (meta.bono_monto || 0)}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-xs font-black text-blue-400">
                                                                        {meta.meta_cobro ? meta.meta_cobro + '%' : 
                                                                         meta.meta_recaudacion_total ? 'S/ ' + meta.meta_recaudacion_total :
                                                                         meta.meta_retencion_clientes ? meta.meta_retencion_clientes + ' cli' : 
                                                                         meta.meta_cantidad_clientes ? meta.meta_cantidad_clientes + ' cli' :
                                                                         meta.meta_colocacion ? 'S/ ' + meta.meta_colocacion :
                                                                         meta.meta_morosidad_max ? meta.meta_morosidad_max + '%' :
                                                                         meta.escalones_mora ? 'Escalones' :
                                                                         meta.meta_capital_cartera ? 'S/ ' + meta.meta_capital_cartera :
                                                                         meta.meta_colocacion_clientes ? 'Variable' : '-'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </TabsContent>
                                            <TabsContent value="desactivadas" className="space-y-2 mt-0">
                                                {userMetas.filter(m => !checkIsActive(m)).length === 0 ? (
                                                    <div className="py-2 text-center border border-dashed border-slate-800 rounded-xl">
                                                        <p className="text-[10px] text-slate-500 italic">No hay metas inactivas</p>
                                                    </div>
                                                ) : (
                                                    userMetas.filter(m => !checkIsActive(m)).map(meta => (
                                                        <div key={meta.id} className="p-3 rounded-xl border border-slate-800/50 bg-slate-900/30 flex flex-col gap-2 relative group/item opacity-60">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-bold uppercase text-slate-500">{meta.periodo}</span>
                                                                <button onClick={() => handleReactivateMeta(meta.id)} className="p-1 hover:bg-emerald-600/20 rounded-md text-emerald-400 opacity-0 group-hover/item:opacity-100"><Plus className="w-3 h-3" /></button>
                                                            </div>
                                                            <div className="flex justify-between items-end">
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-500">
                                                                        {meta.meta_cobro ? 'Cobranza' : meta.meta_retencion_clientes ? 'Retención' : meta.meta_colocacion_clientes ? 'Coloc. x Cliente' : 'General'}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-xs font-black text-slate-600">INACTIVA</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </TabsContent>
                                        </Tabs>
                                    </div>
                                    <div className="px-5 py-2.5 bg-slate-950/60 border-t border-slate-800/80 mt-auto">
                                        <button onClick={() => { setMetaToEdit(null); setShowCreate(true); }} className="w-full py-1.5 flex items-center justify-center gap-2 text-[9px] font-bold text-slate-500 hover:text-blue-400 transition-colors">
                                            <Plus className="w-3 h-3" /> Añadir Meta
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="liquidaciones" className="space-y-6">
                    {loadingBonos ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-slate-800 rounded-3xl bg-slate-900/50 shadow-2xl">
                            <Loader2 className="w-12 h-12 animate-spin text-amber-500" />
                            <p className="font-bold text-slate-400 animate-pulse text-lg">Cargando liquidaciones...</p>
                        </div>
                    ) : pendingBonos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 border border-slate-800 border-dashed rounded-3xl bg-slate-900/50">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-2">
                                <Award className="w-8 h-8 text-slate-700" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-400">Sin liquidaciones pendientes</h3>
                            <p className="text-sm text-slate-600 max-w-xs text-center px-4">El sistema agregará los bonos aquí al finalizar el periodo de cada asesor.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingBonos.map((bono) => (
                                <Card key={bono.id} className="bg-slate-900/40 border-slate-800 overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
                                    <div className="p-4 flex flex-col gap-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                                    <Award className="w-5 h-5 text-amber-500" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-sm leading-tight">{bono.perfiles?.nombre_completo}</h3>
                                                    <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">
                                                        Meta: <span className="text-amber-400/80">
                                                            {bono.metas_asesores?.meta_cobro ? 'COBRANZA' : 
                                                             bono.metas_asesores?.meta_retencion_clientes ? 'RETENCIÓN' : 
                                                             bono.metas_asesores?.meta_colocacion_clientes ? 'COLOC. X CLIENTE' : 
                                                             bono.metas_asesores?.meta_cantidad_clientes ? 'CLIENTES NUEVOS' : 
                                                             bono.metas_asesores?.meta_colocacion ? 'COLOCACIÓN' : 'GESTIÓN'} 
                                                            ({bono.metas_asesores?.periodo})
                                                        </span> | {format(new Date(bono.created_at), 'dd MMM HH:mm', { locale: es })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-black text-emerald-400">S/ {Number(bono.monto).toLocaleString()}</p>
                                                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[8px] px-1.5 py-0">PENDIENTE</Badge>
                                            </div>
                                        </div>

                                        {/* Detalle del Cálculo (Transparencia) */}
                                        {bono.detalles_calculo && (
                                            <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/50 space-y-2">
                                                <div className="flex justify-between items-center text-[10px] font-bold border-b border-white/5 pb-1 mb-1">
                                                    <span className="text-slate-500">RESUMEN DE LOGRO</span>
                                                    <span className="text-blue-400/80">{bono.detalles_calculo.formula || 'Cálculo del Sistema'}</span>
                                                </div>
                                                
                                                {bono.detalles_calculo.statsVigentes ? (
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
                                                        <div className="flex justify-between items-center bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                                                            <span className="text-[8px] text-slate-500 uppercase">Cobro</span>
                                                            <span className="text-[10px] font-bold text-emerald-400">{bono.detalles_calculo.statsVigentes.porcentaje_cobro}%</span>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                                                            <span className="text-[8px] text-slate-500 uppercase">Mora</span>
                                                            <span className="text-[10px] font-bold text-rose-400">{Number(bono.detalles_calculo.statsVigentes.morosidad_actual).toFixed(1)}%</span>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                                                            <span className="text-[8px] text-slate-500 uppercase">Cartera</span>
                                                            <span className="text-[10px] font-bold text-blue-400">{bono.detalles_calculo.statsVigentes.clientes_en_cartera} cli</span>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-slate-900/40 p-1.5 rounded-lg border border-slate-800/50">
                                                            <span className="text-[8px] text-slate-500 uppercase">Nuevos</span>
                                                            <span className="text-[10px] font-bold text-amber-400">{bono.detalles_calculo.statsVigentes.nuevos_clientes} cli</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // Fallback para bonos antiguos/manuales
                                                    <div className="text-[9px] text-slate-500 italic px-2">Cálculo simplificado (pre-actualización)</div>
                                                )}

                                                {bono.detalles_calculo.statsVigentes?.hueco_calculado > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-white/5">
                                                        <p className="text-[9px] text-amber-500/80 font-bold px-2 flex items-center gap-1">
                                                            <AlertTriangle className="w-2.5 h-2.5" /> Hueco de retención detectado: {bono.detalles_calculo.statsVigentes.hueco_calculado} clientes por cubrir.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex gap-2 justify-end">
                                            <button 
                                                onClick={() => {
                                                    setBonoToReject(bono)
                                                    setShowRejectModal(true)
                                                }}
                                                className="flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold text-xs rounded-xl border border-rose-500/20 transition-all flex items-center justify-center gap-2"
                                            >
                                                Rechazar
                                            </button>
                                            <button 
                                                onClick={() => handleApproveBonus(bono.id, bono.monto, bono.asesor_id)}
                                                className="flex-[2] py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                Aprobar
                                            </button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="historial" className="space-y-6">
                    {loadingHistory ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-slate-800 rounded-3xl bg-slate-900/50 shadow-2xl">
                            <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                            <p className="font-bold text-slate-400 animate-pulse text-lg">Cargando historial...</p>
                        </div>
                    ) : historyBonos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 border border-slate-800 border-dashed rounded-3xl bg-slate-900/50">
                            <History className="w-12 h-12 text-slate-700" />
                            <h3 className="text-lg font-bold text-slate-400">Sin historial registrado</h3>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {historyBonos.map((h) => (
                                <div key={h.id} className="p-3 md:p-4 bg-slate-900/40 border border-slate-800 rounded-2xl md:rounded-3xl flex items-center justify-between group hover:border-slate-700 transition-all">
                                    <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 ${
                                            h.estado === 'aprobado' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                        }`}>
                                            {h.estado === 'aprobado' ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> : <X className="w-4 h-4 md:w-5 md:h-5" />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-white text-xs md:text-sm truncate">{h.perfiles?.nombre_completo}</h4>
                                            <p className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-tighter truncate">
                                                {h.metas_asesores?.meta_cobro ? 'Cobranza' : 
                                                 h.metas_asesores?.meta_recaudacion_total ? 'Recaudación' :
                                                 h.metas_asesores?.meta_retencion_clientes ? 'Retención' : 'Gestión'} 
                                                • {format(new Date(h.created_at), "dd MMM", { locale: es })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={`text-xs md:text-sm font-black ${h.estado === 'aprobado' ? 'text-emerald-400' : 'text-rose-400 line-through'}`}>
                                            S/ {Number(h.monto).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
            {/* Modal de Motivo de Rechazo */}
            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle>Rechazar Liquidación</DialogTitle>
                        <DialogDescription>
                            Explica el motivo por el cual estás rechazando este bono.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <textarea 
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Escribe el motivo del rechazo aquí..."
                            className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setShowRejectModal(false)}
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    handleRejectBonus(bonoToReject?.id, rejectReason)
                                    setShowRejectModal(false)
                                    setRejectReason('')
                                }}
                                className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl transition-all"
                            >
                                Confirmar Rechazo
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
