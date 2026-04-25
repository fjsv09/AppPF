'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table'
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { 
    CheckCircle, 
    XCircle, 
    Clock, 
    Eye, 
    AlertTriangle, 
    User, 
    History, 
    ListFilter, 
    Smartphone, 
    Landmark, 
    LayoutGrid, 
    Maximize2,
    Wallet,
    RotateCcw,
    ShieldAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { BackButton } from '@/components/ui/back-button'
import { cn } from '@/lib/utils'

function ValidacionPagosContent() {
    const [pagosPendientes, setPagosPendientes] = useState<any[]>([])
    const [historial, setHistorial] = useState<any[]>([])
    const [cuentas, setCuentas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [advisors, setAdvisors] = useState<any[]>([])
    const [selectedAsesor, setSelectedAsesor] = useState<string>('all')
    const [procesandoId, setProcesandoId] = useState<string | null>(null)
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const searchParams = useSearchParams()
    const router = useRouter()
    const tabParam = searchParams.get('tab')
    
    const [activeTab, setActiveTab] = useState(tabParam === 'historial' ? 'historial' : 'pendientes')
    
    // Paginación
    const [pagePendientes, setPagePendientes] = useState(1)
    const [pageHistorial, setPageHistorial] = useState(1)
    const [totalPendientes, setTotalPendientes] = useState(0)
    const [totalHistorial, setTotalHistorial] = useState(0)
    const ITEMS_PER_PAGE = 10
    
    // Modales
    const [showAprobarModal, setShowAprobarModal] = useState(false)
    const [showRechazarModal, setShowRechazarModal] = useState(false)
    const [pagoSeleccionado, setPagoSeleccionado] = useState<any>(null)
    
    // Estados de formulario
    const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string>('')
    const [motivoRechazo, setMotivoRechazo] = useState<string>('')

    const supabase = createClient()

    const fetchPagos = async (tipo: 'pendientes' | 'historial', currentUserId?: string, currentRole?: string, filterAsesor?: string, targetPage?: number) => {
        try {
            setLoading(true)
            
            const role = currentRole || userRole
            const uid = currentUserId || userId
            const asoFilter = filterAsesor !== undefined ? filterAsesor : selectedAsesor
            const page = targetPage || (tipo === 'pendientes' ? pagePendientes : pageHistorial)
            const offset = (page - 1) * ITEMS_PER_PAGE

            let query = supabase
                .from('pagos')
                .select(`
                    id,
                    monto_pagado,
                    metodo_pago,
                    voucher_url,
                    created_at,
                    estado_verificacion,
                    registrado_por,
                    perfiles ( nombre_completo ),
                    cronograma_cuotas (
                        numero_cuota,
                        prestamos ( 
                            id,
                            clientes ( nombres, telefono ) 
                        )
                    )
                `, { count: 'exact' })

            if (tipo === 'pendientes') {
                query = query.eq('estado_verificacion', 'pendiente')
            } else {
                query = query.in('estado_verificacion', ['aprobado', 'rechazado'])
            }

            // Solo mostrar validaciones de Yape
            query = query.eq('metodo_pago', 'Yape')

            // Aplicar restricciones de rol
            if (role === 'asesor' && uid) {
                query = query.eq('registrado_por', uid)
            } else if (asoFilter && asoFilter !== 'all') {
                query = query.eq('registrado_por', asoFilter)
            }

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(offset, offset + ITEMS_PER_PAGE - 1)

            if (error) throw error
            if (tipo === 'pendientes') {
                setPagosPendientes(data || [])
                setTotalPendientes(count || 0)
            } else {
                setHistorial(data || [])
                setTotalHistorial(count || 0)
            }
        } catch (error) {
            console.error(error)
            toast.error('Error al cargar pagos')
        } finally {
            setLoading(false)
        }
    }

    const fetchAdvisors = async () => {
        const { data } = await supabase
            .from('perfiles')
            .select('id, nombre_completo, rol')
            .in('rol', ['asesor', 'supervisor', 'admin', 'secretaria'])
            .order('nombre_completo')
        setAdvisors(data || [])
    }

    const fetchCuentas = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Obtener el rol del usuario para controlar visibilidad del saldo
        const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
        setUserRole(perfil?.rol || null)

        // 1. Intentar obtener cuentas compartidas específicamente con este usuario
        const { data: compartidas } = await supabase
            .from('cuentas_financieras')
            .select('id, nombre, saldo')
            .contains('usuarios_autorizados', [user.id])
            .or('nombre.ilike.%Digital%,nombre.ilike.%Cobranza%')
            .order('nombre')

        let dataToSet: any[] = []

        if (compartidas && compartidas.length > 0) {
            // Si hay cuentas compartidas, mostrar SOLO esas
            dataToSet = compartidas
            setCuentas(compartidas)
        } else {
            // 2. Si no hay compartidas, mostrar SOLO las cuentas de tipo 'digital'
            // Esto evita que salgan todas las de 'cobranzas' de los asesores por defecto
            const { data: todasDigitales } = await supabase
                .from('cuentas_financieras')
                .select('id, nombre, saldo')
                .eq('tipo', 'digital')
                .order('nombre')
            dataToSet = todasDigitales || []
            setCuentas(todasDigitales || [])
        }

        // Priorizar "Digital Cobranza" o cualquier cuenta que diga "Cobranza"
        const digitalCobranza = dataToSet?.find(c => c.nombre.toLowerCase().includes('cobranza'))
        if (digitalCobranza) setCuentaSeleccionada(digitalCobranza.id)
        else if (dataToSet && dataToSet.length > 0) setCuentaSeleccionada(dataToSet[0].id)
    }

    useEffect(() => {
        document.title = "Validación de Pagos | ProFinanzas"
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setUserId(user.id)
                const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
                const role = perfil?.rol || 'asesor'
                setUserRole(role)
                
                fetchPagos('pendientes', user.id, role)
                fetchPagos('historial', user.id, role)
                fetchAdvisors()
            }
            fetchCuentas()
        }

        init()

        const channel = supabase.channel('pagos_realtime_v4')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => {
                fetchPagos('pendientes')
                fetchPagos('historial')
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [supabase])

    useEffect(() => {
        if (userRole && userId) {
            setPagePendientes(1)
            setPageHistorial(1)
            fetchPagos('pendientes', userId, userRole, selectedAsesor, 1)
            fetchPagos('historial', userId, userRole, selectedAsesor, 1)
        }
    }, [selectedAsesor])

    useEffect(() => {
        if (userRole && userId) {
            fetchPagos('pendientes')
        }
    }, [pagePendientes])

    useEffect(() => {
        if (userRole && userId) {
            fetchPagos('historial')
        }
    }, [pageHistorial])

    const handleAccion = async (pagoId: string, accion: 'aprobar' | 'rechazar', params: any = {}) => {
        const { motivo, cuenta_id } = params
        
        setProcesandoId(pagoId)
        try {
            const response = await fetch('/api/admin/validar-pago', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pago_id: pagoId, accion, motivo, cuenta_id })
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.error)
            toast.success(data.message)
            setShowAprobarModal(false)
            setShowRechazarModal(false)
            setMotivoRechazo('')
            
            // Refrescar las listas inmediatamente
            fetchPagos('pendientes')
            fetchPagos('historial')
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setProcesandoId(null)
        }
    }

    const openAprobarModal = (pago: any) => {
        setPagoSeleccionado(pago)
        setShowAprobarModal(true)
    }

    const openRechazarModal = (pago: any) => {
        setPagoSeleccionado(pago)
        setShowRechazarModal(true)
    }

    // Render Table Row (Desktop)
    const renderRow = (pago: any, isHistory: boolean = false) => {
        const cliente = pago.cronograma_cuotas?.prestamos?.clientes
        const asesorNom = pago.perfiles?.nombre_completo || 'Desconocido'
        const isProcessing = (procesandoId === pago.id)

        return (
            <TableRow key={pago.id} className="hover:bg-slate-900/40 border-slate-800/50 transition-colors group">
                <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-white font-bold text-xs">{format(new Date(pago.created_at), "dd/MM")}</span>
                        <span className="text-slate-500 text-[11px] font-medium">{format(new Date(pago.created_at), "HH:mm")}</span>
                    </div>
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        <Badge className={cn(
                            "uppercase text-[9px] font-black h-5",
                            pago.metodo_pago === 'Efectivo' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        )}>
                            {pago.metodo_pago}
                        </Badge>
                        {isHistory && (
                            <Badge className={cn(
                                "uppercase text-[9px] font-black h-5",
                                pago.estado_verificacion === 'aprobado' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                            )}>
                                {pago.estado_verificacion}
                            </Badge>
                        )}
                    </div>
                </TableCell>
                <TableCell>
                    <div className="flex flex-col">
                        <span className="text-slate-200 font-bold text-xs truncate max-w-[150px] uppercase">{cliente?.nombres}</span>
                        <span className="text-slate-500 text-[9px] font-bold uppercase tracking-widest leading-tight">Cuota #{pago.cronograma_cuotas?.numero_cuota}</span>
                    </div>
                </TableCell>
                <TableCell>
                    <span className="text-white font-black text-sm tabular-nums whitespace-nowrap">S/ {parseFloat(pago.monto_pagado).toFixed(2)}</span>
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-slate-800 rounded flex items-center justify-center border border-slate-700/50">
                            <User className="w-2.5 h-2.5 text-slate-400" />
                        </div>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter truncate max-w-[90px]">{asesorNom}</span>
                    </div>
                </TableCell>
                <TableCell>
                    {pago.voucher_url ? (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 bg-slate-800/40 hover:bg-white hover:text-black rounded-lg transition-all"
                            onClick={() => setSelectedImage(pago.voucher_url)}
                        >
                            <Eye className="w-4 h-4" />
                        </Button>
                    ) : (
                        <div className="w-8 h-8 flex items-center justify-center text-slate-700">
                            <AlertTriangle className="w-4 h-4" />
                        </div>
                    )}
                </TableCell>
                {!isHistory && userRole === 'admin' && (
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <Button 
                                variant="outline" 
                                size="sm"
                                className="h-8 border-slate-800 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 font-bold uppercase text-[9px] px-3 rounded-lg"
                                onClick={() => openRechazarModal(pago)}
                                disabled={isProcessing}
                            >
                                {isProcessing && procesandoId === pago.id ? <div className="w-3 h-3 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /> : 'Rechazar'}
                            </Button>
                            <Button 
                                size="sm"
                                className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-[9px] px-3 rounded-lg"
                                onClick={() => openAprobarModal(pago)}
                                disabled={isProcessing}
                            >
                                {isProcessing && procesandoId === pago.id ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Aprobar'}
                            </Button>
                        </div>
                    </TableCell>
                )}
            </TableRow>
        )
    }

    // Render Card (Mobile)
    const renderCard = (pago: any, isHistory: boolean = false) => {
        const cliente = pago.cronograma_cuotas?.prestamos?.clientes
        const asesorNom = pago.perfiles?.nombre_completo || 'Desconocido'
        const isProcessing = (procesandoId === pago.id)

        return (
            <Card key={pago.id} className="bg-slate-900/40 border-slate-800/60 backdrop-blur-md rounded-3xl overflow-hidden flex flex-col md:hidden shadow-xl">
                <div className="p-4 bg-slate-950/40 flex justify-between items-center border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                        <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 uppercase text-[9px] font-black h-5">{pago.metodo_pago}</Badge>
                        {isHistory && (
                            <Badge className={cn("uppercase text-[9px] font-black h-5", pago.estado_verificacion === 'aprobado' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                                {pago.estado_verificacion}
                            </Badge>
                        )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{format(new Date(pago.created_at), "d MMM, h:mm a", { locale: es })}</span>
                </div>
                <CardContent className="p-5 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Cliente</p>
                            <h3 className="text-slate-100 font-bold uppercase text-sm leading-tight">{cliente?.nombres}</h3>
                            <p className="text-slate-500 text-[10px] font-bold uppercase mt-0.5">Cuota #{pago.cronograma_cuotas?.numero_cuota}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Monto</p>
                            <p className="text-white font-black text-xl leading-none">S/ {parseFloat(pago.monto_pagado).toFixed(2)}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between gap-4 p-3 bg-slate-950/30 rounded-2xl border border-slate-800/50">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-[7px] text-slate-500 uppercase font-black tracking-widest">Enviado por</p>
                                <p className="text-[10px] text-slate-300 font-bold uppercase">{asesorNom}</p>
                            </div>
                        </div>
                        {pago.voucher_url && (
                             <Button size="sm" variant="ghost" className="h-8 w-8 p-0 bg-slate-800/50 text-white rounded-full" onClick={() => setSelectedImage(pago.voucher_url)}>
                                <Eye className="w-4 h-4" />
                             </Button>
                        )}
                    </div>

                    {!isHistory && userRole === 'admin' && (
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <Button variant="outline" className="h-10 rounded-2xl border-slate-800 text-rose-400 font-black uppercase text-[10px] tracking-widest" onClick={() => openRechazarModal(pago)} disabled={isProcessing}>
                                {isProcessing && procesandoId === pago.id ? <div className="w-3 h-3 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /> : 'Rechazar'}
                            </Button>
                            <Button className="h-10 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest border-none" onClick={() => openAprobarModal(pago)} disabled={isProcessing}>
                                {isProcessing && procesandoId === pago.id ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'Aprobar'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="page-container max-w-7xl mx-auto px-4 sm:px-6">
            <div className="page-header border-b-0 pb-2">
                <div className="flex items-center gap-4">
                    <BackButton />
                    <div>
                        <h1 className="page-title flex items-center gap-3">
                            Validación de Pagos
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] font-black h-5 uppercase tracking-tighter">
                                {pagosPendientes.length} Pendientes
                            </Badge>
                        </h1>
                        <p className="page-subtitle font-medium">Gestión de recaudación digital</p>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} className="w-full" onValueChange={(val) => {
                setActiveTab(val)
                const params = new URLSearchParams(searchParams.toString())
                params.set('tab', val)
                router.replace(`?${params.toString()}`, { scroll: false })
            }}>
                <div className="flex items-center justify-between mb-6 bg-slate-900/30 p-1.5 rounded-2xl border border-slate-800/50 backdrop-blur-sm sticky top-0 z-40">
                    <TabsList className="bg-transparent gap-1">
                        <TabsTrigger value="pendientes" className="rounded-xl px-4 h-9 data-[state=active]:bg-indigo-600 data-[state=active]:text-white font-black uppercase text-[10px] tracking-widest transition-all">
                            <LayoutGrid className="w-3.5 h-3.5 mr-2" />
                            Pendientes
                        </TabsTrigger>
                        <TabsTrigger value="historial" className="rounded-xl px-4 h-9 data-[state=active]:bg-slate-700 data-[state=active]:text-white font-black uppercase text-[10px] tracking-widest transition-all">
                            <History className="w-3.5 h-3.5 mr-2" />
                            Historial
                        </TabsTrigger>
                    </TabsList>
                    <div className="px-3 flex items-center gap-3">
                        {userRole !== 'asesor' && (
                            <div className="flex items-center gap-2">
                                <Select value={selectedAsesor} onValueChange={setSelectedAsesor}>
                                    <SelectTrigger className="h-8 bg-slate-800/50 border-slate-700/50 rounded-lg font-bold uppercase text-[9px] w-[150px] text-slate-300">
                                        <SelectValue placeholder="Asesor..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800 text-white rounded-xl">
                                        <SelectItem value="all" className="font-bold uppercase text-[9px]">Todos los Asesores</SelectItem>
                                        {advisors.map(adv => (
                                            <SelectItem key={adv.id} value={adv.id} className="font-bold uppercase text-[9px]">
                                                {adv.nombre_completo}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-slate-500">
                            <ListFilter className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Recientes Primero</span>
                        </div>
                    </div>
                </div>

                <TabsContent value="pendientes">
                    {loading && activeTab === 'pendientes' ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" />
                        </div>
                    ) : pagosPendientes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 px-6 bg-slate-950/20 rounded-[2.5rem] border border-dashed border-slate-800/50">
                            <CheckCircle className="h-10 w-10 text-emerald-500/20 mb-4" />
                            <h3 className="text-xl font-black text-white tracking-tight uppercase">Bandeja Vacía</h3>
                            <p className="text-slate-500 text-center max-w-xs mt-2 text-sm font-medium">Todo ha sido validado satisfactoriamente.</p>
                        </div>
                    ) : (
                        <>
                            {/* Table (Desktop) */}
                            <div className="hidden md:block overflow-hidden rounded-3xl border border-slate-800/50 bg-slate-950/20">
                                <Table>
                                    <TableHeader className="bg-slate-900/50">
                                        <TableRow className="border-slate-800 hover:bg-transparent">
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[100px]">Fecha</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[120px]">Método</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Cliente</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[100px]">Monto</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Asesor</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[60px]">Doc.</TableHead>
                                            {!activeTab.includes('historial') && userRole === 'admin' && (
                                                <TableHead className="text-right text-slate-500 font-black uppercase text-[10px] tracking-widest">Acciones</TableHead>
                                            )}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pagosPendientes.map(pago => renderRow(pago))}
                                    </TableBody>
                                </Table>
                            </div>
                            {/* Cards (Mobile) */}
                            <div className="grid gap-4 md:hidden animate-in fade-in duration-500">
                                {pagosPendientes.map(pago => renderCard(pago))}
                            </div>

                            {/* Pagination Pendientes */}
                            <div className="mt-6 flex items-center justify-between bg-slate-900/30 p-4 rounded-2xl border border-slate-800/50">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    Mostrando {pagosPendientes.length} de {totalPendientes} resultados
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 border-slate-800 text-slate-400 hover:bg-slate-800 font-bold uppercase text-[9px] px-3 rounded-lg"
                                        disabled={pagePendientes === 1 || loading}
                                        onClick={() => setPagePendientes(prev => prev - 1)}
                                    >
                                        Anterior
                                    </Button>
                                    <span className="text-[10px] font-black text-white px-2">{pagePendientes}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 border-slate-800 text-slate-400 hover:bg-slate-800 font-bold uppercase text-[9px] px-3 rounded-lg"
                                        disabled={pagePendientes * ITEMS_PER_PAGE >= totalPendientes || loading}
                                        onClick={() => setPagePendientes(prev => prev + 1)}
                                    >
                                        Siguiente
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </TabsContent>

                <TabsContent value="historial">
                    {loading && activeTab === 'historial' ? (
                         <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-10 h-10 border-4 border-slate-800 border-t-slate-500 rounded-full animate-spin" />
                        </div>
                    ) : historial.length === 0 ? (
                        <div className="text-center py-20 text-slate-500 italic">No hay registros en el historial.</div>
                    ) : (
                        <>
                            {/* Table (Desktop) */}
                            <div className="hidden md:block overflow-hidden rounded-3xl border border-slate-800/50 bg-slate-950/20">
                                <Table>
                                    <TableHeader className="bg-slate-900/50">
                                        <TableRow className="border-slate-800 hover:bg-transparent">
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[100px]">Fecha</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[180px]">Estado / Método</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Cliente</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[100px]">Monto</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Asesor</TableHead>
                                            <TableHead className="text-slate-500 font-black uppercase text-[10px] tracking-widest w-[60px]">Doc.</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {historial.map(pago => renderRow(pago, true))}
                                    </TableBody>
                                </Table>
                            </div>
                            {/* Cards (Mobile) */}
                            <div className="grid gap-4 md:hidden animate-in fade-in duration-500">
                                {historial.map(pago => renderCard(pago, true))}
                            </div>

                            {/* Pagination Historial */}
                            <div className="mt-6 flex items-center justify-between bg-slate-900/30 p-4 rounded-2xl border border-slate-800/50">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    Mostrando {historial.length} de {totalHistorial} resultados
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 border-slate-800 text-slate-400 hover:bg-slate-800 font-bold uppercase text-[9px] px-3 rounded-lg"
                                        disabled={pageHistorial === 1 || loading}
                                        onClick={() => setPageHistorial(prev => prev - 1)}
                                    >
                                        Anterior
                                    </Button>
                                    <span className="text-[10px] font-black text-white px-2">{pageHistorial}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 border-slate-800 text-slate-400 hover:bg-slate-800 font-bold uppercase text-[9px] px-3 rounded-lg"
                                        disabled={pageHistorial * ITEMS_PER_PAGE >= totalHistorial || loading}
                                        onClick={() => setPageHistorial(prev => prev + 1)}
                                    >
                                        Siguiente
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </TabsContent>
            </Tabs>

            {/* Modal de Aprobación */}
            <Dialog open={showAprobarModal} onOpenChange={setShowAprobarModal}>
                <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-white rounded-3xl overflow-hidden p-0 shadow-2xl">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <CheckCircle className="w-6 h-6 text-emerald-500" />
                            Aprobar Validación
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/50">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3">Detalle del Pago</p>
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-slate-300 font-bold uppercase text-xs">{pagoSeleccionado?.cronograma_cuotas?.prestamos?.clientes?.nombres}</span>
                                <span className="text-white font-black text-xl">S/ {parseFloat(pagoSeleccionado?.monto_pagado || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase">
                                <Landmark className="w-3 h-3" />
                                Cuota #{pagoSeleccionado?.cronograma_cuotas?.numero_cuota} • {pagoSeleccionado?.metodo_pago}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] ml-1">Seleccionar Cuenta Destino</label>
                            <Select value={cuentaSeleccionada} onValueChange={setCuentaSeleccionada}>
                                <SelectTrigger className="h-12 bg-slate-950 border-slate-800 rounded-xl font-bold uppercase text-xs focus:ring-emerald-500/50">
                                    <SelectValue placeholder="Elegir cuenta..." />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-white rounded-xl z-[700]">
                                    {cuentas.map(cuenta => (
                                        <SelectItem key={cuenta.id} value={cuenta.id} className="font-bold uppercase text-[10px] py-3 focus:bg-indigo-600 focus:text-white rounded-lg cursor-pointer">
                                            <div className="flex items-center justify-between w-full">
                                                <span>{cuenta.nombre}</span>
                                                {userRole === 'admin' && (
                                                    <span className="text-[10px] opacity-50 ml-2">S/ {parseFloat(cuenta.saldo.toString()).toFixed(2)}</span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[9px] text-slate-500 italic ml-1">
                                El dinero será trasladado a la cuenta seleccionada.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="p-6 bg-slate-950/30 gap-3 sm:gap-0">
                        <Button 
                            variant="ghost" 
                            className="flex-1 h-12 rounded-xl text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:bg-slate-800"
                            onClick={() => setShowAprobarModal(false)}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-[10px] tracking-widest border-none shadow-lg shadow-emerald-900/20"
                            onClick={() => handleAccion(pagoSeleccionado?.id, 'aprobar', { cuenta_id: cuentaSeleccionada })}
                            disabled={!cuentaSeleccionada || (procesandoId === pagoSeleccionado?.id)}
                        >
                            {procesandoId === pagoSeleccionado?.id ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Confirmar Aprobación'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Rechazo */}
            <Dialog open={showRechazarModal} onOpenChange={setShowRechazarModal}>
                <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-white rounded-3xl overflow-hidden p-0 shadow-2xl">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <XCircle className="w-6 h-6 text-rose-500" />
                            Rechazar Pago Digital
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs font-medium mt-2">
                            Esta acción anulará el cobro y revertirá todos los saldos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        {/* Info Card de lo que sucederá */}
                        <div className="bg-rose-500/5 p-4 rounded-2xl border border-rose-500/20 space-y-3">
                            <div className="flex items-start gap-3">
                                <RotateCcw className="w-5 h-5 text-rose-400 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-rose-200 uppercase tracking-tight">Efectos del Rechazo:</p>
                                    <ul className="text-[10px] text-rose-300/70 space-y-1 mt-1 font-medium">
                                        <li>• La cuota volverá a estar pendiente de cobro.</li>
                                        <li>• Se restará el monto de la caja del asesor.</li>
                                        <li>• Se notificará al asesor sobre el motivo.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] ml-1">Motivo del Rechazo</label>
                            <Textarea 
                                placeholder="Ej: Voucher ilegible, Monto no coincide en Yape, etc..."
                                className="bg-slate-950 border-slate-800 rounded-xl font-medium text-sm focus:ring-rose-500/50 min-h-[100px] resize-none"
                                value={motivoRechazo}
                                onChange={(e) => setMotivoRechazo(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter className="p-6 bg-slate-950/30 gap-3 sm:gap-0">
                        <Button 
                            variant="ghost" 
                            className="flex-1 h-12 rounded-xl text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:bg-slate-800"
                            onClick={() => {
                                setShowRechazarModal(false)
                                setMotivoRechazo('')
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            className="flex-1 h-12 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold uppercase text-[10px] tracking-widest border-none shadow-lg shadow-rose-900/20"
                            onClick={() => handleAccion(pagoSeleccionado?.id, 'rechazar', { motivo: motivoRechazo })}
                            disabled={!motivoRechazo || (procesandoId === pagoSeleccionado?.id)}
                        >
                            {procesandoId === pagoSeleccionado?.id ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Anular Pago'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Image Expansion Modal */}
            <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
                <DialogContent className="max-w-xl sm:max-w-3xl bg-slate-950/95 border-slate-800/50 p-0 overflow-hidden rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                    <div className="relative flex items-center justify-center bg-black min-h-[40vh] max-h-[90vh]">
                        {selectedImage && <img src={selectedImage} alt="Voucher Full" className="max-w-full max-h-[90vh] object-contain animate-in zoom-in-95 duration-300" />}
                        <Button variant="ghost" size="icon" className="absolute top-4 right-4 bg-black/50 text-white hover:bg-white hover:text-black rounded-full" onClick={() => setSelectedImage(null)}>
                            <XCircle className="w-6 h-6" />
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="h-24 sm:hidden" />
        </div>
    )
}

export default function ValidacionPagosPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        }>
            <ValidacionPagosContent />
        </Suspense>
    )
}
