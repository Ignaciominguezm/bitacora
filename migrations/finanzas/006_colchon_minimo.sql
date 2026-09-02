-- Bitácora Finanzas — 006_colchon_minimo
-- Hace configurable el colchón mínimo por ámbito (antes constante en código).
-- Añade columna colchon_minimo a ambitos con los valores provisionales.
-- Ejecutar en finanzas_db con ignacio_admin, después de 001-005.
BEGIN;

ALTER TABLE ambitos
  ADD COLUMN IF NOT EXISTS colchon_minimo NUMERIC(14,2) NOT NULL DEFAULT 500;

UPDATE ambitos SET colchon_minimo = 3000 WHERE id = 1;
UPDATE ambitos SET colchon_minimo = 1000 WHERE id = 2;
UPDATE ambitos SET colchon_minimo = 500  WHERE id = 3;

INSERT INTO schema_migrations (version) VALUES ('006_colchon_minimo')
  ON CONFLICT (version) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;

COMMIT;
