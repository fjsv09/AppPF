# Design: asesor_original_id para colocaciones correctas

**Fecha:** 2026-05-17  
**Estado:** Aprobado

## Problema

Cuando un cliente es reasignado de asesor, `clientes.asesor_id` se actualiza al nuevo asesor. El cálculo de colocaciones en `lib/metas-logic.ts` usa `clientes.asesor_id` para determinar qué préstamos nuevos corresponden a cada asesor. Esto provoca que el asesor original pierda el crédito por los clientes que colocó, y el nuevo asesor recibe ese crédito incorrectamente.

## Solución

Agregar columna `asesor_original_id` en `clientes` que se setea al crear el cliente y **nunca cambia**. El cálculo de colocaciones en `metas-logic.ts` usa esta columna en lugar de `asesor_id`.

## Cambios

### 1. Migración SQL (`supabase/migrations/`)

```sql
-- Agregar columna
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

### 2. `app/api/clientes/route.ts` — Creación de cliente

Al insertar un nuevo cliente, agregar `asesor_original_id` con el mismo valor que `asesor_id`:

```typescript
const asesorId = perfil.rol === 'asesor' ? user.id : (asesor_id || null)

await supabaseAdmin.from('clientes').insert({
  // ...campos existentes
  asesor_id: asesorId,
  asesor_original_id: asesorId,  // nuevo — nunca cambia después
})
```

### 3. `app/api/admin/reasignar-clientes/route.ts` — Sin cambio

El UPDATE existente solo modifica `asesor_id`. No incluir `asesor_original_id` en ningún UPDATE de reasignación.

### 4. `lib/metas-logic.ts` — Query separado para colocaciones

**Problema actual (línea ~174):** `allRecentLoans` filtra por `clientes.asesor_id = userId`. Este mismo resultado se usa para cartera y colocaciones, pero para colocaciones necesita el asesor original.

**Fix:** Agregar un segundo query dedicado a colocaciones usando `asesor_original_id`, y excluir préstamos de clientes migrados (`solicitudes.origen = 'migracion'`):

```typescript
// Query nuevo — solo para cálculo de colocaciones
// Nota: solicitudes es LEFT JOIN vía solicitud_id (préstamos directos no tienen solicitud)
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

Reemplazar el origen de `prestamosNuevos` (línea ~231) para que use `prestamosParaColocacion` en lugar de `allRecentLoans`.

El filtro de migrados se aplica dentro del cálculo de `prestamosNuevos`. Los préstamos sin `solicitud_id` (directos) se incluyen siempre:
```typescript
const prestamosNuevos = (prestamosParaColocacion?.filter((p: any) => {
    const origen = p.solicitudes?.origen  // null si es préstamo directo → se incluye
    if (origen === 'migracion' || origen === 'edicion_cliente') return false
    const fecha = new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    return fecha.startsWith(mesActualStr)
}) || [])
```

El query de `allRecentLoans` existente (cartera) **no se toca**.

## Dependencias

- La columna `solicitudes.origen` debe estar aplicada antes o al mismo tiempo que este cambio (spec: `2026-05-17-filtrar-solicitudes-migradas-design.md`). Si no está disponible aún, el filtro de migrados se omite temporalmente y se agrega después.

## Invariantes

- `asesor_original_id` se setea una sola vez al crear el cliente.
- Ningún endpoint de reasignación modifica `asesor_original_id`.
- La cartera (`allRecentLoans`) sigue usando `asesor_id` actual — sin cambio.
- Solo el cálculo de colocaciones (`prestamosParaColocacion`) usa `asesor_original_id`.

## Archivos a modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `supabase/migrations/YYYYMMDD_asesor_original_id.sql` | Nuevo — migración SQL |
| `app/api/clientes/route.ts` | Agregar `asesor_original_id` al INSERT |
| `lib/metas-logic.ts` | Nuevo query para colocaciones, reemplazar origen de `prestamosNuevos` |
