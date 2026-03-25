import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, CheckCircle, ShieldAlert, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/ui/back-button'

export const metadata: Metadata = {
    title: 'Centro de Alertas'
}

export default async function AlertasPage() {
    const supabase = await createClient()

    const { data: alertas } = await supabase
        .from('alertas')
        .select('*')
        .order('created_at', { ascending: false })

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Centro de Alertas</h1>
                            <p className="page-subtitle">Monitoreo de seguridad y acciones críticas</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {alertas?.map((alerta: any) => (
                    <div 
                        key={alerta.id} 
                        className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                            alerta.resuelto 
                            ? 'bg-slate-900/30 border-slate-800 opacity-75 hover:opacity-100' 
                            : 'bg-red-950/10 border-red-900/30 hover:border-red-500/50 hover:bg-red-950/20'
                        }`}
                    >
                        {/* Glow Effect for Active Alerts */}
                        {!alerta.resuelto && (
                            <div className="absolute -top-10 -right-10 w-20 h-20 bg-red-500/20 rounded-full blur-2xl group-hover:bg-red-500/30 transition-all" />
                        )}

                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className={`p-3 rounded-xl ${alerta.resuelto ? 'bg-slate-800 text-slate-400' : 'bg-red-500/10 text-red-500'}`}>
                                {alerta.resuelto ? <CheckCircle className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                                alerta.resuelto 
                                ? 'border-slate-700 text-slate-500 bg-slate-800/50' 
                                : 'border-red-500/30 text-red-400 bg-red-950/30 animate-pulse'
                            }`}>
                                {alerta.resuelto ? 'SOLUCIONADO' : 'ACCIÓN REQUERIDA'}
                            </span>
                        </div>

                        <div className="relative z-10 space-y-3">
                            <div>
                                <h3 className={`font-bold text-lg ${alerta.resuelto ? 'text-slate-400' : 'text-white'}`}>
                                    {alerta.tipo_alerta}
                                </h3>
                                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                    {alerta.descripcion}
                                </p>
                            </div>
                            
                            <div className="pt-4 border-t border-dashed border-white/5 flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Clock className="w-3.5 h-3.5" />
                                    {format(new Date(alerta.created_at), 'dd MMM yyyy • HH:mm', { locale: es })}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <User className="w-3.5 h-3.5" />
                                    <span className="truncate max-w-[200px]">{alerta.usuario_id || 'Sistema'}</span>
                                </div>
                            </div>
                            
                            {!alerta.resuelto && (
                                <Button className="w-full mt-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-900/50 transition-all font-bold">
                                    Resolver Incidencia
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                
                {(!alertas || alertas.length === 0) && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800">
                        <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="h-8 w-8 text-emerald-500" />
                        </div>
                        <p className="text-lg font-medium text-white">Todo Seguro</p>
                        <p className="text-sm text-slate-500">No hay alertas de seguridad activas en este momento.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
