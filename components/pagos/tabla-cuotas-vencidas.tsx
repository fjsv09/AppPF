'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowUpRight, Search, Filter, Users, UserCheck, Calendar } from 'lucide-react'

interface CuotaVencida {
    id: string
    prestamoId: string
    clienteNombre: string
    cuotasVencidas: number
    totalCuotas: number
    totalPendiente: number
    asesorId?: string
    asesorNombre?: string
    supervisorId?: string
    supervisorNombre?: string
}

interface Perfil {
    id: string
    nombre_completo: string
    rol: string
    supervisor_id?: string
}

interface Props {
    cuotasVencidas: CuotaVencida[]
    perfiles: Perfil[]
    userRol: 'admin' | 'supervisor' | 'asesor'
    userId: string
    initialDate?: string
}

export function TablaCuotasVencidas({ cuotasVencidas, perfiles, userRol, userId, initialDate }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    
    // Obtener fecha inicial (o hoy local)
    const getToday = () => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    }

    const [busqueda, setBusqueda] = useState('')
    const [filtroSupervisor, setFiltroSupervisor] = useState<string>('todos')
    const [filtroAsesor, setFiltroAsesor] = useState<string>('todos')
    const [fechaFiltro, setFechaFiltro] = useState<string>(initialDate || getToday())

    // Efecto para actualizar URL cuando cambia la fecha
    const handleFechaChange = (nuevaFecha: string) => {
        setFechaFiltro(nuevaFecha)
        const params = new URLSearchParams(searchParams.toString())
        params.set('fecha', nuevaFecha)
        router.push(`${pathname}?${params.toString()}`)
    }

    // Obtener supervisores y asesores únicos
    const supervisores = useMemo(() => {
        return perfiles.filter(p => p.rol === 'supervisor')
    }, [perfiles])

    const asesores = useMemo(() => {
        // Si hay filtro de supervisor, mostrar solo sus asesores
        if (filtroSupervisor !== 'todos') {
            return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === filtroSupervisor)
        }
        // Para supervisor, mostrar solo SUS asesores
        if (userRol === 'supervisor') {
            return perfiles.filter(p => p.rol === 'asesor' && p.supervisor_id === userId)
        }
        return perfiles.filter(p => p.rol === 'asesor')
    }, [perfiles, filtroSupervisor, userRol, userId])

    // Filtrar cuotas
    const cuotasFiltradas = useMemo(() => {
        return cuotasVencidas.filter(cuota => {
            // Filtro de búsqueda (nombre cliente)
            if (busqueda && !cuota.clienteNombre.toLowerCase().includes(busqueda.toLowerCase())) {
                return false
            }
            
            // Filtro por supervisor (solo admin)
            if (userRol === 'admin' && filtroSupervisor !== 'todos') {
                if (cuota.supervisorId !== filtroSupervisor) return false
            }
            
            // Filtro por asesor
            if (filtroAsesor !== 'todos') {
                if (cuota.asesorId !== filtroAsesor) return false
            }
            
            return true
        })
    }, [cuotasVencidas, busqueda, filtroSupervisor, filtroAsesor, userRol])

    // Calcular totales
    const totalPendienteGlobal = cuotasFiltradas.reduce((acc, c) => acc + c.totalPendiente, 0)
    const totalCuotasVencidas = cuotasFiltradas.reduce((acc, c) => acc + c.cuotasVencidas, 0)

    return (
        <div className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-center">
                {/* Buscador - todos los roles */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Buscar cliente..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="pl-9 bg-slate-900/50 border-slate-700 text-slate-200 placeholder:text-slate-500"
                    />
                </div>

                {/* Filtro Fecha */}
                <div className="relative min-w-[150px]">
                    <input
                        type="date"
                        value={fechaFiltro}
                        onChange={(e) => handleFechaChange(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 text-slate-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-600 appearance-none [&::-webkit-calendar-picker-indicator]:invert-[0.5]"
                    />
                </div>

                {/* Filtro Supervisor - solo admin */}
                {userRol === 'admin' && supervisores.length > 0 && (
                    <div className="min-w-[180px]">
                        <Select value={filtroSupervisor} onValueChange={setFiltroSupervisor}>
                            <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200">
                                <Users className="w-4 h-4 mr-2 text-purple-400" />
                                <SelectValue placeholder="Supervisor" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                <SelectItem value="todos">Todos los supervisores</SelectItem>
                                {supervisores.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.nombre_completo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Filtro Asesor - admin y supervisor */}
                {(userRol === 'admin' || userRol === 'supervisor') && asesores.length > 0 && (
                    <div className="min-w-[180px]">
                        <Select value={filtroAsesor} onValueChange={setFiltroAsesor}>
                            <SelectTrigger className="bg-slate-900/50 border-slate-700 text-slate-200">
                                <UserCheck className="w-4 h-4 mr-2 text-blue-400" />
                                <SelectValue placeholder="Asesor" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700">
                                <SelectItem value="todos">Todos los asesores</SelectItem>
                                {asesores.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.nombre_completo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Badge con totales */}
                <div className="flex gap-2 ml-auto">
                    <span className="px-3 py-1.5 rounded-lg bg-red-950/50 border border-red-500/30 text-xs font-mono text-red-400">
                        {totalCuotasVencidas} cuotas
                    </span>
                    <span className="px-3 py-1.5 rounded-lg bg-red-950/50 border border-red-500/30 text-xs font-bold text-red-400">
                        ${totalPendienteGlobal.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Tabla */}
            {cuotasFiltradas.length === 0 ? (
                <div className="h-[300px] flex flex-col items-center justify-center p-8 rounded-3xl bg-slate-900/20 border-2 border-dashed border-slate-800 text-center">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                        <span className="text-4xl">🎉</span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">¡Todo al día!</h3>
                    <p className="text-slate-500 max-w-xs">No hay cuotas vencidas con los filtros seleccionados.</p>
                </div>
            ) : (
                <>
                    {/* Desktop View */}
                    <div className="hidden md:block rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/30">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-900/50">
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                                        {(userRol === 'admin' || userRol === 'supervisor') && (
                                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Asesor</th>
                                        )}
                                        {userRol === 'admin' && (
                                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Supervisor</th>
                                        )}
                                        <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Vencidas</th>
                                        <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Cuotas</th>
                                        <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Pendiente</th>
                                        <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {cuotasFiltradas.map((cuota) => (
                                        <tr key={cuota.prestamoId} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="font-medium text-slate-200">{cuota.clienteNombre}</span>
                                            </td>
                                            {(userRol === 'admin' || userRol === 'supervisor') && (
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-blue-400">{cuota.asesorNombre || '-'}</span>
                                                </td>
                                            )}
                                            {userRol === 'admin' && (
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-purple-400">{cuota.supervisorNombre || '-'}</span>
                                                </td>
                                            )}
                                            <td className="px-4 py-3 text-center">
                                                <span className="px-2 py-0.5 rounded-md bg-red-950/50 border border-red-500/30 text-xs font-bold text-red-400">
                                                    {cuota.cuotasVencidas}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-sm text-slate-400">{cuota.totalCuotas}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-bold text-red-400">${cuota.totalPendiente.toFixed(2)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Link href={`/dashboard/prestamos/${cuota.prestamoId}`}>
                                                    <Button size="sm" className="h-8 px-3 bg-red-600 hover:bg-red-500 text-white border-none transition-all font-bold rounded-lg gap-1">
                                                        Pagar
                                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {cuotasFiltradas.map((cuota) => (
                            <div key={cuota.prestamoId} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-4 shadow-sm">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h4 className="font-bold text-white text-lg">{cuota.clienteNombre}</h4>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {(userRol === 'admin' || userRol === 'supervisor') && cuota.asesorNombre && (
                                                <span className="text-xs text-blue-400 flex items-center gap-1">
                                                    <UserCheck className="w-3 h-3" /> {cuota.asesorNombre}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-500/30 text-xs font-bold text-red-400 shrink-0">
                                        {cuota.cuotasVencidas} cuotas
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-800/50">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Pendiente</span>
                                        <span className="text-xl font-bold text-red-400">${cuota.totalPendiente.toFixed(2)}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Cuotas</span>
                                        <span className="text-base text-slate-300 font-medium">{cuota.totalCuotas}</span>
                                    </div>
                                </div>

                                <Link href={`/dashboard/prestamos/${cuota.prestamoId}`} className="block">
                                    <Button className="w-full bg-red-600 hover:bg-red-500 text-white font-bold h-12 rounded-xl shadow-lg shadow-red-900/20 active:scale-95 transition-all">
                                        Pagar Cuotas
                                        <ArrowUpRight className="w-5 h-5 ml-2" />
                                    </Button>
                                </Link>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
