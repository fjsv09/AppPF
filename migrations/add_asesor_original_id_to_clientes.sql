BEGIN;

-- Agregar columna asesor_original_id a clientes
-- Se setea al crear el cliente y nunca cambia, incluso al reasignar
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS asesor_original_id UUID REFERENCES perfiles(id);

-- Índice para acelerar filtros por asesor_original_id en queries de colocaciones
CREATE INDEX IF NOT EXISTS idx_clientes_asesor_original_id ON clientes(asesor_original_id);

-- Backfill: para todos los clientes sin asesor_original_id seteado:
-- Si tiene historial de reasignaciones → usar el asesor_anterior más antiguo
-- Si no tiene historial (o el registro más antiguo tiene asesor_anterior_id NULL) → usar asesor_id actual
UPDATE clientes c
SET asesor_original_id = COALESCE(
  (
    SELECT h.asesor_anterior_id
    FROM historial_reasignaciones_clientes h
    WHERE h.cliente_id = c.id
    ORDER BY h.created_at ASC
    LIMIT 1
  ),
  c.asesor_id
)
WHERE asesor_original_id IS NULL;

COMMIT;
