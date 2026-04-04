import { Receipt, Clock, Award, CreditCard, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { CuadreModal } from '@/components/finanzas/cuadre-modal'

interface AdvisorHubProps {
    userId: string
}

export function AdvisorHub({ userId }: AdvisorHubProps) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/dashboard/gastos" className="group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-orange-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-orange-500/20">
                    <Receipt className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Registrar Gasto</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Caja Chica</p>
            </Link>

            <CuadreModal 
                userId={userId}
                trigger={
                    <button className="text-left w-full group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-blue-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-blue-500/20">
                            <Clock className="w-6 h-6 text-blue-400" />
                        </div>
                        <h3 className="text-base font-bold text-white tracking-tight">Realizar Cuadre</h3>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Cierre diario</p>
                    </button>
                }
            />

            <Link href="/dashboard/nomina" className="group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-indigo-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-indigo-500/20">
                    <CreditCard className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Nómina y Bonos</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Mis Pagos</p>
            </Link>

            <Link href="/dashboard/metas" className="group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-amber-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-amber-500/20">
                    <Award className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Mis Metas</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Rendimiento</p>
            </Link>
        </div>
    )
}

