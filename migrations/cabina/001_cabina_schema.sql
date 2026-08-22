-- Bitácora Cabina Unria — 001_cabina_schema
-- Ejecutar en bitacora_db (DATABASE_URL). Solo DDL, idempotente donde es posible.
--
-- schema_migrations no existía en bitacora_db (chat_history y server_reports
-- se crearon fuera de este repo, sin migración rastreada). Se crea aquí y
-- queda como convención para el resto de tablas de bitacora_db en adelante.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ambito/modo en la sesión: contexto actual, usado para reanudar la conversación.
CREATE TABLE IF NOT EXISTS cabina_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito      TEXT NOT NULL CHECK (ambito IN ('proyectos_personales', 'clientes', 'ocio')),
  modo        TEXT NOT NULL CHECK (modo IN ('diseno', 'implementacion', 'revision')),
  title       TEXT NOT NULL DEFAULT 'Nueva conversación',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ambito/modo en el mensaje: contexto exacto bajo el que se envió ese mensaje
-- concreto (puede divergir del actual de la sesión si el usuario cambió de
-- ámbito/modo a mitad de conversación).
CREATE TABLE IF NOT EXISTS cabina_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES cabina_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  ambito      TEXT NOT NULL CHECK (ambito IN ('proyectos_personales', 'clientes', 'ocio')),
  modo        TEXT NOT NULL CHECK (modo IN ('diseno', 'implementacion', 'revision')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cabina_messages_session ON cabina_messages(session_id, id);

INSERT INTO schema_migrations (version) VALUES ('cabina_001')
  ON CONFLICT (version) DO NOTHING;
