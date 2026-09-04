-- Bitácora Finanzas — 007_obligaciones_fiscales
-- Tablero de obligaciones fiscales, contables y mercantiles (#715).
-- Basado en el DOCUMENTO MAESTRO VALIDADO (SL Córdoba, corte 21-08-2026).
-- Ejecutar en finanzas_db con ignacio_admin, después de 001-006.
-- Migración atómica. Ejecutar con ON_ERROR_STOP=1.
--
-- FILOSOFÍA (del documento maestro, sección 1 y 10):
-- "Hecho, regla y decisión son objetos distintos." El tablero separa:
--  - aplicabilidad (¿esta obligación aplica de verdad? ¿confirmado o supuesto?)
--  - tramitación (¿en qué punto del ciclo está esta instancia concreta?)
-- El sistema RECUERDA, DOCUMENTA y da EVIDENCIA. NO calcula importes ni
-- presenta ni decide calificaciones: eso es revisión profesional (doble
-- control). Por eso NO hay aquí cálculo fiscal, solo control y estado.
--
-- Este módulo es APARTE del motor de obligaciones de tesorería (#743):
-- aquél vigila solvencia (¿tengo dinero?), éste vigila cumplimiento formal
-- (¿está presentado, con evidencia y aprobación?). Se enlazarán en el
-- futuro, no se fusionan.

BEGIN;

-- ─── obligaciones_fiscales (catálogo / plantilla) ────────────────────────
-- Cada fila es una obligación del mapa de control (036, 303, 200, cuentas
-- anuales, RETA, etc.). Pertenece a un ámbito (IMM CORE o Ignacio autónomo).
CREATE TABLE IF NOT EXISTS obligaciones_fiscales (
  id              SERIAL PRIMARY KEY,
  ambito_id       INTEGER NOT NULL REFERENCES ambitos(id) ON DELETE RESTRICT,
  codigo          TEXT UNIQUE,           -- slug interno para seed idempotente
  nombre          TEXT NOT NULL,         -- "Modelo 303 - IVA", "Cuentas anuales"...
  modelo          TEXT,                  -- "303", "200", null si no es un modelo
  bloque          TEXT NOT NULL CHECK (bloque IN ('A','B','C','D')),
  tipo            TEXT NOT NULL CHECK (tipo IN
                    ('fiscal','contable','mercantil','laboral','censal','adyacente')),
  organismo       TEXT,                  -- AEAT, Registro Mercantil, TGSS...
  -- APLICABILIDAD: ¿esta obligación aplica, y con qué certeza? (hecho vs supuesto)
  aplicabilidad   TEXT NOT NULL DEFAULT 'pendiente_validar' CHECK (aplicabilidad IN
                    ('confirmada','probable','condicional','pendiente_validar','no_aplica')),
  -- prioridad del documento maestro
  prioridad       TEXT CHECK (prioridad IN ('critica','alta','media','baja')),
  periodicidad    TEXT NOT NULL CHECK (periodicidad IN
                    ('mensual','trimestral','anual','segun_evento','continua','puntual')),
  regla_plazo     TEXT,                  -- regla en TEXTO, no fecha fija (ej. "20 primeros días del mes siguiente al trimestre")
  evidencia_min   TEXT,                  -- qué evidencia hay que archivar
  responsable     TEXT,                  -- "Gestoría", "Sociedad", "Administrador"...
  condicion       TEXT,                  -- condición que la hace aplicable (para bloque B)
  aviso           TEXT,                  -- punto de control / nota del documento maestro
  activa          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obl_fisc_ambito ON obligaciones_fiscales(ambito_id);
CREATE INDEX IF NOT EXISTS idx_obl_fisc_bloque ON obligaciones_fiscales(bloque);

-- ─── obligaciones_fiscales_instancias (cada vencimiento concreto) ────────
-- El 303 genera 4 al año, el 200 uno, etc. Cada instancia tiene su estado
-- de TRAMITACIÓN (el ciclo pedido en #715) independiente de la aplicabilidad.
CREATE TABLE IF NOT EXISTS obligaciones_fiscales_instancias (
  id               SERIAL PRIMARY KEY,
  obligacion_id    INTEGER NOT NULL REFERENCES obligaciones_fiscales(id) ON DELETE CASCADE,
  periodo          DATE NOT NULL,        -- primer día del periodo (2026-07-01 = 3T o Q3)
  periodo_etiqueta TEXT,                 -- "3T 2026", "Ejercicio 2026", "Enero 2026"
  fecha_apertura   DATE,                 -- cuándo se abre el plazo
  fecha_limite     DATE,                 -- fecha límite de presentación
  fecha_domiciliacion DATE,              -- límite de domiciliación (separado, ~5 días antes)
  -- TRAMITACIÓN: el ciclo de #715
  estado           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                     ('pendiente','en_preparacion','preparada','revisada',
                      'presentada','pagada','archivada','no_aplica')),
  importe_estimado NUMERIC(14,2),        -- si se conoce; NUNCA calculado por el sistema
  csv              TEXT,                 -- código seguro de verificación tras presentar
  nrc              TEXT,                 -- justificante de pago
  revisor          TEXT,                 -- quién lo revisó/aprobó (doble control)
  fecha_revision   DATE,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obligacion_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_obl_fisc_inst_obl     ON obligaciones_fiscales_instancias(obligacion_id);
CREATE INDEX IF NOT EXISTS idx_obl_fisc_inst_limite  ON obligaciones_fiscales_instancias(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_obl_fisc_inst_estado  ON obligaciones_fiscales_instancias(estado);

-- ─── obligaciones_fiscales_evidencias (documentos adjuntos) ──────────────
-- Referencias a evidencias/justificantes. MVP: guarda metadatos y una
-- referencia/URL o nombre de fichero; el almacenamiento real de ficheros
-- se resolverá aparte. Cada obligación no se marca "cumplida" con un check:
-- debe asociar evidencia (principio del documento, sección 9).
CREATE TABLE IF NOT EXISTS obligaciones_fiscales_evidencias (
  id            SERIAL PRIMARY KEY,
  instancia_id  INTEGER NOT NULL REFERENCES obligaciones_fiscales_instancias(id) ON DELETE CASCADE,
  descripcion   TEXT NOT NULL,
  referencia    TEXT,                    -- nombre de fichero, URL, o CSV/NRC relacionado
  fecha_origen  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obl_fisc_evid_inst ON obligaciones_fiscales_evidencias(instancia_id);

-- ─── v_obligaciones_fiscales ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_obligaciones_fiscales AS
SELECT
  o.id, o.ambito_id, a.nombre AS ambito_nombre,
  o.codigo, o.nombre, o.modelo, o.bloque, o.tipo, o.organismo,
  o.aplicabilidad, o.prioridad, o.periodicidad, o.regla_plazo,
  o.evidencia_min, o.responsable, o.condicion, o.aviso, o.activa,
  o.created_at, o.updated_at
FROM obligaciones_fiscales o
JOIN ambitos a ON a.id = o.ambito_id;

-- ══════════════════════════════════════════════════════════════════════════
-- SEED — obligaciones "seguras" marcadas en la sesión.
-- IMM CORE (ambito_id=1): del Bloque A del documento maestro validado.
-- Autónomo Ignacio (ambito_id=2): conocimiento general, TODAS pendiente_validar
-- (NO vienen del documento validado, deben contrastarse).
-- La aplicabilidad refleja lo que el documento dice: la mayoría del bloque A
-- son 'confirmada' o 'probable'; el 349 es 'pendiente_validar' (bloqueante Bélgica).
-- ══════════════════════════════════════════════════════════════════════════

-- ── IMM CORE SYSTEM SL (ambito_id = 1) ───────────────────────────────────
INSERT INTO obligaciones_fiscales
  (ambito_id, codigo, nombre, modelo, bloque, tipo, organismo, aplicabilidad, prioridad, periodicidad, regla_plazo, evidencia_min, responsable, aviso)
VALUES
  (1,'imm_036','Modelo 036 y mantenimiento censal','036','A','censal','AEAT','confirmada','alta','segun_evento',
   'Alta antes del inicio; modificaciones normalmente el mes siguiente al evento.',
   '036 con CSV/PDF, certificado censal, expediente del cambio.','Gestoría + sociedad',
   'No confundir razón social con marca comercial. El 037 está suprimido.'),
  (1,'imm_303','Modelo 303 - IVA','303','A','fiscal','AEAT','confirmada','alta','trimestral',
   '20 primeros días de abril/julio/octubre; 30 primeros de enero para 4T. Domiciliación independiente.',
   'Libros cerrados, ajustes, operaciones UE, justificante, NRC/cargo.','Gestoría + sociedad',
   'Si entra SII/REDEME/gran empresa, pasa a mensual.'),
  (1,'imm_390','Modelo 390 - Resumen anual IVA','390','A','fiscal','AEAT','probable','alta','anual',
   '30 primeros días de enero, salvo exoneración acreditada.',
   '390 o memo de exoneración firmado; conciliación de cuatro 303.','Gestoría',
   'No dejar como desactivado sin causa concreta. Exoneraciones tasadas.'),
  (1,'imm_349','Modelo 349 - Operaciones intracomunitarias','349','A','fiscal','AEAT','pendiente_validar','critica','trimestral',
   '20 primeros días del mes siguiente; reglas especiales julio y último periodo. Test 50.000€.',
   '349, CSV, conciliación con 303/libros, VIES, histórico 5 trimestres.','Gestoría + sistema',
   'BLOQUEANTE: operaciones con Bélgica. Confirmar ROI/VIES y periodicidad antes de automatizar.'),
  (1,'imm_200','Modelo 200 - Impuesto sobre Sociedades','200','A','fiscal','AEAT','confirmada','alta','anual',
   '25 días naturales tras los 6 meses posteriores al cierre; para 31/12, campaña de julio.',
   'Cuentas, conciliación fiscal, amortizaciones, BIN, deducciones, 200, NRC.','Gestoría + administrador',
   'Determinar tipo 2026/2027 por INCN; NO fijar 25% por defecto.'),
  (1,'imm_cuentas','Ciclo de cuentas anuales','','A','mercantil','Registro Mercantil','confirmada','alta','anual',
   'Formular ≤3 meses; junta ordinaria ≤6 meses; depósito ≤1 mes desde aprobación.',
   'Cuentas firmadas, acta, certificado, DTR, acuse, calificación.','Administrador + gestoría',
   'Comprobar ejercicios anteriores y posible cierre registral.'),
  (1,'imm_libros','Legalización telemática de libros','','A','mercantil','Registro Mercantil','confirmada','alta','anual',
   'Dentro de 4 meses desde cierre; para 31/12, hasta fin de abril.',
   'Ficheros exactos, huellas, certificaciones, acuse, nota de despacho.','Administrador + gestoría',
   'Guardar copia idéntica de lo enviado, no solo el acuse.'),
  (1,'imm_actas','Libro de actas y libro registro de socios','','A','mercantil','Registro Mercantil','confirmada','media','segun_evento',
   'Acta tras cada acuerdo; legalización anual junto con los libros.',
   'Actas, convocatorias, acuerdos, participaciones, transmisiones, acuse.','Administrador + asesor mercantil',
   'Socio mayoritario no sustituye al libro ni implica unipersonalidad.'),
  (1,'imm_titular_real','Titularidad real','','A','mercantil','Registro Mercantil','confirmada','media','anual',
   'Declaración integrada en depósito; cambios en plazo reglamentario desde conocimiento.',
   'DTR, cadena de control, fecha de conocimiento, justificante.','Administrador + gestoría',
   'Validar el cómputo del plazo de comunicación de cambios en el caso concreto.'),
  (1,'imm_contabilidad','Contabilidad ordenada y cierres','','A','contable','','confirmada','alta','continua',
   'Registro cronológico, conciliaciones periódicas, cierre 31/12.',
   'Diario, mayor, balances, inventario, conciliaciones, papeles de cierre.','Sociedad + gestoría',
   'El sistema debe preservar trazabilidad de asientos y documentos.'),
  (1,'imm_conservacion','Conservación documental','','A','contable','','confirmada','media','continua',
   'Matriz de retención: 6 años mercantil, 4 años fiscal ordinario, 10 años BIN/deducciones.',
   'Repositorio, índice, hashes, control de acceso, copias.','Sociedad',
   'No usar una única regla "guardar 6 años" para todo.')
ON CONFLICT (codigo) DO NOTHING;

-- ── Autónomo Ignacio (ambito_id = 2) — TODO pendiente_validar ────────────
INSERT INTO obligaciones_fiscales
  (ambito_id, codigo, nombre, modelo, bloque, tipo, organismo, aplicabilidad, prioridad, periodicidad, regla_plazo, evidencia_min, responsable, aviso)
VALUES
  (2,'auto_130','Modelo 130 - Pago fraccionado IRPF','130','A','fiscal','AEAT','pendiente_validar','alta','trimestral',
   '20 primeros días de abril/julio/octubre; enero para 4T. (Solo estimación directa.)',
   'Ingresos y gastos del trimestre, 130, justificante.','Gestoría + autónomo',
   'PENDIENTE VALIDAR: confirmar régimen IRPF (directa vs objetiva) y si aplica 130.'),
  (2,'auto_303','Modelo 303 - IVA (autónomo)','303','A','fiscal','AEAT','pendiente_validar','alta','trimestral',
   '20 primeros días de abril/julio/octubre; 30 primeros de enero para 4T.',
   'Libros de IVA, facturas emitidas/recibidas, 303, justificante.','Gestoría + autónomo',
   'PENDIENTE VALIDAR: confirmar si el autónomo repercute IVA o está exento.'),
  (2,'auto_390','Modelo 390 - Resumen anual IVA (autónomo)','390','A','fiscal','AEAT','pendiente_validar','media','anual',
   '30 primeros días de enero, salvo exoneración.',
   '390 o memo de exoneración; conciliación de los 303.','Gestoría + autónomo',
   'PENDIENTE VALIDAR: depende de si presenta 303.'),
  (2,'auto_reta','Cuota RETA - Seguridad Social autónomos','','A','laboral','TGSS','pendiente_validar','alta','mensual',
   'Cargo mensual; regularización anual por rendimientos reales.',
   'Recibos RETA, base de cotización, regularización.','Autónomo + gestoría laboral',
   'PENDIENTE VALIDAR: base de cotización y posibles bonificaciones.')
ON CONFLICT (codigo) DO NOTHING;

-- ─── Registro de la migración ────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('007_obligaciones_fiscales')
  ON CONFLICT (version) DO NOTHING;

-- ─── GRANT para finanzas_user ────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;
GRANT SELECT ON v_obligaciones_fiscales TO finanzas_user;

COMMIT;
