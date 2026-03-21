import { PaymentWizard } from '@/components/pagos/payment-wizard'
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { BackButton } from '@/components/ui/back-button'

export default async function NewPagoPage() {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();

    // Get current user and role
    const { data: { user } } = await supabase.auth.getUser()
    const { data: perfil } = await supabaseAdmin
        .from('perfiles')
        .select('rol')
        .eq('id', user?.id)
        .single()

    const userRole = perfil?.rol || 'asesor'

    // Fetch Schedule
    const { data: configHorario } = await supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', ['horario_apertura', 'horario_cierre', 'desbloqueo_hasta'])
    
    const systemSchedule = {
        horario_apertura: configHorario?.find(c => c.clave === 'horario_apertura')?.valor || '07:00',
        horario_cierre: configHorario?.find(c => c.clave === 'horario_cierre')?.valor || '20:00',
        desbloqueo_hasta: configHorario?.find(c => c.clave === 'desbloqueo_hasta')?.valor || ''
    }

    return (
        <div className="page-container max-w-lg mx-auto">
        <div className="page-header">
            <div>
                <div className="flex items-center gap-3">
                    <BackButton />
                    <div>
                        <h1 className="page-title">Registrar Nuevo Pago</h1>
                        <p className="page-subtitle">Procesar abono, cuota o liquidación</p>
                    </div>
                </div>
            </div>
        </div>
        <PaymentWizard userRol={userRole as any} systemSchedule={systemSchedule} />
    </div>
    )
}
