# Filtrar Solicitudes de Clientes Migrados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excluir del panel de solicitudes las solicitudes ficticias creadas automáticamente al editar clientes migrados o durante la migración.

**Architecture:** Se agrega una columna `origen TEXT DEFAULT 'normal'` a la tabla `solicitudes`. Los valores posibles son `'normal'` (flujo real), `'migracion'` (creada durante importación masiva), y `'edicion_cliente'` (creada como efecto secundario al editar campos financieros de un cliente migrado). El filtro `.eq('origen', 'normal')` se aplica en los dos puntos de consulta: el page server component y el API GET handler.

**Tech Stack:** Supabase (PostgreSQL), Next.js 14 API routes, TypeScript

---

## File Map

| Archivo | Acción |
|---------|--------|
| `migrations/add_origen_to_solicitudes.sql` | Crear — agrega columna + tagging retroactivo |
| `app/api/clientes/route.ts` | Modificar — agrega `origen: 'edicion_cliente'` al INSERT fallback |
| `app/api/migracion/clientes/route.ts` | Modificar — agrega `origen: 'migracion'` al INSERT de migración |
| `app/dashboard/solicitudes/page.tsx` | Modificar — agrega filtro `.eq('origen', 'normal')` al query |
| `app/api/solicitudes/route.ts` | Modificar — agrega filtro `.eq('origen', 'normal')` al GET query |

---

### Task 1: Crear archivo de migración SQL

**Files:**
- Create: `migrations/add_origen_to_solicitudes.sql`

- [ ] **Step 1: Crear el archivo de migración**

Crea `migrations/add_origen_to_solicitudes.sql` con el siguiente contenido exacto:

```sql
-- Agregar campo origen a solicitudes para distinguir su procedencia
-- Valores: 'normal' (flujo real), 'migracion' (importación masiva), 'edicion_cliente' (edición de cliente migrado)

ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'normal';

-- Índice para acelerar el filtro en el listado
CREATE INDEX IF NOT EXISTS idx_solicitudes_origen ON solicitudes(origen);

-- Tagging retroactivo: solicitudes creadas durante migración original
UPDATE solicitudes SET origen = 'migracion'
WHERE motivo_prestamo = 'Migración de datos - Sistema Anterior';

-- Tagging retroactivo: solicitudes creadas por edición de cliente sin solicitud previa
-- Identificadas por los valores placeholder hardcodeados en el PATCH handler
UPDATE solicitudes SET origen = 'edicion_cliente'
WHERE origen = 'normal'
  AND monto_solicitado = 100
  AND interes = 20
  AND cuotas = 24
  AND prestamo_id IS NULL;
```

- [ ] **Step 2: Ejecutar la migración en Supabase**

Abre el Supabase Dashboard → SQL Editor, pega el contenido del archivo y ejecuta. Verifica que no haya errores.

Para confirmar el resultado, ejecuta en SQL Editor:

```sql
SELECT origen, COUNT(*) as total 
FROM solicitudes 
GROUP BY origen 
ORDER BY total DESC;
```

Deberías ver filas con `normal`, `migracion`, y/o `edicion_cliente` según los datos existentes.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_origen_to_solicitudes.sql
git commit -m "feat: add origen column to solicitudes for migration filtering"
```

---

### Task 2: Marcar INSERT del PATCH handler como `edicion_cliente`

**Files:**
- Modify: `app/api/clientes/route.ts:199-218`

- [ ] **Step 1: Agregar `origen` al INSERT fallback**

En `app/api/clientes/route.ts`, localiza el bloque `else` que comienza en línea 199. El INSERT actual luce así:

```typescript
} else {
    // Cliente sin solicitud (ej: importación masiva) — crear registro mínimo
    await supabaseAdmin
        .from('solicitudes')
        .insert({
            cliente_id: id,
            asesor_id: oldClient.asesor_id,
            estado_solicitud: 'aprobado',
            prospecto_nombres: oldClient.nombres,
            prospecto_dni: oldClient.dni,
            prospecto_telefono: oldClient.telefono || null,
            prospecto_direccion: oldClient.direccion || null,
            monto_solicitado: 100, // Prevenir constraint > 0
            interes: 20,
            cuotas: 24,
            modalidad: 'diario',
            fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
            ...solicitationPayload
        })
}
```

Reemplázalo con:

```typescript
} else {
    // Cliente sin solicitud (ej: importación masiva) — crear registro mínimo
    await supabaseAdmin
        .from('solicitudes')
        .insert({
            cliente_id: id,
            asesor_id: oldClient.asesor_id,
            estado_solicitud: 'aprobado',
            prospecto_nombres: oldClient.nombres,
            prospecto_dni: oldClient.dni,
            prospecto_telefono: oldClient.telefono || null,
            prospecto_direccion: oldClient.direccion || null,
            monto_solicitado: 100, // Prevenir constraint > 0
            interes: 20,
            cuotas: 24,
            modalidad: 'diario',
            fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
            origen: 'edicion_cliente',
            ...solicitationPayload
        })
}
```

- [ ] **Step 2: Verificar que el servidor compila sin errores**

```bash
npm run build
```

Esperado: build exitoso sin errores de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add app/api/clientes/route.ts
git commit -m "feat: tag solicitudes created from client edits with origen=edicion_cliente"
```

---

### Task 3: Marcar INSERT de migración masiva como `migracion`

**Files:**
- Modify: `app/api/migracion/clientes/route.ts:128-150`

- [ ] **Step 1: Agregar `origen` al INSERT de migración**

En `app/api/migracion/clientes/route.ts`, localiza el bloque que construye `solicitudesPayload` (línea ~128). El map actual termina así:

```typescript
const solicitudesPayload = lote.map(c => ({
    asesor_id: c.asesorId,
    admin_id: user.id,
    cliente_id: dniToClienteId.get(c.dni),
    estado_solicitud: 'aprobado',
    fecha_aprobacion: new Date().toISOString(),
    prospecto_nombres: c.nombres,
    prospecto_dni: c.dni,
    prospecto_telefono: (c.raw.telefono || c.raw.Telefono || '').toString().trim() || null,
    prospecto_direccion: (c.raw.direccion || c.raw.Direccion || '').toString().trim() || null,
    prospecto_referencia: (c.raw.referencia || c.raw.Referencia || '').toString().trim() || null,
    monto_solicitado: 1,
    interes: 0,
    cuotas: 1,
    modalidad: 'diario',
    fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
    giro_negocio: (c.raw.giro_negocio || c.raw.GiroNegocio || '').toString().trim() || null,
    fuentes_ingresos: (c.raw.fuentes_ingresos || c.raw.FuentesIngresos || '').toString().trim() || null,
    ingresos_mensuales: c.raw.ingresos_mensuales ? parseFloat(c.raw.ingresos_mensuales) : 0,
    motivo_prestamo: 'Migración de datos - Sistema Anterior',
    observacion_supervisor: 'Registro migrado del sistema anterior',
    documentos_evaluacion: c.sectorId ? { prospecto_sector_id: c.sectorId } : null,
}))
```

Agrega `origen: 'migracion'` al objeto (antes del cierre `})`):

```typescript
const solicitudesPayload = lote.map(c => ({
    asesor_id: c.asesorId,
    admin_id: user.id,
    cliente_id: dniToClienteId.get(c.dni),
    estado_solicitud: 'aprobado',
    fecha_aprobacion: new Date().toISOString(),
    prospecto_nombres: c.nombres,
    prospecto_dni: c.dni,
    prospecto_telefono: (c.raw.telefono || c.raw.Telefono || '').toString().trim() || null,
    prospecto_direccion: (c.raw.direccion || c.raw.Direccion || '').toString().trim() || null,
    prospecto_referencia: (c.raw.referencia || c.raw.Referencia || '').toString().trim() || null,
    monto_solicitado: 1,
    interes: 0,
    cuotas: 1,
    modalidad: 'diario',
    fecha_inicio_propuesta: new Date().toISOString().split('T')[0],
    giro_negocio: (c.raw.giro_negocio || c.raw.GiroNegocio || '').toString().trim() || null,
    fuentes_ingresos: (c.raw.fuentes_ingresos || c.raw.FuentesIngresos || '').toString().trim() || null,
    ingresos_mensuales: c.raw.ingresos_mensuales ? parseFloat(c.raw.ingresos_mensuales) : 0,
    motivo_prestamo: 'Migración de datos - Sistema Anterior',
    observacion_supervisor: 'Registro migrado del sistema anterior',
    documentos_evaluacion: c.sectorId ? { prospecto_sector_id: c.sectorId } : null,
    origen: 'migracion',
}))
```

- [ ] **Step 2: Verificar build**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add app/api/migracion/clientes/route.ts
git commit -m "feat: tag solicitudes created during client migration with origen=migracion"
```

---

### Task 4: Filtrar en el page server component

**Files:**
- Modify: `app/dashboard/solicitudes/page.tsx:43-63`

- [ ] **Step 1: Agregar filtro al query**

En `app/dashboard/solicitudes/page.tsx`, localiza el query que comienza en línea 43:

```typescript
let query = supabaseAdmin
    .from('solicitudes')
    .select(`
        *,
        cliente:cliente_id(id, nombres, dni),
        asesor:asesor_id(id, nombre_completo)
    `)
    .order('created_at', { ascending: false })
```

Reemplázalo con:

```typescript
let query = supabaseAdmin
    .from('solicitudes')
    .select(`
        *,
        cliente:cliente_id(id, nombres, dni),
        asesor:asesor_id(id, nombre_completo)
    `)
    .eq('origen', 'normal')
    .order('created_at', { ascending: false })
```

- [ ] **Step 2: Verificar build**

```bash
npm run build
```

Esperado: build exitoso.

- [ ] **Step 3: Verificar visualmente en dev**

```bash
npm run dev
```

Navega a `/dashboard/solicitudes`. El contador de "Finalizadas" debe haber reducido (si había solicitudes de migración). Las solicitudes reales deben seguir apareciendo.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/solicitudes/page.tsx
git commit -m "feat: exclude migrated solicitudes from dashboard panel"
```

---

### Task 5: Filtrar en el API GET handler

**Files:**
- Modify: `app/api/solicitudes/route.ts:32-41`

- [ ] **Step 1: Agregar filtro al query GET**

En `app/api/solicitudes/route.ts`, localiza el query que comienza en línea 32:

```typescript
let query = supabaseAdmin
    .from('solicitudes')
    .select(`
        *,
        clientes:cliente_id(id, nombres, dni),
        asesor:asesor_id(id, nombre_completo),
        supervisor:supervisor_id(id, nombre_completo),
        admin:admin_id(nombre_completo)
    `)
    .order('created_at', { ascending: false })
```

Reemplázalo con:

```typescript
let query = supabaseAdmin
    .from('solicitudes')
    .select(`
        *,
        clientes:cliente_id(id, nombres, dni),
        asesor:asesor_id(id, nombre_completo),
        supervisor:supervisor_id(id, nombre_completo),
        admin:admin_id(nombre_completo)
    `)
    .eq('origen', 'normal')
    .order('created_at', { ascending: false })
```

- [ ] **Step 2: Verificar build final**

```bash
npm run build
```

Esperado: build exitoso sin errores.

- [ ] **Step 3: Commit final**

```bash
git add app/api/solicitudes/route.ts
git commit -m "feat: exclude migrated solicitudes from API GET response"
```
