-- Bitácora Finanzas — 002_seed_ambitos
-- Ejecutar en finanzas_db con ignacio_admin, después de 001_finanzas_schema.sql.
-- Solo ámbitos. Las cuentas financieras (BBVA, ING, La Caixa autónomo,
-- La Caixa familia, Efectivo, etc.) se crean después, desde la app o desde
-- un seed específico posterior — no forman parte de esta migración.

INSERT INTO ambitos (
  nombre,
  tipo,
  orden,
  color,
  lleva_contabilidad,
  lleva_fiscalidad
) VALUES
  ('IMM CORE SYSTEM SL',     'sociedad', 1, '#C8A840', true,  true),
  ('Ignacio Mínguez Montes', 'autonomo', 2, '#4ADE80', true,  true),
  ('Familia / Hogar',        'personal', 3, '#60A5FA', false, false)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('002_seed_ambitos')
  ON CONFLICT (version) DO NOTHING;
