-- Bitácora Cabina Unria — 002_cabina_summary
-- Ejecutar en bitacora_db (DATABASE_URL), después de 001_cabina_schema.sql.
--
-- Hueco para el resumen por conversación que usará OpenClawGatewayAdapter
-- para dar contexto a los hilos largos (ver contrato AgentSessionRef.summary
-- en src/server/gateway/types.ts). Nullable a propósito: nada genera este
-- resumen todavía — es un mecanismo aparte, fuera de esta entrega. Mientras
-- esté a NULL, el adaptador cae al estado intermedio: últimos N mensajes de
-- cabina_messages, con un aviso explícito de que el resto de la
-- conversación no está incluido.

ALTER TABLE cabina_sessions ADD COLUMN IF NOT EXISTS summary TEXT;

INSERT INTO schema_migrations (version) VALUES ('002_cabina_summary')
  ON CONFLICT (version) DO NOTHING;
