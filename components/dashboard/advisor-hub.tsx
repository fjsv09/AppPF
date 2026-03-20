import { Receipt, Clock, Award, FileText, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export function AdvisorHub() {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/dashboard/gastos" className="group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-orange-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-orange-500/20">
                    <Receipt className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Registrar Gasto</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Caja Chica</p>
            </Link>

            <Link href="/dashboard/cuadre" className="group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-blue-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-blue-500/20">
                    <Clock className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Realizar Cuadre</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Cierre diario</p>
            </Link>

            <Link href="/dashboard/solicitudes" className="group p-5 bg-slate-950/40 backdrop-blur-md border border-slate-800 rounded-2xl hover:border-cyan-500/50 hover:bg-slate-900/60 transition-all shadow-xl">
                <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-cyan-500/20">
                    <FileText className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Solicitudes</h3>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">Prospectos</p>
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
