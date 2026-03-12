import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Verify Authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Verify Role (Optional: strict RBAC)
    // You can check 'perfiles' here if needed.

    // 3. Parse Body
    const body = await request.json()
    const { dni, nombres, telefono, direccion, asesor_id } = body

    if (!dni || !nombres) {
      return NextResponse.json({ error: 'DNI and Nombres are required' }, { status: 400 })
    }

    // 4. Check for Duplicate DNI (Backend Validation)
    // We use the admin client to check for duplicates globally
    const supabaseAdmin = createAdminClient()
    
    const { data: existing } = await supabaseAdmin
      .from('clientes')
      .select('id')
      .eq('dni', dni)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Cliente con este DNI ya existe' }, { status: 409 })
    }

    // 4.5 Get current user's role to auto-assign asesor if needed
    const { data: currentPerfil } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    // If user is asesor and no asesor_id provided, assign to themselves
    let finalAsesorId = asesor_id
    if (currentPerfil?.rol === 'asesor' && !asesor_id) {
      finalAsesorId = user.id
    }

    // 5. Insert Client
    // Use admin client to bypass RLS for insert
    const { data: newClient, error: insertError } = await supabaseAdmin
      .from('clientes')
      .insert({
        dni,
        nombres,
        telefono,
        direccion,
        asesor_id: finalAsesorId || null,
        estado: 'activo'
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // 6. Audit Log
    // Use admin client for audit as well
    const { error: auditError } = await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'crear_cliente',
        tabla_afectada: 'clientes',
        registro_id: newClient.id,
        detalle: { dni, nombres }
    })
    
    if (auditError) console.error('Audit Error:', auditError)


    return NextResponse.json(newClient)

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Verify Authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Verify Role (Administrative access only)
    const supabaseAdmin = createAdminClient()
    const { data: perfil } = await supabaseAdmin
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfil?.rol !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Solo el administrador puede editar clientes' }, { status: 403 })
    }

    // 3. Parse Body
    const body = await request.json()
    const { 
      id, dni, nombres, telefono, direccion, referencia, 
      giro_negocio, fuentes_ingresos, ingresos_mensuales, motivo_prestamo,
      gps_coordenadas, sector_id, foto_perfil, documentos, estado 
    } = body

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    // 4. Check for Duplicate DNI if DNI is changing
    if (dni) {
      const { data: existing } = await supabaseAdmin
        .from('clientes')
        .select('id')
        .eq('dni', dni)
        .neq('id', id)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'Ya existe otro cliente con este DNI' }, { status: 409 })
      }
    }

    // 5. Update Client الأساسية
    const { data: updatedClient, error: updateError } = await supabaseAdmin
      .from('clientes')
      .update({
        dni,
        nombres,
        telefono,
        direccion,
        referencia,
        sector_id,
        foto_perfil,
        estado,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 6. Update latest Solicitud with evaluation data
    // Buscamos la solicitud más reciente para sincronizar los datos de negocio y GPS
    const { data: latestSol } = await supabaseAdmin
      .from('solicitudes')
      .select('id, documentos_evaluacion')
      .eq('cliente_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestSol) {
      const updateData: any = {}
      if (giro_negocio !== undefined) updateData.giro_negocio = giro_negocio
      if (fuentes_ingresos !== undefined) updateData.fuentes_ingresos = fuentes_ingresos
      if (ingresos_mensuales !== undefined) updateData.ingresos_mensuales = ingresos_mensuales
      if (motivo_prestamo !== undefined) updateData.motivo_prestamo = motivo_prestamo
      if (gps_coordenadas !== undefined) updateData.gps_coordenadas = gps_coordenadas
      
      // Merge documents if provided
      if (documentos && Object.keys(documentos).length > 0) {
        updateData.documentos_evaluacion = {
          ...(latestSol.documentos_evaluacion || {}),
          ...documentos
        }
      }

      if (Object.keys(updateData).length > 0) {
        await supabaseAdmin
          .from('solicitudes')
          .update(updateData)
          .eq('id', latestSol.id)
      }
    }

    // 7. Audit Log
    await supabaseAdmin.from('auditoria').insert({
        usuario_id: user.id,
        accion: 'editar_cliente',
        tabla_afectada: 'clientes',
        registro_id: id,
        detalle: { 
          nombres, 
          dni, 
          changed_fields: Object.keys(body).filter(k => body[k] !== undefined) 
        }
    })

    return NextResponse.json(updatedClient)

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
