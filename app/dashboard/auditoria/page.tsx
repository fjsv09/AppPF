'use client'

import { createClient } from '@/utils/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ScrollText, User, Activity, Clock, ShieldCheck, Receipt, Sparkles, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VoucherAlerts } from '@/components/auditoria/voucher-alerts'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'

export default function AuditoriaPage() {
    const supabase = createClient()
    const router = useRouter()
    const [generating, setGenerating] = useState(false)
    const [user, setUser] = useState<any>(null)
    const [perfil, setPerfil] = useState<any>(null)
    const [auditoria, setAuditoria] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }
            setUser(user)

            const { data: perfilData } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', user.id)
                .single()
            setPerfil(perfilData)

            if (perfilData?.rol === 'admin') {
                const { data: logs } = await supabase
                    .from('auditoria')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50)
                setAuditoria(logs || [])
            }
            setLoading(false)
        }
        loadData()
    }, [router, supabase])

    const handleGenerarTareas = async () => {
        setGenerating(true)
        try {
            const res = await fetch('/api/auditoria/generar-tareas', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Error generando tareas')
            
            toast.success(data.message)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setGenerating(false)
        }
    }

    if (loading) return null

    const userRol = perfil?.rol || 'asesor'

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-white/5">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                            Auditoría y Control
                        </h1>
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">Supervisa las acciones críticas y cumplimiento del equipo.</p>
                </div>

                {userRol === 'admin' && (
                    <Button 
                        onClick={handleGenerarTareas}
                        disabled={generating}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 gap-2 h-10 px-4"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Generar Tareas Dirigidas
                    </Button>
                )}
            </div>

            <Tabs defaultValue={userRol === 'admin' ? "historial" : "vouchers"} className="w-full">
            <div className="overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
                <TabsList className={cn(
                    "bg-slate-900/50 border border-slate-800 p-0.5 w-full grid md:flex md:w-fit",
                    userRol === 'admin' ? "grid-cols-2" : "grid-cols-1"
                )}>
                    {userRol === 'admin' && (
                        <TabsTrigger value="historial" className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                            <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" />
                            Registro General
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="vouchers" className="h-7 px-0 md:px-4 text-[10px] md:text-xs data-[state=active]:bg-slate-800 whitespace-nowrap text-slate-400 data-[state=active]:text-white">
                        <Receipt className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" />
                        Control de Vouchers
                    </TabsTrigger>
                </TabsList>
            </div>

                {userRol === 'admin' && (
                    <TabsContent value="historial" className="mt-0">
                        <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-800 before:to-transparent">
                            {auditoria?.map((log, index) => (
                                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-slate-900 group-hover:bg-blue-500/20 group-hover:border-blue-500/50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors">
                                        <Activity className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                                    </div>
                                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-900/40 backdrop-blur-sm p-4 rounded-xl border border-slate-800 hover:border-blue-500/30 transition-all shadow-lg">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-white text-md tracking-tight">{log.accion}</span>
                                                <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                                    {format(new Date(log.created_at), 'HH:mm')}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-400 leading-snug mt-1">
                                                {log.detalles ? JSON.stringify(log.detalles).substring(0, 100) : 'Sin detalles adicionales'}
                                            </p>
                                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5 text-xs text-slate-500">
                                                <div className="flex items-center gap-1.5">
                                                    <User className="w-3.5 h-3.5" />
                                                    <span className="max-w-[100px] truncate">{log.usuario_id || 'Sistema'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>{format(new Date(log.created_at), 'dd MMM yyyy', { locale: es })}</span>
                                                </div>
                                                <span className="ml-auto bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{log.tabla_afectada || 'General'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!auditoria || auditoria.length === 0) && (
                                <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                                     <ScrollText className="w-10 h-10 mb-2 opacity-50" />
                                     <p>No hay registros de auditoría disponibles.</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                )}

                <TabsContent value="vouchers" className="mt-0">
                    <VoucherAlerts />
                </TabsContent>
            </Tabs>
        </div>
    )
}
