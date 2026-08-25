-- Bitácora Cabina Unria — 003_cabina_archive
-- Ejecutar en bitacora_db (DATABASE_URL), después de 002_cabina_summary.sql.
--
-- Estado de archivado por conversación. NULL = activa (comportamiento por
-- defecto). Archivar es reversible (archived_at vuelve a NULL); el borrado
-- definitivo sigue siendo un DELETE real de la fila, que ya cascada a
-- cabina_messages por el ON DELETE CASCADE de 001_cabina_schema.sql.
--
-- src/server/routes/cabina.ts asume que esta columna existe — sin manejo
-- defensivo para su ausencia. Aplicar esta migración ANTES de desplegar ese
-- código (mismo orden que con summary en 002).

ALTER TABLE cabina_sessions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

INSERT INTO schema_migrations (version) VALUES ('003_cabina_archive')
  ON CONFLICT (version) DO NOTHING;
