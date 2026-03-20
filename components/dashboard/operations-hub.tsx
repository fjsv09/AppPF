import { Users, ShieldCheck, Wallet, Contact, Banknote, Award, CreditCard } from 'lucide-react'
import Link from 'next/link'

interface OperationsHubProps {
    role?: string
}

export function OperationsHub({ role }: OperationsHubProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Link href="/dashboard/supervision" className="group p-4 md:p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl hover:border-purple-500/50 transition-all shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 blur-[30px] -mr-8 -mt-8" />
                <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform border border-purple-500/20 relative z-10">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                </div>
                <h3 className="text-sm md:text-base font-black text-white tracking-tight uppercase relative z-10">Mi Equipo</h3>
                <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 relative z-10">Gestión</p>
            </Link>

            {role === 'admin' && (
                <Link href="/dashboard/admin/cuadres" className="group p-4 md:p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl hover:border-emerald-500/50 transition-all shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 blur-[30px] -mr-8 -mt-8" />
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform border border-emerald-500/20 relative z-10">
                        <Banknote className="w-5 h-5 md:w-6 md:h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-sm md:text-base font-black text-white tracking-tight uppercase relative z-10">Aprobar Cuadre</h3>
                    <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 relative z-10">Liquidación</p>
                </Link>
            )}

            <Link href="/dashboard/metas" className="group p-4 md:p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl hover:border-rose-500/50 transition-all shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 blur-[30px] -mr-8 -mt-8" />
                <div className="w-10 h-10 md:w-12 md:h-12 bg-rose-500/10 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform border border-rose-500/20 relative z-10">
                    <Award className="w-5 h-5 md:w-6 md:h-6 text-rose-400" />
                </div>
                <h3 className="text-sm md:text-base font-black text-white tracking-tight uppercase relative z-10">Metas y Bonos</h3>
                <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 relative z-10">Rendimiento</p>
            </Link>

            <Link href="/dashboard/auditoria" className="group p-4 md:p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl hover:border-amber-500/50 transition-all shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 blur-[30px] -mr-8 -mt-8" />
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform border border-amber-500/20 relative z-10">
                    <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-amber-400" />
                </div>
                <h3 className="text-sm md:text-base font-black text-white tracking-tight uppercase relative z-10">Control</h3>
                <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 relative z-10">Auditoría</p>
            </Link>

            <Link href="/dashboard/nomina" className="group p-4 md:p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl md:rounded-2xl hover:border-cyan-500/50 transition-all shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/5 blur-[30px] -mr-8 -mt-8" />
                <div className="w-10 h-10 md:w-12 md:h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform border border-cyan-500/20 relative z-10">
                    <CreditCard className="w-5 h-5 md:w-6 md:h-6 text-cyan-400" />
                </div>
                <h3 className="text-sm md:text-base font-black text-white tracking-tight uppercase relative z-10">Nómina y Bonos</h3>
                <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 relative z-10">Mis Pagos</p>
            </Link>
        </div>
    )
}
