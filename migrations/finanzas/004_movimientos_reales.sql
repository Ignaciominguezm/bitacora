-- Bitácora Finanzas — 004_movimientos_reales
-- Pieza 2 de #743 (flujo de caja): el motor. Movimientos reales + saldo
-- calculado derivado + auditoría de traspasos.
-- Ejecutar en finanzas_db con ignacio_admin, después de 001, 002 y 003.
-- Migración atómica (BEGIN/COMMIT). Ejecutar con ON_ERROR_STOP=1.
--
-- PRINCIPIOS DE DISEÑO (decididos en #743 Pieza 2):
-- - importe FIRMADO como dato canónico: +entra / -sale. saldo = SUM(importe).
--   CHECK de coherencia signo<->tipo para que nunca entre un importe absurdo.
-- - Un traspaso interno = DOS apuntes (salida + entrada) ligados por
--   grupo_traspaso. Un traspaso externo (Claudia, Bizum) = UN apunte de
--   salida suelto, sin grupo, con tercero_id.
-- - NO se guarda ambito_id en el movimiento: se deriva de cuenta->ambito
--   vía JOIN (evita incoherencias). Se expone en vistas.
-- - La vista de saldo NO sustituye a v_cuentas_saldo_actual (#711). Se crean
--   vistas NUEVAS con saldo_observado / saldo_calculado / diferencia. La
--   transición oficial a "saldo calculado como fuente" es la Pieza 4.
-- - Ancla temporal: saldo(cuenta,fecha) = saldo_apertura(cuenta, año(fecha))
--   + Σ movimientos DESDE el 1-ene de ese año HASTA fecha. No "todo el
--   histórico" (duplicaría lo anterior a la apertura).

BEGIN;

-- ─── movimientos_reales ──────────────────────────────────────────────────
-- Cada fila es UN apunte sobre UNA cuenta. Ingreso/gasto/traspaso/ajuste.
CREATE TABLE IF NOT EXISTS movimientos_reales (
  id              SERIAL PRIMARY KEY,
  cuenta_id       INTEGER NOT NULL REFERENCES cuentas_financieras(id) ON DELETE RESTRICT,
  fecha           DATE NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN
                    ('ingreso','gasto','traspaso_salida','traspaso_entrada','ajuste')),
  importe         NUMERIC(14,2) NOT NULL,
  moneda          CHAR(3) NOT NULL DEFAULT 'EUR',
  categoria_id    INTEGER REFERENCES categorias(id) ON DELETE RESTRICT,
  tercero_id      INTEGER REFERENCES terceros(id) ON DELETE RESTRICT,
  grupo_traspaso  UUID,            -- une las 2 patas de un traspaso interno
  concepto        TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Importe nunca cero.
  CONSTRAINT chk_mov_importe_no_cero CHECK (importe <> 0),

  -- Coherencia signo <-> tipo.
  CONSTRAINT chk_mov_signo_tipo CHECK (
       (tipo = 'ingreso'          AND importe > 0)
    OR (tipo = 'gasto'            AND importe < 0)
    OR (tipo = 'traspaso_salida'  AND importe < 0)
    OR (tipo = 'traspaso_entrada' AND importe > 0)
    OR (tipo = 'ajuste')
  ),

  -- Obligatoriedad por tipo (validado en BD, no solo en UI):
  -- gasto exige categoría.
  CONSTRAINT chk_mov_gasto_categoria CHECK (
    tipo <> 'gasto' OR categoria_id IS NOT NULL
  ),
  -- ingreso exige tercero.
  CONSTRAINT chk_mov_ingreso_tercero CHECK (
    tipo <> 'ingreso' OR tercero_id IS NOT NULL
  ),
  -- traspaso_entrada exige grupo (siempre es parte de un par interno).
  CONSTRAINT chk_mov_entrada_grupo CHECK (
    tipo <> 'traspaso_entrada' OR grupo_traspaso IS NOT NULL
  ),
  -- traspaso_salida: si tiene grupo es interno (ok); si NO tiene grupo es
  -- externo y entonces exige tercero_id (a dónde fue: Claudia, Bizum...).
  CONSTRAINT chk_mov_salida_interno_o_externo CHECK (
    tipo <> 'traspaso_salida'
    OR grupo_traspaso IS NOT NULL
    OR (grupo_traspaso IS NULL AND tercero_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_mov_cuenta_fecha ON movimientos_reales(cuenta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_mov_fecha        ON movimientos_reales(fecha);
CREATE INDEX IF NOT EXISTS idx_mov_categoria    ON movimientos_reales(categoria_id);
CREATE INDEX IF NOT EXISTS idx_mov_tercero      ON movimientos_reales(tercero_id);
CREATE INDEX IF NOT EXISTS idx_mov_grupo        ON movimientos_reales(grupo_traspaso)
  WHERE grupo_traspaso IS NOT NULL;

-- ─── v_movimientos_reales ────────────────────────────────────────────────
-- Movimientos con su ámbito, cuenta, categoría y tercero resueltos por JOIN.
-- El ámbito se DERIVA aquí (no se guarda en la tabla base).
CREATE OR REPLACE VIEW v_movimientos_reales AS
SELECT
  m.id, m.fecha, m.tipo, m.importe, m.moneda,
  m.cuenta_id, cf.nombre AS cuenta_nombre, cf.tipo AS cuenta_tipo,
  cf.ambito_id, a.nombre AS ambito_nombre,
  m.categoria_id, cat.nombre AS categoria_nombre,
  m.tercero_id, t.nombre AS tercero_nombre,
  m.grupo_traspaso, m.concepto, m.notas,
  m.created_at, m.updated_at
FROM movimientos_reales m
JOIN cuentas_financieras cf ON cf.id = m.cuenta_id
JOIN ambitos a              ON a.id = cf.ambito_id
LEFT JOIN categorias cat    ON cat.id = m.categoria_id
LEFT JOIN terceros t        ON t.id = m.tercero_id;

-- ─── v_cuentas_saldo_calculado ───────────────────────────────────────────
-- Saldo CALCULADO por cuenta para el AÑO EN CURSO:
--   saldo_apertura(año actual) + Σ movimientos desde 1-ene del año actual.
-- NO sustituye a v_cuentas_saldo_actual (#711, saldo observado/manual).
-- Expone las tres cifras para poder conciliar en Pieza 4.
--
-- Apertura ausente: NO se asume 0 (sería un saldo falso). Si falta la
-- apertura del año, saldo_calculado queda NULL y requiere_saldo_apertura=true.
-- suma_movimientos sí puede ser 0 legítimo (cuenta sin movimientos aún).
-- LEFT JOIN en todo: no oculta cuentas sin movimientos ni sin snapshot.
CREATE OR REPLACE VIEW v_cuentas_saldo_calculado AS
WITH anio AS (SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y),
apertura AS (
  SELECT sa.cuenta_id, sa.saldo
  FROM saldos_apertura sa, anio
  WHERE sa.anio = anio.y
),
movs AS (
  SELECT m.cuenta_id, COALESCE(SUM(m.importe), 0) AS suma
  FROM movimientos_reales m, anio
  WHERE m.fecha >= make_date(anio.y, 1, 1)
    AND m.fecha <  make_date(anio.y + 1, 1, 1)
  GROUP BY m.cuenta_id
),
observado AS (
  -- último snapshot manual de saldos_semanales por cuenta (saldo observado)
  SELECT DISTINCT ON (ss.cuenta_id) ss.cuenta_id, ss.saldo, ss.semana
  FROM saldos_semanales ss
  ORDER BY ss.cuenta_id, ss.semana DESC
)
SELECT
  cf.id AS cuenta_id, cf.nombre AS cuenta_nombre, cf.ambito_id,
  ap.saldo                                           AS saldo_apertura,
  COALESCE(mv.suma, 0)                               AS suma_movimientos,
  -- saldo_calculado NULL si no hay apertura (no inventamos 0):
  CASE WHEN ap.saldo IS NULL THEN NULL
       ELSE ap.saldo + COALESCE(mv.suma, 0)
  END                                                AS saldo_calculado,
  (ap.saldo IS NULL)                                 AS requiere_saldo_apertura,
  ob.saldo                                           AS saldo_observado,
  ob.semana                                          AS saldo_observado_semana,
  -- diferencia solo tiene sentido si hay apertura Y snapshot observado:
  CASE WHEN ap.saldo IS NULL OR ob.saldo IS NULL THEN NULL
       ELSE ob.saldo - (ap.saldo + COALESCE(mv.suma, 0))
  END                                                AS diferencia_conciliacion
FROM cuentas_financieras cf
LEFT JOIN apertura  ap ON ap.cuenta_id = cf.id
LEFT JOIN movs      mv ON mv.cuenta_id = cf.id
LEFT JOIN observado ob ON ob.cuenta_id = cf.id;

-- ─── v_traspasos_internos_invalidos ──────────────────────────────────────
-- Auditoría: detecta grupos de traspaso interno mal formados. Debe estar
-- SIEMPRE vacía si el backend crea los traspasos correctamente.
-- Solo mira grupos internos (grupo_traspaso IS NOT NULL); ignora
-- ingresos/gastos/ajustes y traspasos externos (que van sin grupo).
-- Chequea:
--  - nº de patas distinto de 2
--  - no hay exactamente una salida y una entrada
--  - importes absolutos distintos entre las patas
--  - misma cuenta en ambas patas (deberían ser dos cuentas distintas)
--  - las dos cuentas pertenecen a ámbitos distintos: un traspaso entre
--    Ignacio personal e IMM CORE NO es neutro (patrimonios separados),
--    así que un grupo interno cuyas patas cruzan ámbitos es inválido.
CREATE OR REPLACE VIEW v_traspasos_internos_invalidos AS
SELECT
  m.grupo_traspaso,
  COUNT(*)                                             AS num_patas,
  COUNT(*) FILTER (WHERE m.tipo = 'traspaso_salida')   AS num_salidas,
  COUNT(*) FILTER (WHERE m.tipo = 'traspaso_entrada')  AS num_entradas,
  COUNT(DISTINCT m.cuenta_id)                          AS num_cuentas,
  COUNT(DISTINCT abs(m.importe))                       AS num_importes_abs,
  COUNT(DISTINCT cf.ambito_id)                         AS num_ambitos
FROM movimientos_reales m
JOIN cuentas_financieras cf ON cf.id = m.cuenta_id
WHERE m.grupo_traspaso IS NOT NULL
GROUP BY m.grupo_traspaso
HAVING
     COUNT(*) <> 2
  OR COUNT(*) FILTER (WHERE m.tipo = 'traspaso_salida')  <> 1
  OR COUNT(*) FILTER (WHERE m.tipo = 'traspaso_entrada') <> 1
  OR COUNT(DISTINCT m.cuenta_id)    <> 2
  OR COUNT(DISTINCT abs(m.importe)) <> 1
  OR COUNT(DISTINCT cf.ambito_id)   <> 1;

-- ─── Registro de la migración ────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('004_movimientos_reales')
  ON CONFLICT (version) DO NOTHING;

-- ─── GRANT para finanzas_user ────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;
GRANT SELECT ON v_movimientos_reales, v_cuentas_saldo_calculado,
  v_traspasos_internos_invalidos TO finanzas_user;

COMMIT;
