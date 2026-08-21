-- Bitácora Finanzas — 002_seed_ambitos
-- Ejecutar en finanzas_db con ignacio_admin, después de 001_finanzas_schema.sql.

INSERT INTO ambitos (nombre, slug) VALUES
  ('Personal', 'personal'),
  ('IMM CORE SYSTEM SL', 'imm-core-system'),
  ('CoreWorks', 'coreworks'),
  ('Viriatech', 'viriatech')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('002_seed_ambitos')
  ON CONFLICT (version) DO NOTHING;
