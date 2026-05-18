# asesor_original_id para colocaciones correctas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar `asesor_original_id` a `clientes` para que el cálculo de colocaciones en `metas-logic.ts` acredite siempre al asesor que colocó originalmente el cliente, incluso si fue reasignado a otro.

**Architecture:** Se agrega una columna `asesor_original_id` en `clientes` que se setea al crear el cliente y nunca se modifica. Se agrega un query paralelo en `metas-logic.ts` que usa esta columna para calcular colocaciones, dejando el query de cartera (`allRecentLoans`) intacto.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL), Supabase MCP para ejecutar migraciones.

---

## File Map

| Archivo | Acción |
|---------|--------|
| `migrations/add_asesor_original_id_to_clientes.sql` | CREAR — migración SQL con ALTER + backfill |
| `app/api/clientes/route.ts` | MODIFICAR línea 82 — agregar `asesor_original_id` al INSERT |
| `app/api/clientes/import/route.ts` | MODIFICAR línea 109 — agregar `asesor_original_id` al INSERT de importación |
| `lib/metas-logic.ts` | MODIFICAR líneas 166–234 — nuevo query para colocaciones, reemplazar origen de `prestamosNuevos` |

---

## Task 1: Crear y aplicar la migración SQL

**Files:**
- Create: `migrations/add_asesor_original_id_to_clientes.sql`

- [ ] **Step 1: Crear el archivo de migración**

Crear `migrations/add_asesor_original_id_to_clientes.sql` con este contenido exacto:

```sql
-- Agregar columna asesor_original_id a clientes
-- Se setea al crear el cliente y nunca cambia, incluso al reasignar
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS asesor_original_id UUID REFERENCES perfiles(id);

-- Backfill: clientes sin historial de reasignación → asesor actual
UPDATE clientes c
SET asesor_original_id = c.asesor_id
WHERE asesor_original_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM historial_reasignaciones_clientes h
    WHERE h.cliente_id = c.id
  );

-- Backfill: clientes con historial → asesor_anterior del registro más antiguo
UPDATE clientes c
SET asesor_original_id = (
  SELECT h.asesor_anterior_id
  FROM historial_reasignaciones_clientes h
  WHERE h.cliente_id = c.id
  ORDER BY h.created_at ASC
  LIMIT 1
)
WHERE asesor_original_id IS NULL
  AND EXISTS (
    SELECT 1 FROM historial_reasignaciones_clientes h
    WHERE h.cliente_id = c.id
  );
```

- [ ] **Step 2: Aplicar la migración vía Supabase MCP**

Ejecutar usando `mcp__supabase__apply_migration` con `name: "add_asesor_original_id_to_clientes"` y el SQL del paso anterior.

- [ ] **Step 3: Verificar que la columna existe y el backfill fue correcto**

Ejecutar vía `mcp__supabase__execute_sql`:

```sql
-- Verificar que la columna existe
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clientes' AND column_name = 'asesor_original_id';

-- Verificar que no quedaron NULLs en clientes con asesor_id
SELECT COUNT(*) as sin_original
FROM clientes
WHERE asesor_id IS NOT NULL AND asesor_original_id IS NULL;
-- Esperado: 0

-- Spot check: clientes reasignados deben tener asesor_original_id ≠ asesor_id
SELECT c.id, c.asesor_id, c.asesor_original_id
FROM clientes c
WHERE EXISTS (
  SELECT 1 FROM historial_reasignaciones_clientes h WHERE h.cliente_id = c.id
)
LIMIT 5;
-- Esperado: asesor_original_id = quien lo colocó originalmente (≠ asesor_id actual en casos reasignados)
```

- [ ] **Step 4: Commit**

```bash
git add migrations/add_asesor_original_id_to_clientes.sql
git commit -m "feat: agregar asesor_original_id a clientes con backfill"
```

---

## Task 2: Actualizar creación de cliente (`app/api/clientes/route.ts`)

**Files:**
- Modify: `app/api/clientes/route.ts:78-85`

- [ ] **Step 1: Agregar `asesor_original_id` al INSERT**

En `app/api/clientes/route.ts`, la línea 78 contiene el INSERT. Reemplazar:

```typescript
    const { data: newClient, error: insertError } = await supabaseAdmin
      .from('clientes')
      .insert({
        dni, nombres, telefono, direccion, 
        asesor_id: (perfil.rol === 'asesor' ? user.id : (asesor_id || null)),
        estado: 'activo'
      })
      .select().single()
```

Por:

```typescript
    const asesorAsignado = perfil.rol === 'asesor' ? user.id : (asesor_id || null)
    const { data: newClient, error: insertError } = await supabaseAdmin
      .from('clientes')
      .insert({
        dni, nombres, telefono, direccion,
        asesor_id: asesorAsignado,
        asesor_original_id: asesorAsignado,
        estado: 'activo'
      })
      .select().single()
```

- [ ] **Step 2: Verificar que TypeScript compila sin errores**

```bash
npm run lint
```

Esperado: sin errores relacionados a `asesor_original_id`.

- [ ] **Step 3: Commit**

```bash
git add app/api/clientes/route.ts
git commit -m "feat: set asesor_original_id al crear cliente"
```

---

## Task 3: Actualizar importación de clientes (`app/api/clientes/import/route.ts`)

**Files:**
- Modify: `app/api/clientes/import/route.ts:106-110`

Los clientes importados (migrados) también deben tener `asesor_original_id` para consistencia de datos, aunque no se cuenten como colocaciones (se filtran por `solicitudes.origen = 'migracion'`).

- [ ] **Step 1: Agregar `asesor_original_id` al INSERT de importación**

En `app/api/clientes/import/route.ts`, cerca de la línea 109, el INSERT de cliente tiene:

```typescript
                        estado: 'activo',
                        asesor_id: user.id
```

Reemplazar por:

```typescript
                        estado: 'activo',
                        asesor_id: user.id,
                        asesor_original_id: user.id
```

- [ ] **Step 2: Verificar que TypeScript compila sin errores**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add app/api/clientes/import/route.ts
git commit -m "feat: set asesor_original_id en importación de clientes"
```

---

## Task 4: Fix en `metas-logic.ts` — query separado para colocaciones

**Files:**
- Modify: `lib/metas-logic.ts:166-234`

**Contexto:** El query `allRecentLoans` (línea 166) usa `clientes.asesor_id = userId` y alimenta tanto la cartera como las colocaciones. Hay que agregar un segundo query paralelo para colocaciones que use `asesor_original_id`, y actualizar `prestamosNuevos` para que lo use.

- [ ] **Step 1: Agregar el query `prestamosParaColocacion` después de `allRecentLoans`**

En `lib/metas-logic.ts`, localizar el bloque que termina en la línea ~175:

```typescript
    const { data: allRecentLoans } = await supabaseAdmin
        .from('prestamos')
        .select(`
            id, cliente_id, monto, interes, created_at, estado, created_by,
            es_paralelo, estado_mora, observacion_supervisor,
            clientes!inner (asesor_id, bloqueado_renovacion),
            cronograma_cuotas (id, fecha_vencimiento, monto_cuota, monto_pagado, estado)
        `)
        .eq('clientes.asesor_id', userId)
        .in('estado', ['activo', 'desembolsado', 'vigente', 'aprobado', 'finalizado'])
```

Agregar inmediatamente **después** de ese bloque (antes de `// Cartera de clientes`):

```typescript
    // Query separado para colocaciones: usa asesor_original_id para dar crédito
    // al asesor que colocó el cliente, aunque haya sido reasignado después.
    // solicitudes es LEFT JOIN (préstamos directos no tienen solicitud_id).
    const { data: prestamosParaColocacion } = await supabaseAdmin
        .from('prestamos')
        .select(`
            id, cliente_id, monto, created_at,
            clientes!inner (asesor_original_id),
            solicitudes!solicitud_id (origen)
        `)
        .eq('clientes.asesor_original_id', userId)
        .in('estado', ['activo', 'desembolsado', 'vigente', 'aprobado', 'finalizado'])
```

- [ ] **Step 2: Reemplazar el origen de `prestamosNuevos`**

Localizar la línea ~231:

```typescript
    const prestamosNuevos = (allRecentLoans?.filter((p: any) => {
        const fecha = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
        return fecha.startsWith(mesActualStr)
    }) || [])
```

Reemplazar por:

```typescript
    const prestamosNuevos = (prestamosParaColocacion?.filter((p: any) => {
        const origen = (p.solicitudes as any)?.origen  // null si es préstamo directo → se incluye
        if (origen === 'migracion' || origen === 'edicion_cliente') return false
        const fecha = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
        return fecha.startsWith(mesActualStr)
    }) || [])
```

- [ ] **Step 3: Verificar que TypeScript compila sin errores**

```bash
npm run lint
```

Esperado: sin errores. Si hay error de tipo en `p.solicitudes`, agregar cast `(p.solicitudes as any)?.origen`.

- [ ] **Step 4: Verificar lógica con SQL directo**

Ejecutar en Supabase MCP para comparar el resultado esperado vs. actual para un asesor que tenga clientes reasignados:

```sql
-- Clientes colocados por el asesor (asesor_original_id) en el mes actual
-- Reemplazar <asesor_uuid> con un UUID real de un asesor con reasignaciones
SELECT 
  p.id AS prestamo_id,
  p.created_at,
  p.monto,
  c.asesor_id AS asesor_actual,
  c.asesor_original_id AS asesor_original,
  s.origen AS origen_solicitud
FROM prestamos p
JOIN clientes c ON p.cliente_id = c.id
LEFT JOIN solicitudes s ON s.id = p.solicitud_id
WHERE c.asesor_original_id = '<asesor_uuid>'
  AND p.estado IN ('activo', 'desembolsado', 'vigente', 'aprobado', 'finalizado')
  AND DATE_TRUNC('month', p.created_at AT TIME ZONE 'America/Lima') = DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Lima')
  AND (s.origen IS NULL OR s.origen NOT IN ('migracion', 'edicion_cliente'))
ORDER BY p.created_at DESC;
```

Confirmar que el conteo coincide con lo que el asesor espera recibir como colocaciones del mes.

- [ ] **Step 5: Commit**

```bash
git add lib/metas-logic.ts
git commit -m "fix: usar asesor_original_id para colocaciones en metas-logic"
```

---

## Task 5: Build de verificación final

- [ ] **Step 1: Build de producción**

```bash
npm run build
```

Esperado: compilación exitosa sin errores de TypeScript.

- [ ] **Step 2: Commit de versión si aplica**

Si el proyecto maneja versiones en `package.json`, actualizar según el flujo habitual del proyecto.
