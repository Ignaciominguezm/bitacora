-- Bitácora Cabina Unria — 004_cabina_summary_watermark
-- Ejecutar en bitacora_db (DATABASE_URL), después de 003_cabina_archive.sql.
--
-- Hasta ahora "summary" (002) era una columna sin nada que la rellenara. A
-- partir de este cambio, src/server/gateway/summarizer.ts la actualiza de
-- forma incremental: cuando el historial supera la ventana que se manda a
-- Unria en cada turno (HISTORY_MESSAGE_LIMIT), resume solo los mensajes que
-- quedan fuera de esa ventana desde la última vez que se resumió con éxito
-- — nunca el historial completo.
--
-- summarized_through_id guarda el id (cabina_messages.id) del último
-- mensaje ya incorporado al resumen. Es lo que permite calcular "solo lo
-- nuevo desde la última vez" sin volver a mandar mensajes ya resumidos, y
-- también lo que hace que un fallo puntual (ver summarizer.ts, best-effort)
-- se autocorrija en el siguiente turno en vez de perder esos mensajes para
-- siempre: al no avanzar el watermark, la próxima actualización con éxito
-- vuelve a incluirlos.
--
-- Nullable a propósito: NULL significa "nada resumido todavía", igual que
-- summary a NULL. src/server/gateway/summarizer.ts asume que esta columna
-- existe — sin manejo defensivo para su ausencia. Aplicar esta migración
-- ANTES de desplegar ese código (mismo orden que las anteriores).

ALTER TABLE cabina_sessions ADD COLUMN IF NOT EXISTS summarized_through_id BIGINT;

INSERT INTO schema_migrations (version) VALUES ('004_cabina_summary_watermark')
  ON CONFLICT (version) DO NOTHING;
