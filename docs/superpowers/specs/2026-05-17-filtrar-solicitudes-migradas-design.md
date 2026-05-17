# Diseño: Filtrar Solicitudes de Clientes Migrados

**Fecha:** 2026-05-17  
**Estado:** Aprobado

## Problema

Clientes importados del sistema anterior no tenían solicitud asociada. Cuando un asesor edita cualquier campo financiero de esos clientes (`giro_negocio`, `fuentes_ingresos`, `ingresos_mensuales`, `motivo_prestamo`, `gps_coordenadas`), el PATCH handler en `app/api/clientes/route.ts` (líneas 199-218) crea automáticamente una solicitud ficticia con valores placeholder (`monto=100, interes=20, cuotas=24, estado='aprobado'`). Estas solicitudes aparecen en el panel "Solicitudes de Prospectos y Préstamos" y confunden a los usuarios.

## Solución: Columna `origen` en tabla `solicitudes`

Agregar una columna `origen TEXT NOT NULL DEFAULT 'normal'` para distinguir el origen de cada solicitud, y filtrar las no-normales del panel.

### Valores de `origen`

| Valor | Significado |
|-------|-------------|
| `'normal'` | Solicitud iniciada por un asesor/admin via flujo estándar |
| `'migracion'` | Creada automáticamente al importar cliente del sistema anterior |
| `'edicion_cliente'` | Creada como efecto secundario al editar campos financieros de un cliente migrado |

## Cambios

### 1. Migración SQL (`migrations/`)

```sql
-- Agregar columna
ALTER TABLE solicitudes 
ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'normal';

-- Tagging retroactivo: solicitudes de migración original
UPDATE solicitudes SET origen = 'migracion'
WHERE motivo_prestamo = 'Migración de datos - Sistema Anterior';

-- Tagging retroactivo: solicitudes creadas por edición de cliente migrado
UPDATE solicitudes SET origen = 'edicion_cliente'
WHERE origen = 'normal'
  AND monto_solicitado = 100
  AND interes = 20
  AND cuotas = 24
  AND prestamo_id IS NULL;
```

### 2. `app/api/clientes/route.ts` — PATCH fallback insert (línea ~203)

Agregar `origen: 'edicion_cliente'` al INSERT del bloque `else`:

```typescript
await supabaseAdmin.from('solicitudes').insert({
    cliente_id: id,
    asesor_id: oldClient.asesor_id,
    estado_solicitud: 'aprobado',
    // ...campos existentes...
    origen: 'edicion_cliente',  // ← NUEVO
})
```

### 3. `app/api/migracion/clientes/route.ts` — INSERT de migración (línea ~130)

Agregar `origen: 'migracion'` al INSERT existente:

```typescript
await supabaseAdmin.from('solicitudes').insert({
    // ...campos existentes...
    motivo_prestamo: 'Migración de datos - Sistema Anterior',
    origen: 'migracion',  // ← NUEVO
})
```

### 4. `app/dashboard/solicitudes/page.tsx` — Query server-side

Agregar filtro al query de Supabase:

```typescript
.eq('origen', 'normal')
```

### 5. `app/api/solicitudes/route.ts` — GET handler

Agregar el mismo filtro al query del API:

```typescript
.eq('origen', 'normal')
```

## Lo que NO cambia

- El flujo de creación de solicitudes reales (`/solicitudes/nueva`) no se toca
- Los clientes migrados siguen siendo editables
- Las solicitudes existentes `'normal'` no se modifican
- El comportamiento del PATCH para clientes con solicitud existente (update) no cambia

## Archivos a modificar

1. `migrations/` — nuevo archivo SQL de migración
2. `app/api/clientes/route.ts`
3. `app/api/migracion/clientes/route.ts`
4. `app/dashboard/solicitudes/page.tsx`
5. `app/api/solicitudes/route.ts`
