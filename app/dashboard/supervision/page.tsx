import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import { Users, TrendingUp, Wallet, AlertTriangle, User, ChartBar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import Link from "next/link";

export const dynamic = 'force-dynamic'

interface AsesorStats {
    id: string
    nombre_completo: string
    totalClientes: number
    totalPrestamos: number
    prestamosActivos: number
    capitalTotal: number
    moraTotal: number
}

export default async function SupervisionPage() {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current user's role
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user.id)
        .single()

    const userRole = perfil?.rol

    // Only supervisors and admins can access this page
    if (userRole !== 'supervisor' && userRole !== 'admin') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Acceso Denegado</h1>
                    <p className="text-slate-400">Solo supervisores pueden acceder a este panel.</p>
                </div>
            </div>
        )
    }

    // Get asesores under this supervisor (or all if admin)
    let asesoresQuery = supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo, created_at')
        .eq('rol', 'asesor')
        .order('nombre_completo')

    if (userRole === 'supervisor') {
        asesoresQuery = asesoresQuery.eq('supervisor_id', user.id)
    }

    const { data: asesores } = await asesoresQuery

    // Get stats for each asesor
    const today = new Date().toISOString().split('T')[0]
    const asesoresStats: AsesorStats[] = []

    for (const asesor of asesores || []) {
        // Get clients for this asesor
        const { data: clientes } = await supabaseAdmin
            .from('clientes')
            .select('id')
            .eq('asesor_id', asesor.id)

        const clienteIds = clientes?.map(c => c.id) || []

        let totalPrestamos = 0
        let prestamosActivos = 0
        let capitalTotal = 0
        let moraTotal = 0

        if (clienteIds.length > 0) {
            // Get loans for these clients
            const { data: prestamos } = await supabaseAdmin
                .from('prestamos')
                .select(`
                    id, estado, monto,
                    cronograma_cuotas ( monto_cuota, monto_pagado, fecha_vencimiento )
                `)
                .in('cliente_id', clienteIds)

            totalPrestamos = prestamos?.length || 0
            prestamosActivos = prestamos?.filter(p => p.estado === 'activo').length || 0
            capitalTotal = prestamos?.reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0) || 0

            // Calculate mora
            prestamos?.forEach(p => {
                if (p.estado === 'activo' && p.cronograma_cuotas) {
                    p.cronograma_cuotas.forEach((c: any) => {
                        const pendiente = parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)
                        if (pendiente > 0.1 && c.fecha_vencimiento < today) {
                            moraTotal += pendiente
                        }
                    })
                }
            })
        }

        asesoresStats.push({
            id: asesor.id,
            nombre_completo: asesor.nombre_completo || 'Sin nombre',
            totalClientes: clienteIds.length,
            totalPrestamos,
            prestamosActivos,
            capitalTotal,
            moraTotal
        })
    }

    // Calculate totals
    const totalAsesores = asesoresStats.length
    const totalClientes = asesoresStats.reduce((acc, a) => acc + a.totalClientes, 0)
    const totalCapital = asesoresStats.reduce((acc, a) => acc + a.capitalTotal, 0)
    const totalMora = asesoresStats.reduce((acc, a) => acc + a.moraTotal, 0)

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="border-b border-white/5 pb-6">
                <div className="flex items-center gap-3">
                    <BackButton />
                    <div className="hidden md:flex w-12 h-12 bg-purple-900/30 rounded-xl items-center justify-center">
                        <ChartBar className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">Panel de Supervisión</h1>
                        <p className="text-slate-400 mt-2 md:mt-1">Rendimiento de tu equipo de asesores</p>
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-purple-900/30 rounded-xl flex items-center justify-center">
                            <Users className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-slate-400 text-sm uppercase font-bold">Asesores</span>
                    </div>
                    <p className="text-4xl font-bold text-white">{totalAsesores}</p>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-900/30 rounded-xl flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-slate-400 text-sm uppercase font-bold">Clientes</span>
                    </div>
                    <p className="text-4xl font-bold text-white">{totalClientes}</p>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-emerald-900/30 rounded-xl flex items-center justify-center">
                            <Wallet className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="text-slate-400 text-sm uppercase font-bold">Capital Total</span>
                    </div>
                    <p className="text-4xl font-bold text-white">${totalCapital.toLocaleString()}</p>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-red-900/30 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-red-900/30 rounded-xl flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <span className="text-slate-400 text-sm uppercase font-bold">Mora Total</span>
                    </div>
                    <p className="text-4xl font-bold text-red-400">${totalMora.toLocaleString()}</p>
                </div>
            </div>

            {/* Asesores Table */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-400" />
                        Rendimiento por Asesor
                    </h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-800/50 text-xs uppercase text-slate-400">
                            <tr>
                                <th className="px-6 py-4 text-left">Asesor</th>
                                <th className="px-6 py-4 text-center">Clientes</th>
                                <th className="px-6 py-4 text-center">Préstamos Activos</th>
                                <th className="px-6 py-4 text-right">Capital</th>
                                <th className="px-6 py-4 text-right">Mora</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {asesoresStats.map((asesor) => (
                                <tr key={asesor.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center text-blue-400 font-bold">
                                                {asesor.nombre_completo.charAt(0)}
                                            </div>
                                            <span className="font-medium text-white">{asesor.nombre_completo}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-white font-bold">{asesor.totalClientes}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-white font-bold">{asesor.prestamosActivos}</span>
                                        <span className="text-slate-500 text-sm">/{asesor.totalPrestamos}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-emerald-400 font-bold">${asesor.capitalTotal.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`font-bold ${asesor.moraTotal > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                            ${asesor.moraTotal.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {asesor.moraTotal > 0 ? (
                                            <Badge variant="outline" className="bg-red-950/50 text-red-400 border-red-900/50">
                                                CON MORA
                                            </Badge>
                                        ) : asesor.prestamosActivos > 0 ? (
                                            <Badge variant="outline" className="bg-emerald-950/50 text-emerald-400 border-emerald-900/50">
                                                AL DÍA
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-slate-800 text-slate-500 border-slate-700">
                                                SIN ACTIVIDAD
                                            </Badge>
                                        )}
                                    </td>
                                </tr>
                            ))}

                            {asesoresStats.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>No tienes asesores asignados</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
