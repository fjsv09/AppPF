# Panel de Cobranza en Ruta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear `/dashboard/cobranza-ruta` — panel de control operativo en tiempo real para supervisores/admins que muestra el avance de cobranza diaria de cada asesor con drill-down por métrica.

**Architecture:** API route GET `/api/dashboard/cobranza-ruta` agrega métricas por asesor (reutilizando `calculateLoanMetrics` de `lib/financial-logic.ts`). Componente cliente `CobranzaRutaClient` maneja auto-refresh cada 45s. Al click en métrica, endpoint separado `/api/dashboard/cobranza-ruta/detalle` retorna lista detallada para sidebar (desktop) o modal (mobile). El rol del usuario determina qué asesores ve: supervisor → su equipo, admin → todo con filtros.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (createAdminClient), shadcn/ui (Sheet, Dialog, Badge, Skeleton), Tailwind CSS, Lucide icons.

---

### Task 1: Tipos compartidos

**Files:**
- Create: `components/cobranza-ruta/types.ts`

- [ ] **Step 1: Crear archivo de tipos**

```typescript
// components/cobranza-ruta/types.ts

export interface AsesorRutaMetrics {
  asesor_id: string
  nombre_asesor: string
  quedan_por_cobrar: number      // S/. pendiente de cuotas hoy+atrasados
  cobraron_en_ruta: number       // S/. cobrado hoy que aplica a cuotas de ruta
  total_cobrado: number          // S/. total cobrado hoy (todos los pagos)
  meta_programada: number        // S/. cuota total programada para hoy
  porcentaje_meta: number        // 0-150 (puede superar 100%)
  estado_badge: 'critico' | 'riesgo' | 'al_dia'
  tendencia: 'up' | 'down' | 'flat'
  clientes_pendientes_count: number
}

export interface ClientePendiente {
  cliente_id: string
  nombre_cliente: string
  monto_pendiente: number
  cuotas_atrasadas: number
  dias_sin_pago: number
}

export interface PagoCobrado {
  cliente_id: string
  nombre_cliente: string
  monto_cobrado: number
  hora_pago: string              // HH:MM (Lima time)
  estado_verificacion: 'pendiente' | 'aprobado' | 'rechazado'
  cuota_numero: number
}

export interface DetalleMetrica {
  tipo: 'quedan' | 'cobraron' | 'total'
  asesor_id: string
  nombre_asesor: string
  clientes_pendientes?: ClientePendiente[]
  pagos_cobrados?: PagoCobrado[]
  resumen_total?: {
    total_cobrado_hoy: number
    total_cobrado_ayer: number
    meta_programada: number
    diferencia_porcentaje: number
  }
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Resultado esperado: Sin errores relacionados con este archivo.

- [ ] **Step 3: Commit**

```bash
git add components/cobranza-ruta/types.ts
git commit -m "feat: tipos compartidos para panel de cobranza en ruta"
```

---

### Task 2: Función `calculateAsesorRutaMetrics` en lib/financial-logic.ts

**Files:**
- Modify: `lib/financial-logic.ts` (agregar al final del archivo)

Esta función agrega las métricas de cobranza en ruta para UN asesor dado sus préstamos, cronograma y pagos ya cargados. Es pura (sin llamadas a BD) para poder reutilizarse en otros módulos.

- [ ] **Step 1: Agregar la función al final de `lib/financial-logic.ts`**

Abrir `lib/financial-logic.ts` y agregar al final del archivo (después de todas las funciones existentes):

```typescript
// ─── Cobranza en Ruta ─────────────────────────────────────────────────────────

export interface AsesorRutaCalculation {
  quedan_por_cobrar: number
  cobraron_en_ruta: number
  total_cobrado: number
  meta_programada: number
  porcentaje_meta: number
  estado_badge: 'critico' | 'riesgo' | 'al_dia'
  tendencia: 'up' | 'down' | 'flat'
  clientes_pendientes_count: number
}

/**
 * Calcula métricas de cobranza en ruta para un asesor dado sus préstamos activos.
 * @param prestamos - Array de préstamos del asesor, cada uno con cronograma_cuotas y pagos anidados
 * @param today - Fecha en formato YYYY-MM-DD (usar getTodayPeru())
 * @param totalCobradoAyer - Suma de pagos del mismo asesor en la fecha anterior (para tendencia)
 * @param config - Configuración del sistema (thresholds)
 */
export function calculateAsesorRutaMetrics(
  prestamos: any[],
  today: string,
  totalCobradoAyer: number,
  config: { umbralCpp?: number; umbralMoroso?: number; umbralCppOtros?: number; umbralMorosoOtros?: number; renovacionMinPagado?: number } = {}
): AsesorRutaCalculation {
  let quedan_por_cobrar = 0
  let cobraron_en_ruta = 0
  let total_cobrado = 0
  let meta_programada = 0
  let clientes_pendientes_count = 0

  const clientesConDeudaPendiente = new Set<string>()

  for (const prestamo of prestamos) {
    if (!['activo', 'legal', 'vencido', 'moroso', 'cpp'].includes(prestamo.estado)) continue

    const cronograma = prestamo.cronograma_cuotas || []
    const pagos = cronograma.flatMap((c: any) => c.pagos || [])
    const metrics = calculateLoanMetrics(prestamo, today, config)

    // Cuánto falta cobrar hoy (cuotas de hoy + atrasadas - lo ya pagado)
    quedan_por_cobrar += Math.max(0, metrics.metaTotalHoyYAtrasados - metrics.cobradoTotalHoyYAtrasados)

    // Lo cobrado en ruta (cuotas de hoy + atrasadas pagadas hoy)
    cobraron_en_ruta += metrics.cobradoRutaHoy

    // Lo cobrado en total hoy (incluyendo adelantos)
    total_cobrado += metrics.cobradoHoy

    // Meta del día (cuota programada para hoy)
    meta_programada += metrics.cuotaDiaProgramada

    // Clientes con deuda pendiente
    if (metrics.metaTotalHoyYAtrasados - metrics.cobradoTotalHoyYAtrasados > 0.01) {
      clientesConDeudaPendiente.add(prestamo.cliente_id)
    }
  }

  clientes_pendientes_count = clientesConDeudaPendiente.size

  // Porcentaje de meta (vs cuota programada de hoy)
  const porcentaje_meta = meta_programada > 0
    ? Math.min(150, (cobraron_en_ruta / meta_programada) * 100)
    : total_cobrado > 0 ? 100 : 0

  // Estado badge basado en porcentaje de meta
  let estado_badge: 'critico' | 'riesgo' | 'al_dia'
  if (porcentaje_meta >= 85) estado_badge = 'al_dia'
  else if (porcentaje_meta >= 60) estado_badge = 'riesgo'
  else estado_badge = 'critico'

  // Tendencia vs ayer (misma lógica de comparación)
  let tendencia: 'up' | 'down' | 'flat'
  const diff = total_cobrado - totalCobradoAyer
  if (Math.abs(diff) < 0.01) tendencia = 'flat'
  else if (diff > 0) tendencia = 'up'
  else tendencia = 'down'

  return {
    quedan_por_cobrar: Math.round(quedan_por_cobrar * 100) / 100,
    cobraron_en_ruta: Math.round(cobraron_en_ruta * 100) / 100,
    total_cobrado: Math.round(total_cobrado * 100) / 100,
    meta_programada: Math.round(meta_programada * 100) / 100,
    porcentaje_meta: Math.round(porcentaje_meta * 10) / 10,
    estado_badge,
    tendencia,
    clientes_pendientes_count
  }
}
```

- [ ] **Step 2: Verificar que compila sin errores**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Resultado esperado: Sin errores en `lib/financial-logic.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/financial-logic.ts
git commit -m "feat: calculateAsesorRutaMetrics en financial-logic"
```

---

### Task 3: API endpoint principal `/api/dashboard/cobranza-ruta`

**Files:**
- Create: `app/api/dashboard/cobranza-ruta/route.ts`

Este endpoint agrega las métricas de todos los asesores del equipo para la tabla principal. Sigue el mismo patrón que `app/api/dashboard/supervisor/stats/route.ts`.

- [ ] **Step 1: Crear el archivo**

```typescript
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
    const yesterday = new Date(fechaParam + 'T00:00:00-05:00')
    yesterday.setDate(yesterday.getDate() - 1)
    const ayer = yesterday.toISOString().split('T')[0]

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
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Resultado esperado: Sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/cobranza-ruta/route.ts
git commit -m "feat: API endpoint GET /api/dashboard/cobranza-ruta"
```

---

### Task 4: API endpoint de detalle (drill-down)

**Files:**
- Create: `app/api/dashboard/cobranza-ruta/detalle/route.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
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
      const { data: cuotasChunk } = await supabaseAdmin
        .from('cronograma_cuotas')
        .select('*, pagos(*)')
        .in('prestamo_id', chunk)
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
      // Pagos de hoy en cuotas de este asesor
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

      // Para 'total': agregar resumen comparativo con ayer
      if (tipo === 'total') {
        const yesterday = new Date(`${fecha}T00:00:00-05:00`)
        yesterday.setDate(yesterday.getDate() - 1)
        const ayer = yesterday.toISOString().split('T')[0]

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
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/cobranza-ruta/detalle/route.ts
git commit -m "feat: API drill-down GET /api/dashboard/cobranza-ruta/detalle"
```

---

### Task 5: Página server y loading state

**Files:**
- Create: `app/dashboard/cobranza-ruta/page.tsx`
- Create: `app/dashboard/cobranza-ruta/loading.tsx`

- [ ] **Step 1: Crear loading state**

```typescript
// app/dashboard/cobranza-ruta/loading.tsx
import { TableSkeleton } from '@/components/ui/table-skeleton'

export default function Loading() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="h-8 w-64 bg-white/10 rounded animate-pulse" />
        <div className="h-4 w-48 bg-white/5 rounded animate-pulse mt-2" />
      </div>
      <TableSkeleton />
    </div>
  )
}
```

- [ ] **Step 2: Verificar que existe `TableSkeleton`**

```bash
grep -r "TableSkeleton" components/ui/ --include="*.tsx" -l
```

Si no existe, usar en su lugar:

```typescript
// app/dashboard/cobranza-ruta/loading.tsx
export default function Loading() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="h-8 w-64 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crear page.tsx (server component)**

```typescript
// app/dashboard/cobranza-ruta/page.tsx
import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { BackButton } from '@/components/ui/back-button'
import { CobranzaRutaClient } from '@/components/cobranza-ruta/cobranza-ruta-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cobranza en Ruta'
}

export default async function CobranzaRutaPage() {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .single()

  const userRole = perfil?.rol

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
      <div className="page-header">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="page-title">Cobranza en Ruta</h1>
            <p className="page-subtitle">Control operativo en tiempo real del avance de cobranza diaria</p>
          </div>
        </div>
      </div>
      <CobranzaRutaClient userRole={userRole as 'supervisor' | 'admin'} />
    </div>
  )
}
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/cobranza-ruta/page.tsx app/dashboard/cobranza-ruta/loading.tsx
git commit -m "feat: página /dashboard/cobranza-ruta"
```

---

### Task 6: Componente `AsesorMetricsDetails` (sidebar + modal)

**Files:**
- Create: `components/cobranza-ruta/asesor-metrics-details.tsx`

Este componente recibe los datos de detalle y los muestra. Es usado por `CobranzaRutaClient` en modo sidebar (desktop) o modal (mobile).

- [ ] **Step 1: Crear el componente**

```typescript
// components/cobranza-ruta/asesor-metrics-details.tsx
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Clock, TrendingUp, TrendingDown, Minus, Users, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { DetalleMetrica } from './types'
import { cn } from '@/lib/utils'

interface Props {
  detalle: DetalleMetrica | null
  loading: boolean
}

function formatSoles(n: number) {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AsesorMetricsDetails({ detalle, loading }: Props) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (!detalle) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
        <Users className="w-8 h-8 opacity-40" />
        <p className="text-sm">Selecciona una métrica para ver detalles</p>
      </div>
    )
  }

  const titulo = {
    quedan: 'Clientes con Deuda Pendiente',
    cobraron: 'Pagos Cobrados en Ruta',
    total: 'Resumen Total del Día'
  }[detalle.tipo]

  return (
    <div className="flex flex-col h-full">
      {/* Header del detalle */}
      <div className="p-4 border-b border-white/10">
        <p className="text-xs text-slate-400 uppercase tracking-wider">{detalle.nombre_asesor}</p>
        <h3 className="text-white font-semibold mt-0.5">{titulo}</h3>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">

        {/* Tipo: quedan */}
        {detalle.tipo === 'quedan' && detalle.clientes_pendientes && (
          detalle.clientes_pendientes.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="text-sm">¡Sin deuda pendiente!</p>
            </div>
          ) : (
            detalle.clientes_pendientes.map((c, i) => (
              <div key={c.cliente_id + i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{c.nombre_cliente}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {c.cuotas_atrasadas > 0 ? `${c.cuotas_atrasadas} cuota${c.cuotas_atrasadas > 1 ? 's' : ''} atrasada${c.cuotas_atrasadas > 1 ? 's' : ''}` : 'Cuota actual'}
                    {c.dias_sin_pago > 0 && ` · ${c.dias_sin_pago}d sin pago`}
                  </p>
                </div>
                <span className={cn(
                  "text-sm font-bold ml-3 shrink-0",
                  c.dias_sin_pago > 7 ? "text-red-400" : c.dias_sin_pago > 3 ? "text-amber-400" : "text-white"
                )}>
                  {formatSoles(c.monto_pendiente)}
                </span>
              </div>
            ))
          )
        )}

        {/* Tipo: cobraron */}
        {detalle.tipo === 'cobraron' && detalle.pagos_cobrados && (
          detalle.pagos_cobrados.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-500 gap-2">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm">Sin cobros registrados</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-slate-400 mb-3">
                {detalle.pagos_cobrados.length} pago{detalle.pagos_cobrados.length > 1 ? 's' : ''} registrado{detalle.pagos_cobrados.length > 1 ? 's' : ''}
              </div>
              {detalle.pagos_cobrados.map((p, i) => (
                <div key={p.cliente_id + i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{p.nombre_cliente}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-400">{p.hora_pago}</span>
                      <Badge variant={p.estado_verificacion === 'aprobado' ? 'default' : 'secondary'} className="text-[10px] h-4">
                        {p.estado_verificacion === 'aprobado' ? 'Verificado' : 'Pendiente'}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 ml-3 shrink-0">
                    +{formatSoles(p.monto_cobrado)}
                  </span>
                </div>
              ))}
            </>
          )
        )}

        {/* Tipo: total */}
        {detalle.tipo === 'total' && detalle.resumen_total && (
          <div className="space-y-4">
            {/* Comparativo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-400">Cobrado Hoy</p>
                <p className="text-lg font-bold text-white mt-1">{formatSoles(detalle.resumen_total.total_cobrado_hoy)}</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-400">Cobrado Ayer</p>
                <p className="text-lg font-bold text-slate-300 mt-1">{formatSoles(detalle.resumen_total.total_cobrado_ayer)}</p>
              </div>
            </div>

            {/* Meta */}
            <div className="p-3 rounded-lg bg-white/5">
              <p className="text-xs text-slate-400">Meta Programada Hoy</p>
              <p className="text-lg font-bold text-white mt-1">{formatSoles(detalle.resumen_total.meta_programada)}</p>
            </div>

            {/* Diferencia vs ayer */}
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg",
              detalle.resumen_total.diferencia_porcentaje > 0 ? "bg-emerald-900/20" :
              detalle.resumen_total.diferencia_porcentaje < 0 ? "bg-red-900/20" : "bg-white/5"
            )}>
              {detalle.resumen_total.diferencia_porcentaje > 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : detalle.resumen_total.diferencia_porcentaje < 0 ? (
                <TrendingDown className="w-5 h-5 text-red-400" />
              ) : (
                <Minus className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <p className="text-sm font-medium text-white">
                  {detalle.resumen_total.diferencia_porcentaje > 0 ? '+' : ''}{detalle.resumen_total.diferencia_porcentaje}% vs ayer
                </p>
                <p className="text-xs text-slate-400">A la misma hora</p>
              </div>
            </div>

            {/* Pagos individuales */}
            {detalle.pagos_cobrados && detalle.pagos_cobrados.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Detalle de Pagos</p>
                {detalle.pagos_cobrados.map((p, i) => (
                  <div key={p.cliente_id + i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{p.nombre_cliente}</p>
                      <p className="text-xs text-slate-400">{p.hora_pago}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400 ml-2">{formatSoles(p.monto_cobrado)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 3: Commit**

```bash
git add components/cobranza-ruta/asesor-metrics-details.tsx
git commit -m "feat: componente AsesorMetricsDetails para drill-down de métricas"
```

---

### Task 7: Componente `CobranzaTable`

**Files:**
- Create: `components/cobranza-ruta/cobranza-table.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// components/cobranza-ruta/cobranza-table.tsx
'use client'

import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AsesorRutaMetrics } from './types'

interface Props {
  asesores: AsesorRutaMetrics[]
  selectedAsesorId: string | null
  selectedMetric: 'quedan' | 'cobraron' | 'total' | null
  onMetricClick: (asesorId: string, metric: 'quedan' | 'cobraron' | 'total') => void
}

function formatSoles(n: number) {
  if (n >= 1000) return `S/ ${(n / 1000).toFixed(1)}K`
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function BadgeEstado({ estado }: { estado: AsesorRutaMetrics['estado_badge'] }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      estado === 'al_dia' && "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50",
      estado === 'riesgo' && "bg-amber-900/40 text-amber-400 border border-amber-800/50",
      estado === 'critico' && "bg-red-900/40 text-red-400 border border-red-800/50"
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full mr-1.5",
        estado === 'al_dia' && "bg-emerald-400",
        estado === 'riesgo' && "bg-amber-400",
        estado === 'critico' && "bg-red-400 animate-pulse"
      )} />
      {estado === 'al_dia' ? 'Al día' : estado === 'riesgo' ? 'En riesgo' : 'Crítico'}
    </span>
  )
}

function TendenciaIcon({ tendencia }: { tendencia: AsesorRutaMetrics['tendencia'] }) {
  if (tendencia === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
  if (tendencia === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />
  return <Minus className="w-3.5 h-3.5 text-slate-500" />
}

function MetricCell({ value, metric, asesorId, selectedAsesorId, selectedMetric, onClick }: {
  value: string
  metric: 'quedan' | 'cobraron' | 'total'
  asesorId: string
  selectedAsesorId: string | null
  selectedMetric: 'quedan' | 'cobraron' | 'total' | null
  onClick: () => void
}) {
  const isSelected = selectedAsesorId === asesorId && selectedMetric === metric
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-sm font-mono font-semibold px-2 py-1 rounded transition-all",
        "hover:bg-white/10 hover:text-white cursor-pointer text-right w-full",
        isSelected ? "bg-blue-900/40 text-blue-300 ring-1 ring-blue-700/50" : "text-slate-200"
      )}
    >
      {value}
    </button>
  )
}

export function CobranzaTable({ asesores, selectedAsesorId, selectedMetric, onMetricClick }: Props) {
  if (asesores.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        Sin asesores disponibles
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {/* Desktop table */}
      <table className="w-full hidden md:table">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Asesor</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Quedan</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Cobraron</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Total Hoy</th>
            <th className="text-center text-xs text-slate-400 uppercase tracking-wider py-3 px-4">Estado</th>
            <th className="text-center text-xs text-slate-400 uppercase tracking-wider py-3 px-2">Tend.</th>
            <th className="text-right text-xs text-slate-400 uppercase tracking-wider py-3 px-4">% Meta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {asesores.map(asesor => (
            <tr
              key={asesor.asesor_id}
              className={cn(
                "hover:bg-white/5 transition-colors",
                selectedAsesorId === asesor.asesor_id && "bg-white/5"
              )}
            >
              <td className="py-3 px-4">
                <p className="text-sm font-medium text-white">{asesor.nombre_asesor}</p>
                {asesor.clientes_pendientes_count > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">{asesor.clientes_pendientes_count} con deuda</p>
                )}
              </td>
              <td className="py-3 px-4">
                <MetricCell
                  value={formatSoles(asesor.quedan_por_cobrar)}
                  metric="quedan"
                  asesorId={asesor.asesor_id}
                  selectedAsesorId={selectedAsesorId}
                  selectedMetric={selectedMetric}
                  onClick={() => onMetricClick(asesor.asesor_id, 'quedan')}
                />
              </td>
              <td className="py-3 px-4">
                <MetricCell
                  value={formatSoles(asesor.cobraron_en_ruta)}
                  metric="cobraron"
                  asesorId={asesor.asesor_id}
                  selectedAsesorId={selectedAsesorId}
                  selectedMetric={selectedMetric}
                  onClick={() => onMetricClick(asesor.asesor_id, 'cobraron')}
                />
              </td>
              <td className="py-3 px-4">
                <MetricCell
                  value={formatSoles(asesor.total_cobrado)}
                  metric="total"
                  asesorId={asesor.asesor_id}
                  selectedAsesorId={selectedAsesorId}
                  selectedMetric={selectedMetric}
                  onClick={() => onMetricClick(asesor.asesor_id, 'total')}
                />
              </td>
              <td className="py-3 px-4 text-center">
                <BadgeEstado estado={asesor.estado_badge} />
              </td>
              <td className="py-3 px-2 text-center">
                <TendenciaIcon tendencia={asesor.tendencia} />
              </td>
              <td className="py-3 px-4 text-right">
                <span className={cn(
                  "text-sm font-bold",
                  asesor.porcentaje_meta >= 85 ? "text-emerald-400" :
                  asesor.porcentaje_meta >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {asesor.porcentaje_meta.toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: lista compacta */}
      <div className="md:hidden space-y-2">
        {asesores.map(asesor => (
          <div
            key={asesor.asesor_id}
            className={cn(
              "p-3 rounded-lg bg-white/5 border border-white/10",
              selectedAsesorId === asesor.asesor_id && "border-blue-700/50 bg-blue-900/10"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white">{asesor.nombre_asesor}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <BadgeEstado estado={asesor.estado_badge} />
                  <TendenciaIcon tendencia={asesor.tendencia} />
                </div>
              </div>
              <button
                onClick={() => onMetricClick(asesor.asesor_id, 'total')}
                className="text-right"
              >
                <p className="text-lg font-bold text-white">{formatSoles(asesor.total_cobrado)}</p>
                <p className={cn(
                  "text-xs font-semibold",
                  asesor.porcentaje_meta >= 85 ? "text-emerald-400" :
                  asesor.porcentaje_meta >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {asesor.porcentaje_meta.toFixed(0)}% de meta
                </p>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onMetricClick(asesor.asesor_id, 'quedan')}
                className={cn(
                  "p-2 rounded bg-white/5 hover:bg-white/10 text-left transition-colors",
                  selectedAsesorId === asesor.asesor_id && selectedMetric === 'quedan' && "bg-blue-900/30 ring-1 ring-blue-700/50"
                )}
              >
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Quedan</p>
                <p className="text-sm font-semibold text-white">{formatSoles(asesor.quedan_por_cobrar)}</p>
              </button>
              <button
                onClick={() => onMetricClick(asesor.asesor_id, 'cobraron')}
                className={cn(
                  "p-2 rounded bg-white/5 hover:bg-white/10 text-left transition-colors",
                  selectedAsesorId === asesor.asesor_id && selectedMetric === 'cobraron' && "bg-blue-900/30 ring-1 ring-blue-700/50"
                )}
              >
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cobraron</p>
                <p className="text-sm font-semibold text-emerald-400">{formatSoles(asesor.cobraron_en_ruta)}</p>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 3: Commit**

```bash
git add components/cobranza-ruta/cobranza-table.tsx
git commit -m "feat: componente CobranzaTable con tabla desktop y lista mobile"
```

---

### Task 8: Componente principal `CobranzaRutaClient`

**Files:**
- Create: `components/cobranza-ruta/cobranza-ruta-client.tsx`

Este es el orquestador: maneja fetch, auto-refresh, estado de selección, y renderiza tabla + sidebar (desktop) o modal (mobile).

- [ ] **Step 1: Crear el componente**

```typescript
// components/cobranza-ruta/cobranza-ruta-client.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Clock, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CobranzaTable } from './cobranza-table'
import { AsesorMetricsDetails } from './asesor-metrics-details'
import type { AsesorRutaMetrics, DetalleMetrica } from './types'

interface Props {
  userRole: 'supervisor' | 'admin'
}

const AUTO_REFRESH_MS = 45_000

export function CobranzaRutaClient({ userRole }: Props) {
  const [asesores, setAsesores] = useState<AsesorRutaMetrics[]>([])
  const [supervisores, setSupervisores] = useState<Array<{ id: string; nombre: string }>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsSince, setSecondsSince] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null)

  // Drill-down state
  const [selectedAsesorId, setSelectedAsesorId] = useState<string | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<'quedan' | 'cobraron' | 'total' | null>(null)
  const [detalle, setDetalle] = useState<DetalleMetrica | null>(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Detectar si es desktop
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Contador de segundos desde última actualización
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated) {
        setSecondsSince(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lastUpdated])

  const fetchAsesores = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (selectedSupervisorId) params.append('supervisorId', selectedSupervisorId)
      const res = await fetch(`/api/dashboard/cobranza-ruta?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      const data = await res.json()
      setAsesores(data.asesores || [])
      if (data.supervisores?.length > 0) setSupervisores(data.supervisores)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedSupervisorId])

  // Auto-refresh
  useEffect(() => {
    fetchAsesores()
    timerRef.current = setInterval(() => fetchAsesores(), AUTO_REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchAsesores])

  const fetchDetalle = useCallback(async (asesorId: string, metric: 'quedan' | 'cobraron' | 'total') => {
    setDetalleLoading(true)
    try {
      const params = new URLSearchParams({ asesorId, tipo: metric })
      const res = await fetch(`/api/dashboard/cobranza-ruta/detalle?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar detalle')
      const data = await res.json()
      setDetalle(data)
    } catch (e) {
      setDetalle(null)
    } finally {
      setDetalleLoading(false)
    }
  }, [])

  const handleMetricClick = (asesorId: string, metric: 'quedan' | 'cobraron' | 'total') => {
    // Toggle: cerrar si ya estaba seleccionado
    if (selectedAsesorId === asesorId && selectedMetric === metric) {
      setSelectedAsesorId(null)
      setSelectedMetric(null)
      setIsSidebarOpen(false)
      setIsModalOpen(false)
      return
    }
    setSelectedAsesorId(asesorId)
    setSelectedMetric(metric)
    fetchDetalle(asesorId, metric)
    if (isDesktop) setIsSidebarOpen(true)
    else setIsModalOpen(true)
  }

  const handleClose = () => {
    setIsSidebarOpen(false)
    setIsModalOpen(false)
    setSelectedAsesorId(null)
    setSelectedMetric(null)
    setDetalle(null)
  }

  const selectedAsesor = asesores.find(a => a.asesor_id === selectedAsesorId)

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Selector de supervisor (solo admin) */}
          {userRole === 'admin' && supervisores.length > 0 && (
            <div className="relative">
              <select
                value={selectedSupervisorId || ''}
                onChange={e => setSelectedSupervisorId(e.target.value || null)}
                className="appearance-none bg-white/10 text-white text-sm rounded-lg px-3 py-2 pr-8 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">Todos los supervisores</option>
                {supervisores.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Hace {secondsSince}s</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchAsesores(true)}
            disabled={refreshing}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className={cn("w-4 h-4 mr-1.5", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Layout: tabla + sidebar en desktop */}
      <div className={cn("flex gap-4", isSidebarOpen && isDesktop ? "flex-row" : "flex-col")}>

        {/* Tabla principal */}
        <div className={cn("flex-1 min-w-0", isSidebarOpen && isDesktop ? "w-[65%]" : "w-full")}>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <CobranzaTable
              asesores={asesores}
              selectedAsesorId={selectedAsesorId}
              selectedMetric={selectedMetric}
              onMetricClick={handleMetricClick}
            />
          )}
        </div>

        {/* Sidebar (desktop) */}
        {isSidebarOpen && isDesktop && (
          <div className="w-[35%] min-w-[280px] max-w-[380px] rounded-xl bg-slate-900/60 border border-white/10 flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="text-xs text-slate-400 uppercase tracking-wider">
                {selectedAsesor?.nombre_asesor || 'Detalles'}
              </span>
              <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AsesorMetricsDetails detalle={detalle} loading={detalleLoading} />
            </div>
          </div>
        )}
      </div>

      {/* Modal (mobile) */}
      <Dialog open={isModalOpen} onOpenChange={open => { if (!open) handleClose() }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-white/10 shrink-0">
            <DialogTitle className="text-sm text-white">
              {selectedAsesor?.nombre_asesor} — {selectedMetric === 'quedan' ? 'Quedan por Cobrar' : selectedMetric === 'cobraron' ? 'Cobraron en Ruta' : 'Total Cobrado'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <AsesorMetricsDetails detalle={detalle} loading={detalleLoading} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 3: Commit**

```bash
git add components/cobranza-ruta/cobranza-ruta-client.tsx
git commit -m "feat: componente principal CobranzaRutaClient con auto-refresh y drill-down"
```

---

### Task 9: Agregar link al nav del dashboard

**Files:**
- Modify: `components/dashboard-nav.tsx`

- [ ] **Step 1: Agregar el import del ícono si no existe**

En `components/dashboard-nav.tsx`, buscar la línea de imports de lucide-react. Verificar si `MapPin` o `Route` están importados. Si no, agregar `Route`:

```typescript
// Agregar 'Route' a los imports de lucide-react existentes
import { ..., Route } from 'lucide-react'
```

- [ ] **Step 2: Agregar el link al array de links**

Buscar la línea:
```typescript
{ href: '/dashboard/supervision', label: 'Supervisión', icon: ChartBar, roles: ['admin', 'supervisor'], category: 'Gestión' },
```

Agregar DESPUÉS de esa línea:
```typescript
{ href: '/dashboard/cobranza-ruta', label: 'Cobranza en Ruta', icon: Route, roles: ['admin', 'supervisor'], category: 'Gestión' },
```

- [ ] **Step 3: Verificar compilación y lint**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
npm run lint 2>&1 | grep -v "node_modules" | head -20
```

Resultado esperado: Sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard-nav.tsx
git commit -m "feat: link de Cobranza en Ruta en nav del dashboard"
```

---

### Task 10: Build final y verificación

- [ ] **Step 1: Build completo**

```bash
npm run build 2>&1 | tail -30
```

Resultado esperado: `✓ Compiled successfully` sin errores. Si hay warnings de TypeScript, corregirlos.

- [ ] **Step 2: Arrancar dev server y verificar**

```bash
npm run dev
```

Navegar a `http://localhost:3000/dashboard/cobranza-ruta` con un usuario supervisor o admin y verificar:

- [ ] La tabla carga con los asesores del equipo
- [ ] Los badges de color son correctos (rojo/amarillo/verde)
- [ ] Click en una métrica abre el sidebar (desktop) o modal (mobile)
- [ ] El sidebar/modal muestra datos correctos para cada tipo ('quedan', 'cobraron', 'total')
- [ ] Botón "Actualizar" funciona
- [ ] El contador "Hace X segundos" avanza
- [ ] A los 45 segundos, la tabla se refresca automáticamente
- [ ] En mobile (<1024px), la tabla es compacta y el click abre modal
- [ ] El link "Cobranza en Ruta" aparece en el sidebar del dashboard
- [ ] Un usuario asesor no puede acceder (ve "Acceso Denegado")

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: Panel de Cobranza en Ruta - control operativo diario v1.0"
```

---

## Resumen de archivos

| Archivo | Acción |
|---------|--------|
| `components/cobranza-ruta/types.ts` | Crear |
| `lib/financial-logic.ts` | Modificar (agregar al final) |
| `app/api/dashboard/cobranza-ruta/route.ts` | Crear |
| `app/api/dashboard/cobranza-ruta/detalle/route.ts` | Crear |
| `app/dashboard/cobranza-ruta/page.tsx` | Crear |
| `app/dashboard/cobranza-ruta/loading.tsx` | Crear |
| `components/cobranza-ruta/asesor-metrics-details.tsx` | Crear |
| `components/cobranza-ruta/cobranza-table.tsx` | Crear |
| `components/cobranza-ruta/cobranza-ruta-client.tsx` | Crear |
| `components/dashboard-nav.tsx` | Modificar |
