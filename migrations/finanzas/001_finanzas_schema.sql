-- Bitácora Finanzas — 001_finanzas_schema
-- Ejecutar en finanzas_db con ignacio_admin. Solo DDL, idempotente donde es posible.
-- No usa DATABASE_URL de Bitácora: pool de la app conecta a host postgres-master.

-- ─── schema_migrations ──────────────────────────────────────────────────
-- Registro de versiones aplicadas. Cada migración inserta su propia fila
-- como última sentencia del fichero.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── ambitos ─────────────────────────────────────────────────────────────
-- Espacios de separación de saldos y movimientos. Todos los ámbitos tienen
-- tesorería (saldos, previsiones, reservas, deudas, revisión semanal).
-- lleva_contabilidad / lleva_fiscalidad son propiedades estructurales que
-- declaran qué ámbitos podrán entrar en las capas contable/fiscal de fases
-- futuras (no implican ninguna lógica contable/fiscal en este esquema).
-- Seed de los 3 ámbitos en 002_seed_ambitos.sql.
CREATE TABLE IF NOT EXISTS ambitos (
  id                  SERIAL PRIMARY KEY,
  nombre              TEXT NOT NULL UNIQUE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('sociedad', 'autonomo', 'personal')),
  orden               SMALLINT NOT NULL,
  color               TEXT NOT NULL,
  lleva_contabilidad  BOOLEAN NOT NULL DEFAULT false,
  lleva_fiscalidad    BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── cuentas_financieras ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_financieras (
  id          SERIAL PRIMARY KEY,
  ambito_id   INTEGER NOT NULL REFERENCES ambitos(id) ON DELETE RESTRICT,
  nombre      TEXT NOT NULL,
  entidad     TEXT,
  moneda      CHAR(3) NOT NULL DEFAULT 'EUR',
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cuentas_financieras_ambito
  ON cuentas_financieras(ambito_id);

-- ─── revisiones_semanales ────────────────────────────────────────────────
-- Sesión de revisión en la que se registran saldos de una o varias cuentas.
CREATE TABLE IF NOT EXISTS revisiones_semanales (
  id          SERIAL PRIMARY KEY,
  fecha       DATE NOT NULL,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── saldos_semanales ────────────────────────────────────────────────────
-- Snapshot de saldo real observado por cuenta y semana. revision_id es
-- opcional: permite agrupar saldos bajo una misma sesión de revisión sin
-- que el borrado de la sesión arrastre el histórico de saldos.
CREATE TABLE IF NOT EXISTS saldos_semanales (
  id           SERIAL PRIMARY KEY,
  cuenta_id    INTEGER NOT NULL REFERENCES cuentas_financieras(id) ON DELETE RESTRICT,
  semana       DATE NOT NULL,
  saldo        NUMERIC(14,2) NOT NULL,
  moneda       CHAR(3) NOT NULL DEFAULT 'EUR',
  revision_id  INTEGER REFERENCES revisiones_semanales(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, semana)
);

CREATE INDEX IF NOT EXISTS idx_saldos_semanales_semana
  ON saldos_semanales(semana);

-- ─── movimientos_previstos ───────────────────────────────────────────────
-- Previsión de ingreso/gasto. cuenta_id es opcional: una previsión puede
-- existir antes de saber en qué cuenta caerá. concepto queda como texto
-- libre — #713 añadirá un vínculo opcional a terceros sin tocar esta tabla.
CREATE TABLE IF NOT EXISTS movimientos_previstos (
  id              SERIAL PRIMARY KEY,
  ambito_id       INTEGER NOT NULL REFERENCES ambitos(id) ON DELETE RESTRICT,
  cuenta_id       INTEGER REFERENCES cuentas_financieras(id) ON DELETE RESTRICT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  concepto        TEXT NOT NULL,
  importe         NUMERIC(14,2) NOT NULL,
  moneda          CHAR(3) NOT NULL DEFAULT 'EUR',
  fecha_prevista  DATE NOT NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_previstos_ambito
  ON movimientos_previstos(ambito_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_previstos_fecha
  ON movimientos_previstos(fecha_prevista);

-- ─── reservas ────────────────────────────────────────────────────────────
-- Sin ambito_id propio: se deriva vía cuenta_id → cuentas_financieras.ambito_id.
-- Una reserva siempre está sobre una cuenta concreta.
CREATE TABLE IF NOT EXISTS reservas (
  id          SERIAL PRIMARY KEY,
  cuenta_id   INTEGER NOT NULL REFERENCES cuentas_financieras(id) ON DELETE RESTRICT,
  nombre      TEXT NOT NULL,
  importe     NUMERIC(14,2) NOT NULL,
  moneda      CHAR(3) NOT NULL DEFAULT 'EUR',
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservas_cuenta
  ON reservas(cuenta_id);

-- ─── deudas ──────────────────────────────────────────────────────────────
-- Con ambito_id propio: una deuda puede no estar ligada a ninguna cuenta.
-- contraparte queda como texto libre — mismo criterio que movimientos_previstos.concepto.
CREATE TABLE IF NOT EXISTS deudas (
  id                 SERIAL PRIMARY KEY,
  ambito_id          INTEGER NOT NULL REFERENCES ambitos(id) ON DELETE RESTRICT,
  contraparte        TEXT NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('debo', 'me_deben')),
  importe            NUMERIC(14,2) NOT NULL,
  moneda             CHAR(3) NOT NULL DEFAULT 'EUR',
  fecha_vencimiento  DATE,
  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deudas_ambito
  ON deudas(ambito_id);

-- ─── saldos_apertura ─────────────────────────────────────────────────────
-- Saldo de apertura anual por cuenta. Permite huecos: no se exige
-- continuidad año a año. Punto de partida para la reconciliación
-- apertura + ingresos − gastos que llegará con movimientos_reales (#712).
CREATE TABLE IF NOT EXISTS saldos_apertura (
  id          SERIAL PRIMARY KEY,
  cuenta_id   INTEGER NOT NULL REFERENCES cuentas_financieras(id) ON DELETE RESTRICT,
  anio        SMALLINT NOT NULL,
  saldo       NUMERIC(14,2) NOT NULL,
  moneda      CHAR(3) NOT NULL DEFAULT 'EUR',
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, anio)
);

INSERT INTO schema_migrations (version) VALUES ('001_finanzas_schema')
  ON CONFLICT (version) DO NOTHING;
