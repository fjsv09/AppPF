'use client'

import { useEffect } from 'react'
import { AlertCircle, AlertTriangle, Clock } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { CuadreModal } from '@/components/finanzas/cuadre-modal'

interface DashboardAlertsProps {
    userId: string
    blockInfo: any
    accessInfo: any
}

export function DashboardAlerts({ userId, blockInfo, accessInfo }: DashboardAlertsProps) {
    const router = useRouter()
    const supabase = createClient()

    // Suscripción en tiempo real para refrescar alertas si cambia un cuadre (bloqueo/desbloqueo)
    useEffect(() => {
        if (!userId) return

        const channel = supabase
          .channel('cuadres-sync-global')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'cuadres_diarios',
              filter: `asesor_id=eq.${userId}`
            },
            (payload) => {
              console.log('🔄 Sincronizando alertas (DB)...', payload)
              router.refresh()
            }
          )
          .on(
            'broadcast',
            { event: 'cuadre_updated' },
            (payload) => {
              if (payload.payload?.asesor_id === userId) {
                console.log('🚀 Sincronizando alertas (BC)...', payload)
                router.refresh()
              }
            }
          )
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
        }
    }, [supabase, userId, router])


    useEffect(() => {
        // Trigger push to admin only once per session/day if blocked by DEBT
        if (blockInfo?.isBlocked && blockInfo?.code === 'SALDO_PENDIENTE') {
            const notifiedDate = localStorage.getItem('notifiedDebtBlock')
            const today = new Date().toDateString()
            
            if (notifiedDate !== today) {
                // Notificar al admin! (Seteamos localstorage de inmediato para evitar race conditions en re-renders)
                localStorage.setItem('notifiedDebtBlock', today)

                fetch('/api/cuadres/alerta-bloqueo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, motivo: blockInfo.reason })
                }).catch(e => {
                    console.error('Error notifying block:', e)
                    // Si falla, permitimos un reintento eliminando la marca
                    localStorage.removeItem('notifiedDebtBlock')
                })
            }
        }
    }, [blockInfo, userId])

    if (!blockInfo?.isBlocked && accessInfo?.allowed) return null;

    return (
        <div className="flex flex-col gap-4 mb-6">
            {/* SALDO PENDIENTE BLOCK */}
            {blockInfo?.isBlocked && blockInfo?.code === 'SALDO_PENDIENTE' && (
                <div className="bg-red-950/40 border border-red-500/50 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl animate-in slide-in-from-top-4">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h2 className="text-xl font-black text-red-400 uppercase tracking-tight mb-2">Jornada Bloqueada por Deuda</h2>
                        <p className="text-sm text-red-200/80 max-w-2xl">{blockInfo.reason}</p>
                    </div>
                    <CuadreModal 
                        userId={userId}
                        isDebtBlocked={true}
                        systemConfig={accessInfo?.config}
                        trigger={
                            <button className="w-full md:w-auto px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors text-center whitespace-nowrap shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                                Liquidar Saldo Pendiente
                            </button>
                        }
                    />
                </div>
            )}

            {/* CUADRE MAÑANA BLOCK */}
            {!accessInfo?.allowed && accessInfo?.code === 'MISSING_MORNING_CUADRE' && (
                <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl animate-in slide-in-from-top-4">
                    <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h2 className="text-xl font-black text-amber-400 uppercase tracking-tight mb-2">Cierre Parcial Requerido</h2>
                        <p className="text-sm text-amber-200/80 max-w-2xl">{accessInfo.reason}</p>
                    </div>
                    <CuadreModal 
                        userId={userId}
                        isMorningBlocked={true}
                        systemConfig={accessInfo?.config}
                        trigger={
                            <button className="w-full md:w-auto px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors text-center whitespace-nowrap">
                                Realizar Cierre Parcial
                            </button>
                        }
                    />
                </div>
            )}

            {/* HORARIOS / OUT OF HOURS BLOCK */}
            {!accessInfo?.allowed && ['OUT_OF_HOURS', 'NIGHT_RESTRICTION', 'HOLIDAY_BLOCK'].includes(accessInfo?.code || '') && (
                <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-5 flex items-center gap-4">
                    <Clock className="w-6 h-6 text-slate-400" />
                    <div>
                        <h3 className="text-sm font-bold text-slate-300">Sistema Cerrado</h3>
                        <p className="text-xs text-slate-500">{accessInfo.reason}</p>
                    </div>
                </div>
            )}
            
            {/* TIEMPO GRACIA BLOCK */}
            {!accessInfo?.allowed && accessInfo?.code === 'GRACE_PERIOD' && (
                <div className="bg-indigo-950/40 border border-indigo-500/50 rounded-2xl p-5 flex items-center gap-4 animate-pulse">
                    <Clock className="w-6 h-6 text-indigo-400" />
                    <div>
                        <h3 className="text-sm font-bold text-indigo-300">Tiempo de Espera Activo</h3>
                        <p className="text-xs text-indigo-200/80">{accessInfo.reason}</p>
                    </div>
                </div>
            )}
        </div>
    )
}
