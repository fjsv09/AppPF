'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClientDetailDrawer } from '@/components/clientes/client-detail-drawer'
import { Users, Search, Phone, ChevronLeft, ChevronRight, Calendar, Loader2, Link as LinkIcon, Eye, Download, CheckSquare, Square, ChevronDown, Trash2, CalendarHeart, HandCoins, ExternalLink, ListFilter, MoreVertical, MessageCircle, MapPin, X, Map, ShieldCheck, Receipt, Lock, Unlock } from 'lucide-react'
import { cn } from "@/lib/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import dynamic from 'next/dynamic'
import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { ClientEditModal } from './client-edit-modal'
import { RegistrarGestionModal } from '../gestiones/registrar-gestion-modal'
import { Edit, MessageSquare, DollarSign } from 'lucide-react'
import { QuickPayModal } from '../prestamos/quick-pay-modal'
import { BulkImportModal } from './bulk-import-modal'
import { FileUp } from 'lucide-react'

const ClientesMapa = dynamic(() => import('./clientes-mapa'), { 
    ssr: false,
    loading: () => <div className="h-[500px] w-full rounded-2xl bg-slate-900 border border-slate-800 animate-pulse flex items-center justify-center text-slate-500">Cargando mapa interactivo...</div>
})
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ShieldAlert, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'

const TableSkeleton = () => (
    <div className="animate-pulse space-y-4 p-4">
        {/* Mobile Skeleton */}
        <div className="md:hidden space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-32 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-800/10 to-transparent skew-x-12 animate-shimmer" />
                    <div className="flex gap-4">
                        <div className="h-10 w-10 bg-slate-800 rounded-xl" />
                        <div className="space-y-2 flex-1">
                            <div className="h-4 w-3/4 bg-slate-800 rounded" />
                            <div className="h-3 w-1/2 bg-slate-800 rounded" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
        
        {/* Desktop Skeleton */}
        <div className="hidden md:block space-y-4">
             <div className="flex gap-4 border-b border-slate-800/50 pb-4">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-4 bg-slate-800 rounded flex-1 opacity-50" />)}
             </div>
             {[1,2,3,4,5,6,7,8].map((i) => (
                <div key={i} className="flex gap-4 items-center py-3 border-b border-slate-800/30">
                    <div className="h-10 w-10 rounded-xl bg-slate-800" />
                    <div className="h-4 w-48 bg-slate-800 rounded" />
                    <div className="h-4 flex-1 bg-slate-800 rounded opacity-50" />
                    <div className="h-6 w-20 bg-slate-800 rounded-full" />
                </div>
             ))}
        </div>
    </div>
)

interface ClientDirectoryProps {
    clientes: any[]
    perfiles?: any[] 
    userRol?: 'admin' | 'supervisor' | 'asesor'
    userId?: string
}

type FilterTab = 'todos' | 'activos' | 'con_deuda' | 'sin_prestamos' | 'inactivos' | 'al_dia' | 'mora' | 'recaptables' | 'reasignados' | 'recibos' | 'bloqueados'

const ITEMS_PER_PAGE = 10

const formatMoney = (value: number): string => {
    return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function ClientDirectory({ clientes, perfiles = [], userRol = 'asesor', userId = '' }: ClientDirectoryProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    // 1. Get Filters from URL
    const activeFilter = (searchParams.get('tab') as FilterTab) || 'todos'
    const searchQuery = searchParams.get('q') || ''
    const filtroSupervisor = searchParams.get('supervisor') || 'todos'
    const filtroAsesor = searchParams.get('asesor') || 'todos'
    const filtroSector = searchParams.get('sector') || 'todos'
    const currentPage = Number(searchParams.get('page')) || 1

    // 2. Local state
    const [localSearch, setLocalSearch] = useState(searchQuery)
    const [fechaFiltro, setFechaFiltro] = useState<string>('')
    const [selectedClients, setSelectedClients] = useState<string[]>([]) // For bulk actions
    const [showMap, setShowMap] = useState<boolean>(false)
    
    // Asignacion masiva
    const [isReasignModalOpen, setIsReasignModalOpen] = useState(false)
    const [selectedNewAsesor, setSelectedNewAsesor] = useState<string>('')
    const [isReassigning, setIsReassigning] = useState(false)
    
    // Quick Pay


    // Exception Toggle Confirmation State
    const [confirmExcepcionOpen, setConfirmExcepcionOpen] = useState(false)
    const [pendingExcepcionClient, setPendingExcepcionClient] = useState<any>(null)

    // Edit Confirmation State
    const [confirmEditOpen, setConfirmEditOpen] = useState(false)
    const [pendingEditClient, setPendingEditClient] = useState<any>(null)

    // Edit Modal State
    const [editingCliente, setEditingCliente] = useState<any>(null)

    // Registrar Gestión State
    const [gestionOpen, setGestionOpen] = useState(false)
    const [selectedClientForGestion, setSelectedClientForGestion] = useState<any>(null)

    // Import Modal State
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)

    // Block/Unblock State
    const [confirmBlockOpen, setConfirmBlockOpen] = useState(false)
    const [pendingBlockClient, setPendingBlockClient] = useState<any>(null)

    const handleOpenGestion = (cliente: any, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }
        setSelectedClientForGestion(cliente)
        setGestionOpen(true)
    }



    const handleToggleExcepcion = (cliente: any, e: React.MouseEvent) => {
        e.stopPropagation()
        if (userRol !== 'admin') return
        setPendingExcepcionClient(cliente)
        setConfirmExcepcionOpen(true)
    }

    const processToggleExcepcion = async () => {
        if (!pendingExcepcionClient) return

        const currentStatus = !!pendingExcepcionClient.excepcion_voucher
        const newStatus = !currentStatus
        
        try {
            const response = await fetch('/api/clientes/toggle-excepcion', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: pendingExcepcionClient.id,
                    excepcion_voucher: newStatus
                })
            })

            if (!response.ok) throw new Error('Error al actualizar')
            
            toast.success(newStatus ? 'Cliente exonerado de recibos' : 'Cliente ahora requiere recibos')
            router.refresh()
        } catch (error) {
            toast.error('No se pudo actualizar el estado de excepción')
        } finally {
            setConfirmExcepcionOpen(false)
            setPendingExcepcionClient(null)
        }
    }

    const processToggleBlock = async () => {
        if (!pendingBlockClient) return
        
        const isBlocked = !!pendingBlockClient.bloqueado_renovacion
        const action = isBlocked ? 'unblock' : 'block'
        
        try {
            const response = await fetch('/api/clientes/bloquear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cliente_id: pendingBlockClient.id,
                    action
                })
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Error al actualizar')
            
            toast.success(action === 'block' ? 'Cliente bloqueado para renovar' : 'Cliente desbloqueado')
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al bloquear o desbloquear cliente')
        } finally {
            setConfirmBlockOpen(false)
            setPendingBlockClient(null)
        }
    }

    // 3. Helper to update URL
    const updateParams = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(updates).forEach(([key, value]) => {
            if (value === null) params.delete(key)
            else params.set(key, value)
        })
        
        startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        })
    }

    // 4. Sync local search with URL
    useEffect(() => {
        setLocalSearch(searchQuery)
    }, [searchQuery])

    // Debounce Search Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchQuery) {
                updateParams({ q: localSearch || null, page: '1' })
            }
        }, 600)
        return () => clearTimeout(timer)
    }, [localSearch, searchQuery])

    // Supervisores for Admin
    const supervisores = useMemo(() => {
        return perfiles.filter(p => p.rol === 'supervisor')
    }, [perfiles])

    // Asesores Filtered
    const asesores = useMemo(() => {
        if (filtroSupervisor !== 'todos') {
            return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === filtroSupervisor)
        }
        if (userRol === 'supervisor') {
            return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === userId)
        }
        return perfiles.filter(p => p.rol === 'asesor')
    }, [perfiles, filtroSupervisor, userRol, userId])

    // Unique Sectors
    const sectoresList = useMemo(() => {
        const unique = new globalThis.Map<string, string>()
        clientes.forEach(c => {
            if (c.sector_id && c.sectores?.nombre) {
                unique.set(c.sector_id, c.sectores.nombre)
            }
        })
        return Array.from(unique.entries()).map((entry) => {
            const [id, nombre] = entry as [string, string]
            return { id, nombre }
        }).sort((a, b) => a.nombre.localeCompare(b.nombre))
    }, [clientes])

    // Tabs logic
    const tabs = useMemo(() => [
        { id: 'todos' as FilterTab, label: 'Todos', count: clientes.length },
        { id: 'al_dia' as FilterTab, label: 'Al Día', count: clientes.filter(c => c.situacion === 'ok' || c.situacion === 'deuda').length },
        { id: 'mora' as FilterTab, label: 'En Mora', count: clientes.filter(c => ['cpp', 'moroso', 'vencido'].includes(c.situacion)).length },
        { id: 'recaptables' as FilterTab, label: 'Recaptables', count: clientes.filter(c => c.isRecaptable).length },
        { id: 'activos' as FilterTab, label: 'Activos', count: clientes.filter(c => c.estado === 'activo').length },
        { id: 'con_deuda' as FilterTab, label: 'Con Deuda', count: clientes.filter(c => c.stats.totalDebt > 0).length },
        { id: 'sin_prestamos' as FilterTab, label: 'Sin Préstamos', count: clientes.filter(c => c.stats.activeLoansCount === 0).length },
        { id: 'inactivos' as FilterTab, label: 'Inactivos', count: clientes.filter(c => c.estado !== 'activo').length },
        ...(userRol === 'admin' ? [{ id: 'reasignados' as FilterTab, label: 'Reasignados', count: clientes.filter(c => c.wasReassigned).length }] : []),
        ...((userRol === 'admin' || userRol === 'supervisor') ? [
            { id: 'recibos' as FilterTab, label: 'Control de Recibos', count: clientes.filter(c => c.stats.activeLoansCount > 0).length },
            { id: 'bloqueados' as FilterTab, label: 'Bloqueados', count: clientes.filter(c => !!c.bloqueado_renovacion).length }
        ] : []),
    ], [clientes, userRol])

    // Filtering logic
    const filteredClientes = useMemo(() => {
        let result = clientes

        // Supervisor
        if (userRol === 'admin' && filtroSupervisor !== 'todos') {
             const advisorIds = perfiles
                .filter(p => p.supervisor_id === filtroSupervisor)
                .map(p => p.id)
             result = result.filter(c => advisorIds.includes(c.asesor_id))
        }

        // Asesor
        if (filtroAsesor !== 'todos') {
            result = result.filter(c => c.asesor_id === filtroAsesor)
        }

        // Sector
        if (filtroSector !== 'todos') {
            result = result.filter(c => c.sector_id === filtroSector)
        }

        // Tabs
        switch (activeFilter) {
            case 'activos': result = result.filter(c => c.estado === 'activo'); break;
            case 'con_deuda': result = result.filter(c => c.stats.totalDebt > 0); break;
            case 'sin_prestamos': result = result.filter(c => c.stats.activeLoansCount === 0); break;
            case 'inactivos': result = result.filter(c => c.estado !== 'activo'); break;
            case 'al_dia': result = result.filter(c => c.situacion === 'ok' || c.situacion === 'deuda'); break;
            case 'mora': result = result.filter(c => ['cpp', 'moroso', 'vencido'].includes(c.situacion)); break;
            case 'recaptables': result = result.filter(c => c.isRecaptable); break;
            case 'reasignados': result = result.filter(c => c.wasReassigned); break;
            case 'recibos': result = result.filter(c => c.stats.activeLoansCount > 0); break;
            case 'bloqueados': result = result.filter(c => !!c.bloqueado_renovacion); break;
        }

        // Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            result = result.filter(c => 
                c.nombres?.toLowerCase().includes(query) ||
                c.dni?.includes(query) ||
                c.telefono?.includes(query) ||
                c.sectores?.nombre?.toLowerCase().includes(query)
            )
        }

        return result
    }, [clientes, activeFilter, searchQuery, filtroSupervisor, filtroAsesor, filtroSector, userRol, perfiles])

    // Pagination
    const totalPages = Math.ceil(filteredClientes.length / ITEMS_PER_PAGE)
    const paginatedClientes = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredClientes.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredClientes, currentPage])

    const totalDebt = filteredClientes.reduce((acc, c) => acc + (c.stats.totalDebt || 0), 0)

    const handleFilterChange = (val: string) => updateParams({ tab: val, page: '1' })
    const handleSupervisorChange = (val: string) => updateParams({ supervisor: val, page: '1' })
    const handleAsesorChange = (val: string) => updateParams({ asesor: val, page: '1' })
    const handleSectorChange = (val: string) => updateParams({ sector: val, page: '1' })
    const handlePageChange = (page: number) => updateParams({ page: String(page) })

    // Bulk Actions Logic
    const selectedClientsCurrentAsesorIds = useMemo(() => {
        return Array.from(new Set(
            clientes
                .filter(c => selectedClients.includes(c.id))
                .map(c => c.asesor_id)
        ))
    }, [clientes, selectedClients])

    const toggleSelectClient = (id: string) => {
        setSelectedClients(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    const toggleSelectAll = () => {
        if (selectedClients.length === paginatedClientes.length) {
            setSelectedClients([])
        } else {
            setSelectedClients(paginatedClientes.map(c => c.id))
        }
    }

    const handleReassignSubmit = async () => {
        if (!selectedNewAsesor) {
            toast.error("Seleccione un asesor destino")
            return
        }
        
        setIsReassigning(true)
        try {
            const response = await fetch('/api/admin/reasignar-clientes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientIds: selectedClients,
                    newAsesorId: selectedNewAsesor
                })
            })

            const result = await response.json()
                
            if (!response.ok) throw new Error(result.error || 'Error en la reasignación')
            
            toast.success(`Se han reasignado ${selectedClients.length} clientes exitosamente.`)
            setSelectedClients([])
            setIsReasignModalOpen(false)
            setSelectedNewAsesor('')
            
            // Actualización suave de datos del servidor
            router.refresh()
            
        } catch (error: any) {
            console.error("Error al reasignar", error)
            toast.error("Error al reasignar: " + error.message)
        } finally {
            setIsReassigning(false)
        }
    }

    return (
        <div className="space-y-4">
             {/* Header Actions (Export CSV, Bulk Reassign) - Only Admin */}
             {userRol === 'admin' && (
                <div className="flex justify-end gap-2 mb-2">
                    {selectedClients.length > 0 && userRol === 'admin' && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                            onClick={() => setIsReasignModalOpen(true)}
                        >
                            <Users className="w-4 h-4 mr-2" />
                            Reasignar ({selectedClients.length})
                        </Button>
                    )}
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="bg-slate-900 border-slate-700 text-blue-400 hover:text-blue-300 hover:bg-slate-800"
                        onClick={() => setIsImportModalOpen(true)}
                    >
                        <FileUp className="w-4 h-4 mr-2" />
                        Importar Lote
                    </Button>
                    <Button variant="outline" size="sm" className="bg-slate-900 border-slate-700 text-slate-300 hover:text-white">
                        <Download className="w-4 h-4 mr-2" />
                        Exportar CSV
                    </Button>
                </div>
             )}

             <BulkImportModal 
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={() => router.refresh()}
             />

             {/* Main Filter Bar - Responsive & Clean */}
             <div className="sticky top-0 z-30 flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 backdrop-blur-md mb-4 w-full">
                {/* Search */}
                <div className="relative w-full md:flex-1 md:max-w-none">
                    {isPending ? (
                         <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 animate-spin" />
                    ) : (
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    )}
                    <Input
                        placeholder="Buscar cliente (DNI, Nombre)..."
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        className={cn("h-10 pl-9 bg-slate-950/50 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:bg-slate-900 transition-colors w-full", isPending && "opacity-70 cursor-wait")}
                        disabled={isPending}
                    />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 md:pb-0 md:mb-0 w-full md:w-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                    {/* Status Filter */}
                    <div className="w-auto shrink-0">
                        <Select value={activeFilter} onValueChange={handleFilterChange}>
                            <SelectTrigger className={cn("h-10 w-auto min-w-[150px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3", isPending && "opacity-70 cursor-wait")}>
                                {isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin text-emerald-400" /> : <ListFilter className="w-3 h-3 mr-2 text-emerald-400 shrink-0" />}
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                {tabs.map((tab) => (
                                    <SelectItem key={tab.id} value={tab.id} className="focus:bg-slate-800 focus:text-white">
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <span>{tab.label}</span>
                                            <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-[10px] px-1.5 h-5 min-w-[1.25rem] flex items-center justify-center">
                                                {tab.count}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Map Toggle */}
                    <div className="w-auto shrink-0">
                        <Button
                            variant={showMap ? "default" : "outline"}
                            onClick={() => setShowMap(!showMap)}
                            className={cn(
                                "h-10 px-3 shrink-0 transition-colors",
                                showMap 
                                    ? "bg-blue-600 hover:bg-blue-700 text-white border-transparent" 
                                    : "bg-slate-950/50 border-slate-700 text-slate-300 hover:bg-slate-900"
                            )}
                            disabled={isPending}
                        >
                            <Map className={cn("w-4 h-4 mr-2", showMap ? "text-white" : "text-blue-400")} />
                            {showMap ? "Ocultar Mapa" : "Ver en Mapa"}
                        </Button>
                    </div>

                    {/* Supervisor Filter (Admin) */}
                    {userRol === 'admin' && supervisores.length > 0 && (
                        <div className="w-auto shrink-0">
                            <Select value={filtroSupervisor} onValueChange={handleSupervisorChange} disabled={isPending}>
                                <SelectTrigger className={cn("h-10 w-auto min-w-[150px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3", isPending && "opacity-70 cursor-wait")}>
                                    {isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin text-purple-400" /> : <Users className="w-3 h-3 mr-2 text-purple-400 shrink-0" />}
                                    <SelectValue placeholder="Supervisor" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="todos">Todos Supervisores</SelectItem>
                                    {supervisores.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Asesor Filter */}
                    {(userRol === 'admin' || userRol === 'supervisor') && asesores.length > 0 && (
                        <div className="w-auto shrink-0">
                            <Select value={filtroAsesor} onValueChange={handleAsesorChange} disabled={isPending}>
                                <SelectTrigger className={cn("h-10 w-auto min-w-[150px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3", isPending && "opacity-70 cursor-wait")}>
                                    {isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin text-blue-400" /> : <Users className="w-3 h-3 mr-2 text-blue-400 shrink-0" />}
                                    <SelectValue placeholder="Asesor" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="todos">Todos Asesores</SelectItem>
                                    {asesores.map(a => (
                                        <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Sector Filter */}
                    {sectoresList.length > 0 && (
                        <div className="w-auto shrink-0">
                            <Select value={filtroSector} onValueChange={handleSectorChange} disabled={isPending}>
                                <SelectTrigger className={cn("h-10 w-auto min-w-[150px] bg-slate-950/50 border-slate-700 text-xs text-slate-300 px-3", isPending && "opacity-70 cursor-wait")}>
                                    {isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin text-emerald-400" /> : <MapPin className="w-3 h-3 mr-2 text-emerald-400 shrink-0" />}
                                    <SelectValue placeholder="Sector" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700">
                                    <SelectItem value="todos">Todos Sectores</SelectItem>
                                    {sectoresList.map((s: {id: string, nombre: string}) => (
                                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Area (Map or Table) */}
            {showMap ? (
                <div className="w-full animate-in fade-in duration-300">
                    <ClientesMapa clientes={filteredClientes} />
                </div>
            ) : (
            <div className="md:bg-slate-900/50 md:border md:border-slate-800 md:rounded-2xl md:overflow-hidden bg-transparent border-0">
                
                {/* Desktop Header */}
                <div 
                    className="hidden md:grid gap-4 px-6 py-3 bg-slate-950/50 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold text-slate-500 items-center"
                    style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                >
                    {(userRol === 'admin') && (
                        <div className="col-span-1 flex justify-center">
                            <button onClick={toggleSelectAll} className="p-1 hover:text-white transition-colors">
                                {selectedClients.length > 0 && selectedClients.length === paginatedClientes.length ? <CheckSquare className="w-4 h-4 text-blue-500"/> : <Square className="w-4 h-4"/>}
                            </button>
                        </div>
                    )}
                    <div className={cn(
                        userRol === 'admin' ? "col-span-3" : 
                        userRol === 'supervisor' ? "col-span-4" : "col-span-5"
                    )}>Cliente</div>
                    <div className="col-span-2 text-left">Sector</div>
                    {(userRol === 'admin' || userRol === 'supervisor') && (
                        <div className="col-span-2 text-left">{activeFilter === 'reasignados' ? 'Procedencia' : 'Asesor'}</div>
                    )}
                    <div className="col-span-1 text-right">DNI</div>
                    <div className="col-span-1 text-right">Registro</div>
                    <div className="col-span-1 text-right">Teléfono</div>
                    <div className="col-span-1 text-right">Deuda Total</div>
                    <div className="col-span-1 text-center">Préstamos</div>
                    <div className={cn("col-span-1 text-center", userRol === 'asesor' && "col-span-2")}>Estado</div>
                    <div className="col-span-2 text-right">Acciones</div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-4 md:gap-0 md:block md:space-y-0 md:divide-y md:divide-slate-800/50">
                    {isPending ? (
                        <div className="p-0"><TableSkeleton /></div>
                    ) : (
                    <>
                    {paginatedClientes.map((cliente) => {
                         const asesorName = (userRol === 'admin' || userRol === 'supervisor') 
                            ? perfiles.find(p => p.id === cliente.asesor_id)?.nombre_completo 
                            : null
                         const isSelected = selectedClients.includes(cliente.id)

                         return (
                        <div key={cliente.id} className="contents group">
                            {/* Mobile Card View (< md) */}
                            <div className="md:hidden p-4 rounded-xl border border-slate-800 bg-slate-900/40 shadow-sm md:shadow-none hover:bg-slate-800/30 transition-colors border-l-4 border-l-slate-600 data-[debt=true]:border-l-amber-500" data-debt={cliente.stats.totalDebt > 0}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-start gap-3">
                                        {(userRol === 'admin') && (
                                            <div className="pt-1">
                                              <button onClick={() => toggleSelectClient(cliente.id)} className="p-1 text-slate-500 hover:text-white transition-colors -ml-1">
                                                  {isSelected ? <CheckSquare className="w-4 h-4 text-blue-500"/> : <Square className="w-4 h-4"/>}
                                              </button>
                                            </div>
                                        )}
                                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-700/50">
                                            {cliente.foto_perfil ? (
                                                <ImageLightbox 
                                                    src={cliente.foto_perfil} 
                                                    alt={cliente.nombres} 
                                                    className="w-full h-full" 
                                                    thumbnail={<img src={cliente.foto_perfil} alt={cliente.nombres} className="w-full h-full object-cover" />} 
                                                />
                                            ) : (
                                                <span className="text-sm font-bold text-slate-400">{cliente.nombres?.charAt(0)}</span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-slate-100 font-bold text-sm truncate max-w-[150px]">{cliente.nombres}</h3>
                                                {cliente.excepcion_voucher && (userRol === 'admin' || userRol === 'supervisor') && (
                                                    <Badge className="bg-purple-500/20 text-purple-400 text-[8px] h-4 px-1 border-purple-500/30">EXENTO</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] h-5 rounded-sm border-0 font-bold", 
                                                    cliente.situacion === 'vencido' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse" :
                                                    cliente.situacion === 'moroso' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : 
                                                    cliente.situacion === 'cpp' ? "bg-amber-500/20 text-orange-400 border border-amber-500/30" : 
                                                    cliente.situacion === 'deuda' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : 
                                                    cliente.situacion === 'ok' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : 
                                                    cliente.situacion === 'sin_deuda' ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                                                    "bg-slate-700/50 text-slate-400"
                                                )}>
                                                    {cliente.situacion === 'vencido' ? 'VENCIDO' :
                                                     cliente.situacion === 'moroso' ? 'MOROSO' :
                                                     cliente.situacion === 'cpp' ? 'CPP' :
                                                     cliente.situacion === 'deuda' ? 'DEUDA' :
                                                     cliente.situacion === 'ok' ? 'OK' :
                                                     cliente.situacion === 'sin_deuda' ? 'SIN DEUDA' :
                                                     cliente.estado?.toUpperCase()}
                                                </Badge>
                                                {cliente.sectores?.nombre && (
                                                    <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 font-medium truncate max-w-[80px]">
                                                        {cliente.sectores.nombre}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Deuda</div>
                                        <div className={cn("text-sm font-bold", cliente.stats.totalDebt > 0 ? "text-amber-400" : "text-slate-400")}>
                                            ${formatMoney(cliente.stats.totalDebt)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800/50">
                                    <Button size="sm" variant="outline" className="flex-1 bg-slate-900/40 border-slate-800 text-slate-400 h-8 hover:text-white px-0" onClick={() => window.open(`tel:${cliente.telefono}`)}>
                                        <Phone className="w-4 h-4 text-slate-500" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 bg-slate-900/40 border-slate-800 text-slate-400 h-8 hover:text-white px-0" onClick={() => window.open(`https://wa.me/${cliente.telefono}`, '_blank')}>
                                        <MessageCircle className="w-4 h-4 text-slate-500" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 bg-slate-900/40 border-slate-800 text-slate-400 h-8 hover:text-white px-0" onClick={() => handleOpenGestion(cliente)}>
                                        <MessageSquare className="w-4 h-4 text-slate-500" />
                                    </Button>
                                    {(cliente.gps_coordenadas && cliente.gps_coordenadas !== "null" || cliente.direccion) && (
                                        <Button size="sm" variant="outline" className="flex-1 bg-slate-900/40 border-slate-800 text-slate-400 h-8 hover:text-white px-0" onClick={() => {
                                            const coords = cliente.gps_coordenadas && cliente.gps_coordenadas !== "null" ? cliente.gps_coordenadas : null;
                                            const query = coords || cliente.direccion;
                                            if (query) {
                                                const url = coords 
                                                    ? `https://www.google.com/maps?q=${encodeURIComponent(coords)}`
                                                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                                                window.open(url, '_blank')
                                            }
                                        }}>
                                            <MapPin className="w-4 h-4 text-slate-500" />
                                        </Button>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="sm" variant="ghost" className="px-2 h-8 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-white hover:bg-slate-700 transition-all data-[state=open]:bg-slate-700">
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800 text-slate-200">
                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                            <DropdownMenuSeparator className="bg-slate-800" />
                                            {userRol === 'admin' && (
                                                <DropdownMenuItem 
                                                    onClick={(e) => handleToggleExcepcion(cliente, e)}
                                                    className={cn(
                                                        "cursor-pointer hover:bg-slate-800 focus:bg-slate-800",
                                                        cliente.excepcion_voucher ? "text-purple-400" : "text-emerald-400"
                                                    )}
                                                >
                                                    {cliente.excepcion_voucher ? <ShieldCheck className="w-4 h-4 mr-2" /> : <Receipt className="w-4 h-4 mr-2" />}
                                                    {cliente.excepcion_voucher ? "Requerir Recibos" : "Exonerar Recibos"}
                                                </DropdownMenuItem>
                                            )}
                                            {(userRol === 'admin' || (userRol === 'supervisor' && !cliente.bloqueado_renovacion)) && (
                                                <DropdownMenuItem 
                                                    onClick={() => {
                                                        setPendingBlockClient(cliente)
                                                        setConfirmBlockOpen(true)
                                                    }} 
                                                    className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800 text-amber-400"
                                                >
                                                    {cliente.bloqueado_renovacion ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />} 
                                                    {cliente.bloqueado_renovacion ? 'Desbloquear Renovación' : 'Bloquear Renovación'}
                                                </DropdownMenuItem>
                                            )}
                                            {(userRol === 'admin' || userRol === 'supervisor') && (
                                                <DropdownMenuItem 
                                                    onClick={() => {
                                                        setPendingEditClient(cliente)
                                                        setConfirmEditOpen(true)
                                                    }} 
                                                    className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800 text-blue-400"
                                                >
                                                    <Edit className="w-4 h-4 mr-2" /> Editar Datos
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem onClick={() => router.push(`?client=${cliente.id}`)} className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800">
                                                <Eye className="w-4 h-4 mr-2" /> Ver Detalle Rápido
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => router.push(`/dashboard/clientes/${cliente.id}`)} className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800">
                                                <Users className="w-4 h-4 mr-2" /> Ir a Perfil Completo
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {/* Desktop Row View (>= md) */}
                            <div 
                                className={cn(
                                    "hidden md:grid gap-4 px-6 py-4 items-center hover:bg-slate-800/30 transition-colors border-l-4",
                                    cliente.stats.totalDebt > 0 ? "border-l-amber-500" : "border-l-slate-700",
                                    isSelected && "bg-blue-900/10 border-l-blue-500"
                                )}
                                style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                            >
                                {(userRol === 'admin') && (
                                    <div className="col-span-1 flex justify-center">
                                        <button onClick={() => toggleSelectClient(cliente.id)} className="p-1 text-slate-500 hover:text-white transition-colors">
                                            {isSelected ? <CheckSquare className="w-4 h-4 text-blue-500"/> : <Square className="w-4 h-4"/>}
                                        </button>
                                    </div>
                                )}
                                
                                <div className={cn("flex items-center gap-3", 
                                    userRol === 'admin' ? "col-span-3" : 
                                    userRol === 'supervisor' ? "col-span-4" : "col-span-5"
                                )}>
                                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-700">
                                        {cliente.foto_perfil ? (
                                            <ImageLightbox src={cliente.foto_perfil} alt={cliente.nombres} className="w-full h-full" thumbnail={<img src={cliente.foto_perfil} alt={cliente.nombres} className="w-full h-full object-cover" />} />
                                        ) : (
                                            <span className="text-xs font-bold text-slate-400">{cliente.nombres?.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex flex-col justify-center">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-medium text-slate-200 truncate leading-tight">{cliente.nombres}</div>
                                            {cliente.excepcion_voucher && (userRol === 'admin' || userRol === 'supervisor') && (
                                                <Badge className="bg-purple-500/20 text-purple-400 text-[8px] h-4 px-1 border-purple-500/30 shrink-0">EXENTO</Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-2 min-w-0 flex items-center justify-start">
                                    {cliente.sectores?.nombre ? (
                                        <span className="text-[9px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 uppercase tracking-widest font-medium truncate">
                                            {cliente.sectores.nombre}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-slate-500 italic">No asignado</span>
                                    )}
                                </div>

                                {(userRol === 'admin' || userRol === 'supervisor') && (
                                    <div className="col-span-2 min-w-0 flex items-center gap-2">
                                        {activeFilter === 'reasignados' ? (
                                            <div className="flex flex-col">
                                                <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-blue-500/10 text-blue-400 border-blue-500/20 mb-0.5 w-fit">TRASLADADO</Badge>
                                                <span className="text-xs text-slate-300 truncate font-bold">Actual: {asesorName || 'N/A'}</span>
                                                {cliente.historial_reasignaciones_clientes?.length > 0 && (
                                                    <span className="text-[10px] text-slate-500 italic truncate">
                                                        De: {perfiles.find(p => p.id === cliente.historial_reasignaciones_clientes[cliente.historial_reasignaciones_clientes.length - 1].asesor_anterior_id)?.nombre_completo || 'Sistema'}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                <span className="text-sm text-slate-300 truncate">{asesorName || 'No asignado'}</span>
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="col-span-1 text-right">
                                    <div className="text-sm text-slate-300 font-mono">{cliente.dni}</div>
                                </div>
                                <div className="col-span-1 text-right">
                                    <div className="text-[11px] text-slate-400">{new Date(cliente.created_at).toLocaleDateString('es-PE')}</div>
                                </div>
                                <div className="col-span-1 text-right">
                                    <div className="text-xs text-slate-500">{cliente.telefono}</div>
                                </div>

                                <div className="col-span-1 text-right">
                                    <div className={cn("text-sm font-bold", cliente.stats.totalDebt > 0 ? "text-amber-400" : "text-slate-400")}>
                                        ${formatMoney(cliente.stats.totalDebt)}
                                    </div>

                                </div>

                                <div className="col-span-1 text-center">
                                    <Badge variant="outline" className="bg-slate-800 border-slate-700 text-slate-400">{cliente.stats.activeLoansCount}</Badge>
                                </div>

                                <div className={cn("col-span-1 text-center flex flex-col items-center", userRol === 'asesor' && "col-span-2")}>
                                    <Badge variant="outline" className={cn("border font-bold text-[10px] px-2 py-0.5", 
                                        cliente.situacion === 'vencido' ? "bg-rose-950/30 text-rose-400 border-rose-900/50 animate-pulse" :
                                        cliente.situacion === 'moroso' ? "bg-rose-950/30 text-rose-400 border-rose-900/50" : 
                                        cliente.situacion === 'cpp' ? "bg-amber-950/30 text-orange-400 border-amber-900/50" : 
                                        cliente.situacion === 'deuda' ? "bg-amber-950/30 text-amber-400 border-amber-900/50" : 
                                        cliente.situacion === 'ok' ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/50" : 
                                        cliente.situacion === 'sin_deuda' ? "bg-blue-950/30 text-blue-400 border-blue-900/50" :
                                        "bg-slate-800 text-slate-500 border-slate-700"
                                    )}>
                                        {cliente.situacion === 'vencido' ? 'VENCIDO' : 
                                         cliente.situacion === 'moroso' ? 'MOROSO' : 
                                         cliente.situacion === 'cpp' ? 'CPP' : 
                                         cliente.situacion === 'deuda' ? 'DEUDA' : 
                                         cliente.situacion === 'ok' ? 'OK' : 
                                         cliente.situacion === 'sin_deuda' ? 'SIN DEUDA' :
                                         cliente.estado?.toUpperCase()}
                                    </Badge>
                                </div>

                                <div className="col-span-2 flex justify-end gap-1.5 text-right">
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-700/50 transition-all" onClick={() => window.open(`https://wa.me/${cliente.telefono}`, '_blank')}>
                                        <MessageCircle className="w-4 h-4" />
                                    </Button>
                                    {(userRol === 'admin' || userRol === 'supervisor') && (
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-8 w-8 p-0 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-blue-400 hover:bg-blue-900/40 hover:border-blue-700/50 transition-all"
                                            onClick={() => {
                                                setPendingEditClient(cliente)
                                                setConfirmEditOpen(true)
                                            }}
                                        >
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                    )}

                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="h-8 w-8 p-0 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-blue-400 hover:bg-blue-900/40 transition-all font-bold"
                                        onClick={(e) => handleOpenGestion(cliente, e)}
                                        title="Registrar Gestión"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                    </Button>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-slate-400 bg-slate-800/40 border border-slate-700/50 hover:text-white hover:bg-slate-700 transition-all data-[state=open]:bg-slate-700">
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800 text-slate-200">
                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                            <DropdownMenuSeparator className="bg-slate-800" />
                                            {userRol === 'admin' && (
                                                <DropdownMenuItem 
                                                    onClick={(e) => handleToggleExcepcion(cliente, e)}
                                                    className={cn(
                                                        "cursor-pointer hover:bg-slate-800 focus:bg-slate-800",
                                                        cliente.excepcion_voucher ? "text-purple-400" : "text-emerald-400"
                                                    )}
                                                >
                                                    {cliente.excepcion_voucher ? <ShieldCheck className="w-4 h-4 mr-2" /> : <Receipt className="w-4 h-4 mr-2" />}
                                                    {cliente.excepcion_voucher ? "Requerir Recibos" : "Exonerar Recibos"}
                                                </DropdownMenuItem>
                                            )}
                                            {(userRol === 'admin' || (userRol === 'supervisor' && !cliente.bloqueado_renovacion)) && (
                                                <DropdownMenuItem 
                                                    onClick={() => {
                                                        setPendingBlockClient(cliente)
                                                        setConfirmBlockOpen(true)
                                                    }} 
                                                    className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800 text-amber-400"
                                                >
                                                    {cliente.bloqueado_renovacion ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />} 
                                                    {cliente.bloqueado_renovacion ? 'Desbloquear Renovación' : 'Bloquear Renovación'}
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem onClick={() => router.push(`?client=${cliente.id}`)} className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800">
                                                <Eye className="w-4 h-4 mr-2" /> Ver Detalle Rápido
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => router.push(`/dashboard/clientes/${cliente.id}`)} className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800">
                                                <Users className="w-4 h-4 mr-2" /> Ir a Perfil Completo
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    )})}
                    </>
                    )}
                </div>

                {/* Empty State */}
                {!isPending && filteredClientes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <Users className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No se encontraron clientes</p>
                    </div>
                )}
            </div>
            )}
            
            {/* Pagination Components */}
            <PaginationControlled
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                totalRecords={filteredClientes.length}
                pageSize={ITEMS_PER_PAGE}
                className="mt-6"
            />

            {/* Reassign Modal */}
            <Dialog open={isReasignModalOpen} onOpenChange={setIsReasignModalOpen}>
                <DialogContent className="bg-slate-900 border border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Reasignar Cartera de Clientes</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Está a punto de reasignar {selectedClients.length} cliente(s) a un nuevo asesor. Esta acción transferirá su gestión, pagos pendientes y dependencias asociadas.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        <label className="text-sm text-slate-300 mb-2 block">Seleccione el Asesor Destino</label>
                        <Select value={selectedNewAsesor} onValueChange={setSelectedNewAsesor}>
                            <SelectTrigger className="w-full bg-slate-950/50 border-slate-700 text-slate-200">
                                <SelectValue placeholder="Elegir asesor..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                {asesores
                                    .filter(a => !selectedClientsCurrentAsesorIds.includes(a.id))
                                    .map(a => (
                                        <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setIsReasignModalOpen(false)}
                            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleReassignSubmit} 
                            disabled={isReassigning || !selectedNewAsesor}
                            className="bg-purple-600 hover:bg-purple-500 text-white"
                        >
                            {isReassigning ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Transfiriendo...
                                </>
                            ) : (
                                'Confirmar Reasignación'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* Client Detail Drawer */}
            <ClientDetailDrawer 
                cliente={clientes.find(c => c.id === searchParams.get('client'))} 
                isOpen={!!searchParams.get('client')} 
                onClose={() => updateParams({ client: null })}
                userRol={userRol}
            />

            {editingCliente && (
                <ClientEditModal
                    cliente={editingCliente}
                    isOpen={!!editingCliente}
                    userRol={userRol}
                    onClose={() => setEditingCliente(null)}
                    onSuccess={() => {
                        setEditingCliente(null)
                        router.refresh()
                    }}
                />
            )}

            <RegistrarGestionModal 
                open={gestionOpen}
                onOpenChange={setGestionOpen}
                prestamoId={selectedClientForGestion?.prestamo_activo_id}
                prestamos={selectedClientForGestion?.prestamos || []}
                clienteNombre={selectedClientForGestion?.nombres}
                clienteTelefono={selectedClientForGestion?.telefono}
                onSuccess={() => {
                    // router.refresh()
                }}
            />

            <AlertDialog open={confirmExcepcionOpen} onOpenChange={setConfirmExcepcionOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 border-l-4 border-l-purple-500 max-w-[400px] p-0 overflow-hidden shadow-2xl shadow-purple-900/10">
                    <div className="p-6">
                        <AlertDialogHeader>
                            <div className="mx-auto p-3 bg-purple-500/10 rounded-full w-fit mb-3 border border-purple-500/20">
                                <ShieldAlert className="w-6 h-6 text-purple-500" />
                            </div>
                            <AlertDialogTitle className="text-white text-center text-lg font-bold">
                                {pendingExcepcionClient?.excepcion_voucher 
                                    ? 'Reactivar Requisito de Recibos' 
                                    : 'Exonerar de Recibos'}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400 text-center text-[10px] leading-relaxed mt-2 px-2">
                                {pendingExcepcionClient?.excepcion_voucher 
                                    ? `¿Confirmas que "${pendingExcepcionClient?.nombres}" vuelva a REQUERIR recibos obligatorios para todos sus pagos?`
                                    : `¿Estás seguro de EXONERAR a "${pendingExcepcionClient?.nombres}" de presentar recibos? Esto permitirá que sus pagos se aprueben automáticamente sin adjuntar imagen.`
                                }
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="sm:justify-center gap-3 mt-6">
                            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white h-9 px-4 text-[10px] font-bold uppercase tracking-tight transition-all">
                                Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={processToggleExcepcion}
                                className={cn(
                                    "h-9 px-4 text-[10px] font-black uppercase tracking-tight text-white shadow-lg transition-all",
                                    pendingExcepcionClient?.excepcion_voucher
                                        ? "bg-slate-700 hover:bg-slate-600"
                                        : "bg-purple-600 hover:bg-purple-500 shadow-purple-900/20"
                                )}
                            >
                                {pendingExcepcionClient?.excepcion_voucher ? 'Restablecer' : 'Confirmar Exoneración'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </div>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmEditOpen} onOpenChange={setConfirmEditOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 border-l-4 border-l-blue-500 max-w-[400px] p-0 overflow-hidden shadow-2xl shadow-blue-900/10">
                    <div className="p-6">
                        <AlertDialogHeader>
                            <div className="mx-auto p-3 bg-blue-500/10 rounded-full w-fit mb-3 border border-blue-500/20">
                                <Edit className="w-6 h-6 text-blue-500" />
                            </div>
                            <AlertDialogTitle className="text-white text-center text-lg font-bold">
                                Editar Perfil de Cliente
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400 text-center text-[11px] leading-relaxed mt-2 px-2">
                                ¿Estás seguro de que deseas MODIFICAR los datos de "{pendingEditClient?.nombres}"?
                                <br/><br/>
                                <span className="text-blue-400/80">Recuerda que todos los cambios quedan registrados en la auditoría del sistema.</span>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="sm:justify-center gap-3 mt-6">
                            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white h-9 px-4 text-[10px] font-bold uppercase tracking-tight transition-all">
                                Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={() => {
                                    setEditingCliente(pendingEditClient)
                                    setConfirmEditOpen(false)
                                    setPendingEditClient(null)
                                }}
                                className="h-9 px-4 text-[10px] font-black uppercase tracking-tight text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all"
                            >
                                Sí, editar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </div>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirmBlockOpen} onOpenChange={setConfirmBlockOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 border-l-4 border-l-amber-500 max-w-[400px] p-0 overflow-hidden shadow-2xl shadow-amber-900/10">
                    <div className="p-6">
                        <AlertDialogHeader>
                            <div className="mx-auto p-3 bg-amber-500/10 rounded-full w-fit mb-3 border border-amber-500/20">
                                {pendingBlockClient?.bloqueado_renovacion ? <Unlock className="w-6 h-6 text-amber-500" /> : <Lock className="w-6 h-6 text-amber-500" />}
                            </div>
                            <AlertDialogTitle className="text-white text-center text-lg font-bold">
                                {pendingBlockClient?.bloqueado_renovacion 
                                    ? 'Desbloquear Renovación' 
                                    : 'Bloquear Renovación'}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400 text-center text-[11px] leading-relaxed mt-2 px-2">
                                {pendingBlockClient?.bloqueado_renovacion 
                                    ? `¿Confirma que desea habilitar a "${pendingBlockClient?.nombres}" para solicitar nuevas renovaciones? Solo administradores pueden revertir esta acción.`
                                    : `¿Está seguro que desea BLOQUEAR a "${pendingBlockClient?.nombres}"? El cliente no podrá renovar préstamos. Solo un administrador puede desbloquearlo.`
                                }
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="sm:justify-center gap-3 mt-6">
                            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white h-9 px-4 text-[10px] font-bold uppercase tracking-tight transition-all">
                                Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={processToggleBlock}
                                className={cn(
                                    "h-9 px-4 text-[10px] font-black uppercase tracking-tight text-white shadow-lg transition-all",
                                    pendingBlockClient?.bloqueado_renovacion
                                        ? "bg-slate-700 hover:bg-slate-600"
                                        : "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20"
                                )}
                            >
                                {pendingBlockClient?.bloqueado_renovacion ? 'Sí, Desbloquear' : 'Sí, Bloquear'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
