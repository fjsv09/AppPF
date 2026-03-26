'use client'

import { createClient } from '@/utils/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ScrollText, User, Activity, Clock, ShieldCheck, Receipt, Sparkles, Loader2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VoucherAlerts } from '@/components/auditoria/voucher-alerts'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { cn, formatDatePeru } from '@/lib/utils'
import { BackButton } from '@/components/ui/back-button'

export default function AuditoriaPage() {
    const supabase = createClient()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [generating, setGenerating] = useState(false)
    const [user, setUser] = useState<any>(null)
    const [perfil, setPerfil] = useState<any>(null)
    const [auditoria, setAuditoria] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Read tab from URL, fallback to role-based default
    const tabFromUrl = searchParams.get('tab')

    const handleTabChange = useCallback((value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.replace(`?${params.toString()}`, { scroll: false })
    }, [searchParams, router])

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
                const { data: logs, error: logsError } = await supabase
                    .from('auditoria')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50)
                
                if (logsError) {
                    console.error('Error logs:', logsError)
                    setAuditoria([])
                } else if (logs && logs.length > 0) {
                    const userIds = Array.from(new Set(logs.map(l => l.usuario_id).filter(id => id)))
                    
                    if (userIds.length > 0) {
                        const { data: profiles } = await supabase
                            .from('perfiles')
                            .select('id, nombre_completo')
                            .in('id', userIds)
                        
                        const profileMap = (profiles || []).reduce((acc: any, p) => {
                            acc[p.id] = p.nombre_completo
                            return acc
                        }, {})

                        const enrichedLogs = logs.map(l => ({
                            ...l,
                            perfiles: { nombre: profileMap[l.usuario_id] }
                        }))
                        setAuditoria(enrichedLogs)
                    } else {
                        setAuditoria(logs)
                    }
                } else {
                    setAuditoria([])
                }
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
        <div className="page-container">
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">Auditoría y Control</h1>
                            <p className="page-subtitle">Supervisa las acciones críticas y cumplimiento del equipo.</p>
                        </div>
                    </div>
                </div>

                {userRol === 'admin' && (
                    <Button 
                        onClick={handleGenerarTareas}
                        disabled={generating}
                        className="btn-action bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20 gap-2"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Generar Tareas Dirigidas
                    </Button>
                )}
            </div>

            <Tabs value={tabFromUrl || (userRol === 'admin' ? "historial" : "vouchers")} onValueChange={handleTabChange} className="w-full">
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
                    <TabsContent value="historial" className="mt-0 outline-none">
                        <div className="flex flex-col gap-2 w-full max-w-full overflow-hidden">
                            {auditoria?.map((log) => (
                                <div key={log.id} className="group relative bg-[#0a0a0a]/60 backdrop-blur-md border border-slate-800/40 p-2 sm:p-2.5 rounded-xl flex items-center gap-2 sm:gap-3 hover:border-blue-500/20 hover:bg-slate-900/40 transition-all duration-200">
                                    {/* Indicador de Línea Lateral */}
                                    <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-blue-500/20 rounded-full group-hover:bg-blue-500 transition-colors" />
                                    
                                    <div className="flex-shrink-0 w-11 sm:w-12 text-center border-r border-slate-800/50 pr-1.5 sm:pr-2">
                                        <div className="text-[10px] sm:text-[11px] font-bold text-blue-400 leading-none mb-0.5 font-mono">
                                            {formatDatePeru(log.created_at, 'time')}
                                        </div>
                                        <div className="text-[8px] sm:text-[9px] text-slate-500 font-mono uppercase tracking-tighter">
                                            {formatDatePeru(log.created_at, 'dayMonth')}
                                        </div>
                                    </div>

                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                                                <span className="font-bold text-slate-100 text-[10px] sm:text-[11px] tracking-tight group-hover:text-white transition-colors uppercase truncate max-w-[120px] sm:max-w-none">
                                                    {log.accion.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-[7px] sm:text-[8px] bg-slate-800/50 text-slate-500 px-1 py-0.5 rounded border border-slate-700/30 uppercase font-bold shrink-0">
                                                    {log.tabla_afectada || 'General'}
                                                </span>
                                            </div>

                                            <div className="flex-shrink-0 flex items-center gap-1 text-[8px] sm:text-[9px] text-slate-500 bg-black/20 px-1.5 py-0.5 rounded-lg border border-slate-800/50">
                                                <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-600 hidden xs:block" />
                                                <span className="max-w-[50px] sm:max-w-[70px] truncate font-medium">
                                                    {log.usuario_id === user?.id ? 'Tú' : (log.perfiles?.nombre || log.usuario_id || 'Sistema')}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[9px] sm:text-[10px] text-slate-500/80 truncate group-hover:text-slate-400 transition-colors leading-tight">
                                            {log.detalles 
                                                ? (typeof log.detalles === 'object' ? JSON.stringify(log.detalles) : log.detalles)
                                                : 'Acción registrada sin detalles adicionales.'
                                            }
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {(!auditoria || auditoria.length === 0) && (
                                <div className="flex flex-col items-center justify-center py-10 text-slate-500 bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
                                     <Activity className="w-10 h-10 mb-2 opacity-20" />
                                     <p className="text-xs">No hay registros de auditoría disponibles.</p>
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
