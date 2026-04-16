import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        // Verificar que sea admin
        const { data: perfil } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        }

        let body = {};
        try { body = await request.json(); } catch(e) {}
        
        const { minutos = 15, motivo = 'Sin motivo especificado' } = body as any;

        // Calcular desbloqueo de X minutos desde AHORA
        const desbloqueoHasta = new Date(Date.now() + minutos * 60 * 1000).toISOString()

        const { error } = await supabase
            .from('configuracion_sistema')
            .update({ valor: desbloqueoHasta })
            .eq('clave', 'desbloqueo_hasta')

        if (error) {
            console.error('Error updating unlock time:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Registrar en auditoría existente
        await supabase.from('auditoria').insert({
            tabla: 'configuracion_sistema',
            accion: 'desbloqueo_temporal',
            registro_id: 'desbloqueo_hasta',
            usuario_id: user.id,
            detalles: { accion: `Desbloqueo ${minutos} min`, activo_hasta: desbloqueoHasta, motivo, configurado_por: user.id }
        })

        return NextResponse.json({ success: true, activo_hasta: desbloqueoHasta, minutos, motivo })
    } catch (error: any) {
        console.error('Error in POST /api/configuracion/desbloquear:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
