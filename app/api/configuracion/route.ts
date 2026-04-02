import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
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

        const { clave, valor } = await request.json()

        if (!clave || valor === undefined) {
            return NextResponse.json({ error: 'Clave y valor requeridos' }, { status: 400 })
        }

        let finalValor = valor.toString()

        // Si es desbloqueo, calcular fecha basada en minutos
        if (clave === 'desbloqueo_hasta') {
            const minutos = parseInt(valor)
            if (!isNaN(minutos)) {
                const targetDate = new Date()
                targetDate.setMinutes(targetDate.getMinutes() + minutos)
                finalValor = targetDate.toISOString()
            }
        }

        // Actualizar o insertar configuración
        const { error } = await supabase
            .from('configuracion_sistema')
            .upsert({ 
                clave: clave, 
                valor: finalValor 
            }, { 
                onConflict: 'clave' 
            })

        if (error) {
            console.error('Error updating config:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Registrar en auditoría
        await supabase.from('auditoria').insert({
            tabla: 'configuracion_sistema',
            accion: 'update',
            registro_id: clave,
            usuario_id: user.id,
            detalles: { clave, valor_nuevo: valor }
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error in PATCH /api/configuracion:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const clave = searchParams.get('clave')

        if (!clave) {
            return NextResponse.json({ error: 'Clave requerida' }, { status: 400 })
        }

        const supabase = await createClient()
        const { data, error } = await supabase
            .from('configuracion_sistema')
            .select('valor')
            .eq('clave', clave)
            .single()

        if (error) {
            return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 })
        }

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
