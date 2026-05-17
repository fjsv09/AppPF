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
  AND cuotas = 24;
