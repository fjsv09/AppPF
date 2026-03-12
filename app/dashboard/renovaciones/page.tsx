import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { RenovacionesSolicitudes } from '@/components/renovaciones/renovaciones-solicitudes'

import { Clock, Eye, AlertCircle, CheckCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function RenovacionesPage() {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Obtener perfil
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('id, rol, supervisor_id')
        .eq('id', user.id)
        .single()

    if (!perfil) redirect('/login')

    // Obtener solicitudes según rol
    let query = supabaseAdmin
        .from('solicitudes_renovacion')
        .select(`
            *,
            cliente:cliente_id(id, nombres, dni),
            prestamo:prestamo_id(id, monto, estado, estado_mora, frecuencia),
            asesor:asesor_id(id, nombre_completo),
            supervisor:supervisor_id(id, nombre_completo)
        `)
        .order('created_at', { ascending: false })

    if (perfil.rol === 'asesor') {
        query = query.eq('asesor_id', user.id)
    } else if (perfil.rol === 'supervisor') {
        const { data: asesores } = await supabaseAdmin
            .from('perfiles')
            .select('id')
            .eq('supervisor_id', user.id)
        
        const asesorIds = asesores?.map(a => a.id) || []
        asesorIds.push(user.id)
        query = query.in('asesor_id', asesorIds)
    }

    const { data: solicitudes } = await query

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Solicitud de Renovación
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {perfil.rol === 'asesor' && 'Tus solicitudes de renovación de préstamos'}
                        {perfil.rol === 'supervisor' && 'Solicitudes pendientes de pre-aprobación'}
                        {perfil.rol === 'admin' && 'Todas las solicitudes de renovación'}
                    </p>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                {/* Card 1: Pendientes */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Clock className="w-16 h-16 text-yellow-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Pendientes</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{solicitudes?.filter(s => s.estado_solicitud === 'pendiente_supervision').length || 0}</h2>
                    <div className="mt-2 text-yellow-400 flex items-center gap-1">
                        <span className="bg-yellow-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-yellow-900/50">REVISIÓN</span>
                    </div>
                </div>

                {/* Card 2: Pre-Aprobadas */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Eye className="w-16 h-16 text-blue-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Pre-Aprobadas</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{solicitudes?.filter(s => s.estado_solicitud === 'pre_aprobado').length || 0}</h2>
                    <div className="mt-2 text-blue-400 flex items-center gap-1">
                        <span className="bg-blue-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-900/50">POR APROBAR</span>
                    </div>
                </div>

                {/* Card 3: En Corrección */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-orange-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <AlertCircle className="w-16 h-16 text-orange-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">En Corrección</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{solicitudes?.filter(s => s.estado_solicitud === 'en_correccion').length || 0}</h2>
                    <div className="mt-2 text-orange-400 flex items-center gap-1">
                        <span className="bg-orange-950/50 px-1.5 py-0.5 rounded text-[10px] font-bold border border-orange-900/50">ATENCIÓN</span>
                    </div>
                </div>

                {/* Card 4: Finalizadas */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-500/30 transition-all">
                    <div className="absolute right-0 top-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CheckCircle className="w-16 h-16 text-slate-500" />
                    </div>
                    <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wider mb-1">Finalizadas</p>
                    <h2 className="text-xl md:text-3xl font-bold text-white">{solicitudes?.filter(s => s.estado_solicitud === 'aprobado' || s.estado_solicitud === 'rechazado').length || 0}</h2>
                    <div className="mt-2 text-slate-400 flex items-center gap-1">
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">COMPLETADO</span>
                    </div>
                </div>
            </div>

            {/* Contenido */}
            <RenovacionesSolicitudes 
                solicitudes={solicitudes || []} 
                userRole={perfil.rol}
                userId={user.id}
            />
        </div>
    )
}
