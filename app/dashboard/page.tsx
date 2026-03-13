import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { Users, Banknote, ArrowRight, TrendingUp, FileText, Receipt, Clock, Briefcase, ShieldCheck, Wallet, Award, Contact } from 'lucide-react'
import Link from 'next/link'
import { AdminKPIs } from '@/components/dashboard/admin-kpis'
import { PendingTasks } from '@/components/dashboard/pending-tasks'
import { SupervisorEfficiency } from '@/components/dashboard/supervisor-efficiency'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('nombre_completo, rol')
        .eq('id', user?.id)
        .single()

    const isAdmin = perfil?.rol === 'admin'

    // Fetch Quick Stats (for non-admin view)
    const { count: clientCount } = await supabaseAdmin.from('clientes').select('*', { count: 'exact', head: true })
    const { data: activeLoans } = await supabaseAdmin.from('prestamos').select('monto').eq('estado', 'activo')
    const activeVolume = activeLoans?.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0) || 0

    // Format money consistently
    const formatMoney = (value: number): string => {
        return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Welcome Hero - Premium Dark */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950/30 border border-white/5 shadow-2xl p-8 md:p-10 mb-8">
                {/* Abstract Background Shapes */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-purple-600/5 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
                            Hola, <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">{perfil?.nombre_completo?.split(' ')[0] || 'Usuario'}</span>
                        </h1>
                        <p className="text-slate-400 text-lg max-w-xl leading-relaxed">
                            {isAdmin 
                                ? 'Panel administrativo con métricas en tiempo real de tu cartera.'
                                : 'Bienvenido a tu centro de control. Todo está listo para que gestiones tu cartera de forma eficiente hoy.'
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* TAREAS PENDIENTES */}
            <PendingTasks />

            {/* ADMIN: Show KPIs Dashboard */}
            {isAdmin && <AdminKPIs />}

            {/* SUPERVISOR: Efficiency Machine */}
            {perfil?.rol === 'supervisor' && <SupervisorEfficiency />}

            {/* ASESOR: Show simplified view */}
            {perfil?.rol === 'asesor' && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Metric 1: Clients */}
                    <Link href="/dashboard/clientes">
                        <div className="group h-full bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-2xl hover:border-blue-500/30 hover:bg-slate-900/60 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Users className="w-24 h-24 text-blue-500" />
                            </div>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors border border-blue-500/10">
                                    <Users className="w-6 h-6 text-blue-400" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Clientes Totales</p>
                                    <h3 className="text-3xl font-bold text-white mt-1 group-hover:text-blue-200 transition-colors">{clientCount || 0}</h3>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-xs text-blue-400/80 font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                Ver directorio <ArrowRight className="ml-1 w-3 h-3" />
                            </div>
                        </div>
                    </Link>

                    {/* Metric 2: Capital */}
                    <Link href="/dashboard/prestamos">
                        <div className="group h-full bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-2xl hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 relative overflow-hidden">
                            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                <Banknote className="w-24 h-24 text-emerald-500" />
                            </div>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors border border-emerald-500/10">
                                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Capital Activo</p>
                                    <h3 className="text-3xl font-bold text-white mt-1 group-hover:text-emerald-200 transition-colors">${formatMoney(activeVolume)}</h3>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-xs text-emerald-400/80 font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                Ver préstamos <ArrowRight className="ml-1 w-3 h-3" />
                            </div>
                        </div>
                    </Link>

                    {/* Metric 3: Quick Actions */}
                    <div className="group h-full bg-slate-900/40 backdrop-blur-sm border border-slate-800 p-6 rounded-2xl hover:border-purple-500/30 hover:bg-slate-900/60 transition-all duration-300">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-4">Finanzas y Operación</p>
                        <div className="grid grid-cols-2 gap-3">
                            <Link href="/dashboard/gastos" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/50 hover:bg-orange-600/20 border border-slate-700 hover:border-orange-500/50 transition-all group/btn">
                                <Receipt className="w-5 h-5 text-orange-400 mb-2 group-hover/btn:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold text-slate-300 group-hover/btn:text-white">Registrar Gasto</span>
                            </Link>

                            <Link href="/dashboard/cuadre" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/50 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500/50 transition-all group/btn">
                                <Clock className="w-5 h-5 text-blue-400 mb-2 group-hover/btn:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold text-slate-300 group-hover/btn:text-white">Realizar Cuadre</span>
                            </Link>

                            <Link href="/dashboard/metas" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/50 hover:bg-amber-600/20 border border-slate-700 hover:border-amber-500/50 transition-all group/btn col-span-2">
                                <Award className="w-5 h-5 text-amber-400 mb-2 group-hover/btn:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold text-slate-300 group-hover/btn:text-white">Mis Metas</span>
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Quick Actions (after KPIs) */}
            {isAdmin && (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
                    <Link href="/dashboard/admin/carteras" className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all group">
                        <Briefcase className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Gestionar Carteras</span>
                    </Link>
                    <Link href="/dashboard/admin/cuadres" className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/50 transition-all group">
                        <ShieldCheck className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Aprobar Cuadres</span>
                    </Link>
                    <Link href="/dashboard/usuarios" className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all group">
                        <Users className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Gestionar Equipo</span>
                    </Link>
                    <Link href="/dashboard/admin/empleados" className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/50 transition-all group">
                        <Contact className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Directorio Empleados</span>
                    </Link>
                    <Link href="/dashboard/gastos" className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-orange-500/50 hover:bg-slate-800/50 transition-all group">
                        <Receipt className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Gastos Operativos</span>
                    </Link>
                    <Link href="/dashboard/nomina" className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/50 transition-all group">
                        <Wallet className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-300 group-hover:text-white">Nómina y Bonos</span>
                    </Link>
                </div>
            )}
        </div>
    )
}
