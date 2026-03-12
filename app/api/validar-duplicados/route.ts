import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

// POST - Validar DNI y teléfono duplicados
export async function POST(request: Request) {
    const supabaseAdmin = createAdminClient()

    try {
        const body = await request.json()
        const { dni, telefono } = body

        if (!dni && !telefono) {
            return NextResponse.json({ error: 'Se requiere DNI o teléfono para validar' }, { status: 400 })
        }

        let dniExiste = false
        let telefonoExiste = false
        let dniCliente = ''
        let telefonoCliente = ''

        // Validar DNI en clientes
        if (dni) {
            const { data: clienteDni } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres')
                .eq('dni', dni)
                .limit(1)
                .single()

            if (clienteDni) {
                dniExiste = true
                dniCliente = clienteDni.nombres
            } else {
                // Validar DNI en solicitudes pendientes/en proceso
                const { data: solicitudDni } = await supabaseAdmin
                    .from('solicitudes')
                    .select('id, prospecto_nombres, estado_solicitud')
                    .eq('prospecto_dni', dni)
                    .not('estado_solicitud', 'eq', 'rechazado')
                    .limit(1)
                    .single()

                if (solicitudDni) {
                    dniExiste = true
                    dniCliente = `Solicitud de ${solicitudDni.prospecto_nombres}`
                }
            }
        }

        // Validar teléfono en clientes
        if (telefono) {
            const { data: clienteTel } = await supabaseAdmin
                .from('clientes')
                .select('id, nombres')
                .eq('telefono', telefono)
                .limit(1)
                .single()

            if (clienteTel) {
                telefonoExiste = true
                telefonoCliente = clienteTel.nombres
            } else {
                // Validar teléfono en solicitudes pendientes/en proceso
                const { data: solicitudTel } = await supabaseAdmin
                    .from('solicitudes')
                    .select('id, prospecto_nombres, estado_solicitud')
                    .eq('prospecto_telefono', telefono)
                    .not('estado_solicitud', 'eq', 'rechazado')
                    .limit(1)
                    .single()

                if (solicitudTel) {
                    telefonoExiste = true
                    telefonoCliente = `Solicitud de ${solicitudTel.prospecto_nombres}`
                }
            }
        }

        return NextResponse.json({
            dniExiste,
            dniCliente,
            telefonoExiste,
            telefonoCliente
        })

    } catch (e: any) {
        console.error('Error validating duplicates:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
