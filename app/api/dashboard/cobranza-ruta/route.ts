// app/api/dashboard/cobranza-ruta/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getTodayPeru, calculateAsesorRutaMetrics } from '@/lib/financial-logic'
import type { AsesorRutaMetrics } from '@/components/cobranza-ruta/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  try {
    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: perfil } = await supabaseAdmin
      .from('perfiles')
      .select('rol, id')
      .eq('id', user.id)
      .single()

    if (!perfil || !['supervisor', 'admin'].includes(perfil.rol)) {
      return NextResponse.json({ error: 'Solo supervisores y admins' }, { status: 403 })
    }

    const today = getTodayPeru()
    const { searchParams } = new URL(request.url)
    const supervisorIdParam = searchParams.get('supervisorId')
    const fechaParam = searchParams.get('fecha') || today

    // 2. Obtener asesores según rol
    let asesoresQuery = supabaseAdmin
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('rol', 'asesor')

    if (perfil.rol === 'supervisor') {
      asesoresQuery = asesoresQuery.eq('supervisor_id', user.id)
    } else if (perfil.rol === 'admin' && supervisorIdParam) {
      asesoresQuery = asesoresQuery.eq('supervisor_id', supervisorIdParam)
    }

    const { data: asesores, error: asesoresError } = await asesoresQuery
    if (asesoresError) throw new Error('Error al obtener asesores: ' + asesoresError.message)
    if (!asesores || asesores.length === 0) {
      return NextResponse.json({ asesores: [], supervisores: [], lastUpdated: new Date().toISOString() })
    }

    const asesorIds = asesores.map(a => a.id)

    // 3. Obtener supervisores (solo para admin - selector de filtros)
    let supervisores: Array<{ id: string; nombre: string }> = []
    if (perfil.rol === 'admin') {
      const { data: sups } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre_completo')
        .eq('rol', 'supervisor')
        .order('nombre_completo')
      supervisores = sups?.map(s => ({ id: s.id, nombre: s.nombre_completo })) || []
    }

    // 4. Obtener clientes de esos asesores
    const { data: clientes } = await supabaseAdmin
      .from('clientes')
      .select('id, asesor_id')
      .in('asesor_id', asesorIds)

    const clienteIds = clientes?.map(c => c.id) || []
    const clienteToAsesorMap = new Map(clientes?.map(c => [c.id, c.asesor_id]) || [])

    if (clienteIds.length === 0) {
      return NextResponse.json({ asesores: asesores.map(a => ({
        asesor_id: a.id, nombre_asesor: a.nombre_completo,
        quedan_por_cobrar: 0, cobraron_en_ruta: 0, total_cobrado: 0,
        meta_programada: 0, porcentaje_meta: 0,
        estado_badge: 'al_dia', tendencia: 'flat', clientes_pendientes_count: 0
      })), supervisores, lastUpdated: new Date().toISOString() })
    }

    // 5. Obtener préstamos activos
    const { data: prestamosRaw } = await supabaseAdmin
      .from('prestamos')
      .select('*, clientes!inner(id, asesor_id)')
      .in('clientes.asesor_id', asesorIds)
      .in('estado', ['activo', 'legal', 'vencido', 'moroso', 'cpp'])

    const loanIds = prestamosRaw?.map(p => p.id) || []

    // 6. Obtener cronograma + pagos en chunks para evitar límite de URL
    let allCuotas: any[] = []
    for (let i = 0; i < loanIds.length; i += 150) {
      const chunk = loanIds.slice(i, i + 150)
      const { data: cuotasChunk } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('*, pagos(*)')
        .in('prestamo_id', chunk)
      if (cuotasChunk) allCuotas.push(...cuotasChunk)
    }

    prestamosRaw?.forEach(p => {
      p.cronograma_cuotas = allCuotas.filter(c => c.prestamo_id === p.id)
    })

    // 7. Obtener total cobrado ayer por asesor (para tendencia)
    const [yr, mo, dy] = fechaParam.split('-').map(Number)
    const ayerDate = new Date(yr, mo - 1, dy - 1)
    const ayer = `${ayerDate.getFullYear()}-${String(ayerDate.getMonth() + 1).padStart(2, '0')}-${String(ayerDate.getDate()).padStart(2, '0')}`

    const { data: pagosAyer } = await supabaseAdmin
      .from('pagos')
      .select('monto_pagado, cuota:cuota_id(prestamo:prestamo_id(clientes!inner(asesor_id)))')
      .eq('estado_verificacion', 'aprobado')
      .gte('created_at', `${ayer}T00:00:00-05:00`)
      .lt('created_at', `${fechaParam}T00:00:00-05:00`)

    const cobradoAyerPorAsesor = new Map<string, number>()
    pagosAyer?.forEach((p: any) => {
      const asesorId = p.cuota?.prestamo?.clientes?.asesor_id
      if (!asesorId) return
      cobradoAyerPorAsesor.set(asesorId, (cobradoAyerPorAsesor.get(asesorId) || 0) + Number(p.monto_pagado || 0))
    })

    // 8. Obtener configuración del sistema
    const { data: configSistema } = await supabaseAdmin
      .from('configuracion_sistema')
      .select('clave, valor')
    const config = {
      umbralCpp: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_cpp_cuotas')?.valor || '4'),
      umbralMoroso: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_moroso_cuotas')?.valor || '7'),
      umbralCppOtros: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_cpp_otros')?.valor || '1'),
      umbralMorosoOtros: parseInt(configSistema?.find((c: any) => c.clave === 'umbral_moroso_otros')?.valor || '2'),
    }

    // 9. Agrupar préstamos por asesor y calcular métricas
    const prestamosPorAsesor = new Map<string, any[]>()
    asesores.forEach(a => prestamosPorAsesor.set(a.id, []))
    prestamosRaw?.forEach(p => {
      const asesorId = clienteToAsesorMap.get(p.cliente_id)
      if (asesorId && prestamosPorAsesor.has(asesorId)) {
        prestamosPorAsesor.get(asesorId)!.push(p)
      }
    })

    const resultado: AsesorRutaMetrics[] = asesores.map(asesor => {
      const prestamosAsesor = prestamosPorAsesor.get(asesor.id) || []
      const cobradoAyer = cobradoAyerPorAsesor.get(asesor.id) || 0
      const calc = calculateAsesorRutaMetrics(prestamosAsesor, fechaParam, cobradoAyer, config)
      return {
        asesor_id: asesor.id,
        nombre_asesor: asesor.nombre_completo,
        ...calc
      }
    })

    // Ordenar: críticos primero
    resultado.sort((a, b) => {
      const order = { critico: 0, riesgo: 1, al_dia: 2 }
      return order[a.estado_badge] - order[b.estado_badge]
    })

    return NextResponse.json({
      asesores: resultado,
      supervisores,
      lastUpdated: new Date().toISOString()
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })

  } catch (error: any) {
    console.error('[COBRANZA-RUTA]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
