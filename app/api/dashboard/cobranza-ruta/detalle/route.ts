// app/api/dashboard/cobranza-ruta/detalle/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getTodayPeru, calculateLoanMetrics } from '@/lib/financial-logic'
import type { DetalleMetrica } from '@/components/cobranza-ruta/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabaseAdmin
      .from('perfiles')
      .select('rol, id')
      .eq('id', user.id)
      .single()
    if (!perfil || !['supervisor', 'admin'].includes(perfil.rol)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const asesorId = searchParams.get('asesorId')
    const tipo = searchParams.get('tipo') as 'quedan' | 'cobraron' | 'total' | null
    const fecha = searchParams.get('fecha') || getTodayPeru()

    if (!asesorId || !tipo) {
      return NextResponse.json({ error: 'asesorId y tipo son requeridos' }, { status: 400 })
    }
    if (!['quedan', 'cobraron', 'total'].includes(tipo)) {
      return NextResponse.json({ error: 'tipo debe ser quedan, cobraron o total' }, { status: 400 })
    }

    // Verificar scope: supervisor solo puede ver sus asesores
    if (perfil.rol === 'supervisor') {
      const { data: asesorPerfil } = await supabaseAdmin
        .from('perfiles')
        .select('supervisor_id')
        .eq('id', asesorId)
        .single()
      if (asesorPerfil?.supervisor_id !== user.id) {
        return NextResponse.json({ error: 'Fuera de tu equipo' }, { status: 403 })
      }
    }

    const { data: asesorData } = await supabaseAdmin
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', asesorId)
      .single()

    // Obtener clientes del asesor
    const { data: clientes } = await supabaseAdmin
      .from('clientes')
      .select('id, nombres')
      .eq('asesor_id', asesorId)

    const clienteIds = clientes?.map(c => c.id) || []
    const clienteNombreMap = new Map(clientes?.map(c => [c.id, c.nombres]) || [])

    // Obtener préstamos
    const { data: prestamosRaw } = await supabaseAdmin
      .from('prestamos')
      .select('*')
      .in('cliente_id', clienteIds)
      .in('estado', ['activo', 'legal', 'vencido', 'moroso', 'cpp'])

    const loanIds = prestamosRaw?.map(p => p.id) || []
    let allCuotas: any[] = []
    for (let i = 0; i < loanIds.length; i += 150) {
      const chunk = loanIds.slice(i, i + 150)
      const { data: cuotasChunk, error: chunkError } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('*, pagos(*)')
        .in('prestamo_id', chunk)
      if (chunkError) throw new Error(`Error al cargar cuotas: ${chunkError.message}`)
      if (cuotasChunk) allCuotas.push(...cuotasChunk)
    }
    prestamosRaw?.forEach(p => {
      p.cronograma_cuotas = allCuotas.filter(c => c.prestamo_id === p.id)
    })

    const { data: configSistema } = await supabaseAdmin.from('configuracion_sistema').select('clave, valor')
    const config = {
      umbralCpp: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_cpp_cuotas')?.valor || '4'),
      umbralMoroso: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_moroso_cuotas')?.valor || '7'),
      umbralCppOtros: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_cpp_otros')?.valor || '1'),
      umbralMorosoOtros: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_moroso_otros')?.valor || '2'),
    }

    const detalle: DetalleMetrica = {
      tipo,
      asesor_id: asesorId,
      nombre_asesor: asesorData?.nombre_completo || '',
    }

    if (tipo === 'quedan') {
      detalle.clientes_pendientes = []
      for (const prestamo of prestamosRaw || []) {
        const metrics = calculateLoanMetrics(prestamo, fecha, config)
        const pendiente = metrics.metaTotalHoyYAtrasados - metrics.cobradoTotalHoyYAtrasados
        if (pendiente > 0.01) {
          detalle.clientes_pendientes.push({
            cliente_id: prestamo.cliente_id,
            nombre_cliente: clienteNombreMap.get(prestamo.cliente_id) || 'Cliente',
            monto_pendiente: Math.round(pendiente * 100) / 100,
            cuotas_atrasadas: metrics.cuotasAtrasadas,
            dias_sin_pago: metrics.diasSinPago
          })
        }
      }
      detalle.clientes_pendientes.sort((a, b) => b.monto_pendiente - a.monto_pendiente)

    } else if (tipo === 'cobraron' || tipo === 'total') {
      const cuotaIds = allCuotas.map(c => c.id)
      const { data: pagosHoy } = await supabaseAdmin
        .from('pagos')
        .select('monto_pagado, estado_verificacion, created_at, cuota_id, cuota:cuota_id(numero_cuota, prestamo:prestamo_id(cliente_id))')
        .in('cuota_id', cuotaIds)
        .neq('estado_verificacion', 'rechazado')
        .gte('created_at', `${fecha}T00:00:00-05:00`)
        .lt('created_at', `${fecha}T23:59:59-05:00`)
        .order('created_at', { ascending: false })

      detalle.pagos_cobrados = pagosHoy?.map((p: any) => {
        const clienteId = p.cuota?.prestamo?.cliente_id || ''
        const hora = new Date(p.created_at).toLocaleTimeString('es-PE', {
          timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit'
        })
        return {
          cliente_id: clienteId,
          nombre_cliente: clienteNombreMap.get(clienteId) || 'Cliente',
          monto_cobrado: Number(p.monto_pagado || 0),
          hora_pago: hora,
          estado_verificacion: p.estado_verificacion,
          cuota_numero: p.cuota?.numero_cuota || 0
        }
      }) || []

      if (tipo === 'total') {
        const [yr, mo, dy] = fecha.split('-').map(Number)
        const ayerDate = new Date(yr, mo - 1, dy - 1)
        const ayer = `${ayerDate.getFullYear()}-${String(ayerDate.getMonth() + 1).padStart(2, '0')}-${String(ayerDate.getDate()).padStart(2, '0')}`

        const { data: pagosAyer } = await supabaseAdmin
          .from('pagos')
          .select('monto_pagado')
          .in('cuota_id', cuotaIds)
          .neq('estado_verificacion', 'rechazado')
          .gte('created_at', `${ayer}T00:00:00-05:00`)
          .lt('created_at', `${ayer}T23:59:59-05:00`)

        const totalHoy = detalle.pagos_cobrados?.reduce((s, p) => s + p.monto_cobrado, 0) || 0
        const totalAyer = pagosAyer?.reduce((s, p: any) => s + Number(p.monto_pagado || 0), 0) || 0
        const metaTotal = (prestamosRaw || []).reduce((s, p) => {
          const m = calculateLoanMetrics(p, fecha, config)
          return s + m.cuotaDiaProgramada
        }, 0)

        detalle.resumen_total = {
          total_cobrado_hoy: Math.round(totalHoy * 100) / 100,
          total_cobrado_ayer: Math.round(totalAyer * 100) / 100,
          meta_programada: Math.round(metaTotal * 100) / 100,
          diferencia_porcentaje: totalAyer > 0
            ? Math.round(((totalHoy - totalAyer) / totalAyer) * 100)
            : 0
        }
      }
    }

    return NextResponse.json(detalle, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })

  } catch (error: any) {
    console.error('[COBRANZA-RUTA/DETALLE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
