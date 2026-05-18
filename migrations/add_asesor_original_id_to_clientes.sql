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
