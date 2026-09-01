-- Bitácora Cabina Unria — 005_cabina_approvals
-- Ejecutar en bitacora_db (DATABASE_URL), después de 004_cabina_summary_watermark.sql.
--
-- Zona de aprobación (#723-MVP, Encargo 1): cola de acciones propuestas por
-- Unria que exigen permiso explícito del usuario antes de ejecutarse, y
-- registro de las que ya se ejecutaron directo (dry-run en este encargo).
-- Ver src/server/actions/ (parser, registry, policy, applyActionProposal) y
-- src/server/routes/approvals.ts.
--
-- execution_mode es ortogonal a status: una fila 'executed' puede ser
-- dry_run o real — en este encargo siempre dry_run, el executor real es
-- Encargo 2 (ver src/server/actions/executors/coreworkCreateTask.ts).
-- No toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS cabina_approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES cabina_sessions(id) ON DELETE CASCADE,
  message_id     BIGINT REFERENCES cabina_messages(id) ON DELETE SET NULL,
  action_type    TEXT NOT NULL,
  summary        TEXT NOT NULL,
  origen         TEXT NOT NULL CHECK (origen IN ('orden_explicita','iniciativa')),
  risk_level     TEXT NOT NULL CHECK (risk_level IN ('bajo','medio','fuerte')),
  approval_mode  TEXT NOT NULL CHECK (approval_mode IN ('normal','reforzada')),
  payload        JSONB NOT NULL,
  status         TEXT NOT NULL CHECK (status IN
                   ('pending','approved','rejected','expired','cancelled','executed','failed')),
  execution_mode TEXT CHECK (execution_mode IN ('dry_run','real')),
  result         JSONB,
  error          TEXT,
  requested_by   TEXT NOT NULL DEFAULT 'unria',
  approved_by    TEXT,
  approved_at    TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cabina_approvals_pending ON cabina_approvals(status, expires_at);

INSERT INTO schema_migrations (version) VALUES ('005_cabina_approvals')
  ON CONFLICT (version) DO NOTHING;
