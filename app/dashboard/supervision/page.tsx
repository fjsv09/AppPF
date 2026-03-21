import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { SupervisorEfficiency } from "@/components/dashboard/supervisor-efficiency";
import { FinancialSummary } from "@/components/dashboard/financial-summary";

export const dynamic = 'force-dynamic'

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

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div>
                    <div className="flex items-center gap-3">
                        <BackButton />
                        <div>
                            <h1 className="page-title">
                                {userRole === 'admin' ? 'Supervisión Central' : 'Panel de Supervisión'}
                            </h1>
                            <p className="page-subtitle">
                                {userRole === 'admin' ? 'Métricas globales de rendimiento y equipos' : 'Rendimiento de tu equipo de asesores'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Efficiency Machine with Financial Summary injected below filters */}
            <SupervisorEfficiency 
                rol={userRole as 'admin' | 'supervisor'} 
                showActions={false}
                showFinancialSummary={userRole === 'admin'}
            />
        </div>
    )
}
