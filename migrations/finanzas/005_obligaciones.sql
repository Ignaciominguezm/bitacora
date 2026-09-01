-- Bitácora Finanzas — 005_obligaciones
-- Concepto "Obligaciones": compromisos de pago recurrentes/puntuales, graves
-- si no se pagan (autónomo, IVA, nóminas, infra crítica). NO "apartan" dinero:
-- son una capa de VIGILANCIA que compara disponible vs obligaciones del
-- periodo y avisa. El flujo de caja es la causa (un gasto real cubre una
-- instancia); la obligación se marca cubierta por confirmación del usuario.
-- Ejecutar en finanzas_db con ignacio_admin, después de 001-004.
-- Migración atómica (BEGIN/COMMIT). Ejecutar con ON_ERROR_STOP=1.
--
-- MODELO (decidido en #743):
-- - obligaciones: la PLANTILLA (Autónomo mensual ~262€, IVA trimestral...).
-- - obligaciones_instancias: cada VENCIMIENTO concreto (Autónomo agosto 2026).
--   El sistema genera instancias según periodicidad.
-- - Emparejamiento: un gasto real de la categoría vinculada, importe
--   aproximado, dispara una SUGERENCIA; el usuario CONFIRMA. Al confirmar,
--   la instancia se marca cubierta, se enlaza al movimiento, y el importe
--   real actualiza el importe_referencia de la plantilla (aprende subidas).
-- - Periodo de instancia: primer día del periodo como DATE (mensual=día 1
--   del mes; trimestral=día 1 del primer mes del trimestre; anual=1-ene).
-- - Vínculo: cada obligación se liga a UNA categoria de gasto.
-- - No "aparta": la cobertura es un cálculo (disponible vs Σ pendientes).

BEGIN;

-- ─── obligaciones (plantilla) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obligaciones (
  id                 SERIAL PRIMARY KEY,
  ambito_id          INTEGER NOT NULL REFERENCES ambitos(id) ON DELETE RESTRICT,
  categoria_id       INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  nombre             TEXT NOT NULL,           -- "Cuota autónomo", "IVA", "Nómina Eva"
  periodicidad       TEXT NOT NULL CHECK (periodicidad IN
                       ('mensual','trimestral','anual','puntual')),
  tipo_importe       TEXT NOT NULL CHECK (tipo_importe IN ('fijo','variable')),
  importe_referencia NUMERIC(14,2),           -- último importe conocido (se actualiza al confirmar)
  moneda             CHAR(3) NOT NULL DEFAULT 'EUR',
  -- Regla de vencimiento: día del mes en que vence, y si vence en el periodo
  -- mismo o en meses posteriores (IVA vence el día 20 del mes siguiente al
  -- cierre del trimestre → dia_vencimiento=20, meses_desfase=1).
  dia_vencimiento    SMALLINT CHECK (dia_vencimiento BETWEEN 1 AND 31),
  meses_desfase      SMALLINT NOT NULL DEFAULT 0,  -- meses tras el fin del periodo
  activa             BOOLEAN NOT NULL DEFAULT true,
  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obligaciones_ambito    ON obligaciones(ambito_id);
CREATE INDEX IF NOT EXISTS idx_obligaciones_categoria ON obligaciones(categoria_id);

-- ─── obligaciones_instancias (cada vencimiento) ──────────────────────────
CREATE TABLE IF NOT EXISTS obligaciones_instancias (
  id                SERIAL PRIMARY KEY,
  obligacion_id     INTEGER NOT NULL REFERENCES obligaciones(id) ON DELETE CASCADE,
  periodo           DATE NOT NULL,            -- primer día del periodo (2026-08-01, Q3=2026-07-01)
  fecha_vencimiento DATE NOT NULL,            -- cuándo hay que tenerlo pagado
  importe_esperado  NUMERIC(14,2),            -- heredado de la plantilla, editable
  moneda            CHAR(3) NOT NULL DEFAULT 'EUR',
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','cubierta','cancelada')),
  -- Movimiento del flujo de caja que la cubrió (al confirmar el emparejamiento).
  -- ON DELETE SET NULL: si se borra el movimiento, la instancia vuelve a
  -- quedar sin cubrir (pero no se borra la instancia).
  movimiento_id     INTEGER REFERENCES movimientos_reales(id) ON DELETE SET NULL,
  importe_real      NUMERIC(14,2),            -- importe con que se cubrió (del movimiento)
  fecha_cubierta    DATE,                     -- cuándo se marcó cubierta
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No duplicar la instancia de un mismo periodo para una misma obligación.
  UNIQUE (obligacion_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_obl_inst_obligacion ON obligaciones_instancias(obligacion_id);
CREATE INDEX IF NOT EXISTS idx_obl_inst_periodo    ON obligaciones_instancias(periodo);
CREATE INDEX IF NOT EXISTS idx_obl_inst_estado     ON obligaciones_instancias(estado);
CREATE INDEX IF NOT EXISTS idx_obl_inst_vencimiento ON obligaciones_instancias(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_obl_inst_movimiento ON obligaciones_instancias(movimiento_id)
  WHERE movimiento_id IS NOT NULL;

-- ─── v_obligaciones_instancias ───────────────────────────────────────────
-- Instancias con su plantilla, ámbito y categoría resueltos por JOIN.
CREATE OR REPLACE VIEW v_obligaciones_instancias AS
SELECT
  i.id, i.obligacion_id, o.nombre AS obligacion_nombre,
  o.ambito_id, a.nombre AS ambito_nombre,
  o.categoria_id, cat.nombre AS categoria_nombre,
  o.periodicidad, o.tipo_importe,
  i.periodo, i.fecha_vencimiento,
  i.importe_esperado, i.moneda, i.estado,
  i.movimiento_id, i.importe_real, i.fecha_cubierta,
  i.notas, i.created_at, i.updated_at
FROM obligaciones_instancias i
JOIN obligaciones o     ON o.id = i.obligacion_id
JOIN ambitos a          ON a.id = o.ambito_id
JOIN categorias cat     ON cat.id = o.categoria_id;

-- ─── Registro de la migración ────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('005_obligaciones')
  ON CONFLICT (version) DO NOTHING;

-- ─── GRANT para finanzas_user ────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;
GRANT SELECT ON v_obligaciones_instancias TO finanzas_user;

COMMIT;
