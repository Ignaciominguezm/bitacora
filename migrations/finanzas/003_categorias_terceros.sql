-- Bitácora Finanzas — 003_categorias_terceros
-- Pieza 1 de #743 (flujo de caja): taxonomías base.
-- Ejecutar en finanzas_db con ignacio_admin, después de 001 y 002.
-- Solo DDL + seed de categorías. NO siembra terceros (se crean desde UI).
--
-- updated_at: sin triggers. La app lo fija a now() en cada UPDATE.
--
-- Migración atómica: BEGIN/COMMIT envuelve DDL + seed + GRANT + registro.
-- Ejecutar con ON_ERROR_STOP=1. Sin CREATE INDEX CONCURRENTLY (no válido
-- dentro de transacción; no hace falta en tablas nuevas vacías).

BEGIN;

-- ─── categorias ──────────────────────────────────────────────────────────
-- Taxonomía jerárquica editable (profundidad libre vía parent_id).
-- tipo distingue gasto / ingreso / ambos. codigo es un slug interno,
-- opcional, usado SOLO para las categorías sembradas (seed idempotente):
-- permite reconocer una categoría base aunque el usuario renombre el
-- nombre visible. Las categorías creadas por el usuario desde la UI van
-- con codigo NULL.
CREATE TABLE IF NOT EXISTS categorias (
  id          SERIAL PRIMARY KEY,
  parent_id   INTEGER REFERENCES categorias(id) ON DELETE RESTRICT,
  nombre      TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('gasto', 'ingreso', 'ambos')),
  codigo      TEXT UNIQUE,              -- slug interno, solo para seeds
  orden       SMALLINT NOT NULL DEFAULT 0,
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categorias_parent ON categorias(parent_id);
CREATE INDEX IF NOT EXISTS idx_categorias_tipo   ON categorias(tipo);

-- Evita duplicados tontos: dos categorías hermanas activas con el mismo
-- nombre y tipo bajo el mismo parent. Se aplica solo a activas.
-- parent_id NULL (raíces) se normaliza con COALESCE(...,0) para que las
-- raíces se comparen entre sí (los NULL de un UNIQUE normal no colisionan).
-- lower(nombre) hace la unicidad insensible a mayúsculas ("Empresa"="empresa").
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_hermanas
  ON categorias (COALESCE(parent_id, 0), lower(nombre), tipo)
  WHERE activa = true;

-- ─── terceros ────────────────────────────────────────────────────────────
-- Entidad financiera (cliente/proveedor) DENTRO de un ámbito patrimonial.
-- No es un contacto abstracto: representa la relación financiera en ese
-- ámbito, por eso ambito_id es FK real.
-- core_contact_id es un VÍNCULO BLANDO a imm_db.core_contacts.id: NO hay
-- FK real (son bases de datos distintas). Es referencia informativa,
-- validada por la aplicación, no por Postgres. Finanzas no se bloquea si
-- imm_db cambia, cae o migra.
-- Datos fiscales (nif, direccion_fiscal): cuando lleguen las facturas
-- (pieza posterior), la factura guardará SNAPSHOT histórico de estos datos;
-- terceros puede cambiar, una factura antigua no se reescribe.
CREATE TABLE IF NOT EXISTS terceros (
  id               SERIAL PRIMARY KEY,
  ambito_id        INTEGER NOT NULL REFERENCES ambitos(id) ON DELETE RESTRICT,
  core_contact_id  INTEGER,             -- blando: imm_db.core_contacts.id, sin FK
  nombre           TEXT NOT NULL,       -- nombre financiero (puede diferir del de core_contacts)
  tipo             TEXT NOT NULL CHECK (tipo IN ('cliente', 'proveedor', 'ambos', 'otro')),
  nif              TEXT,
  direccion_fiscal TEXT,
  activa           BOOLEAN NOT NULL DEFAULT true,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terceros_ambito       ON terceros(ambito_id);
CREATE INDEX IF NOT EXISTS idx_terceros_core_contact ON terceros(core_contact_id);

-- No duplicar el mismo core_contact dentro del mismo ámbito (solo cuando hay vínculo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_terceros_ambito_core
  ON terceros (ambito_id, core_contact_id)
  WHERE core_contact_id IS NOT NULL;

-- No duplicar el mismo NIF dentro del mismo ámbito (pero el mismo NIF SÍ puede
-- aparecer en ámbitos distintos: no es único global).
-- upper(trim(nif)) normaliza para que " 12345678z " y "12345678Z" colisionen.
-- La app debería normalizar igualmente al guardar, pero el índice lo blinda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_terceros_ambito_nif
  ON terceros (ambito_id, upper(trim(nif)))
  WHERE nif IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- SEED DE CATEGORÍAS (idempotente por codigo)
-- Grupos de GASTO con sus subcategorías, y categorías de INGRESO (tipos de
-- servicio). Los grupos raíz llevan parent_id NULL. Las subcategorías se
-- enlazan por codigo del padre. Todo con ON CONFLICT (codigo) DO NOTHING
-- para que reejecutar el seed no duplique.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Grupos raíz de GASTO ──────────────────────────────────────────────────
INSERT INTO categorias (nombre, tipo, codigo, orden) VALUES
  ('Alimentación',   'gasto', 'g_alimentacion',   10),
  ('Salud y bebé',   'gasto', 'g_salud',          20),
  ('Vivienda',       'gasto', 'g_vivienda',       30),
  ('Suministros',    'gasto', 'g_suministros',    40),
  ('Transporte',     'gasto', 'g_transporte',     50),
  ('Formación',      'gasto', 'g_formacion',      60),
  ('Ocio',           'gasto', 'g_ocio',           70),
  ('Ropa',           'gasto', 'g_ropa',           80),
  ('Empresa',        'gasto', 'g_empresa',        90),
  ('Otros gastos',   'gasto', 'g_otros',         100)
ON CONFLICT (codigo) DO NOTHING;

-- ── Subcategorías de GASTO (parent por codigo) ───────────────────────────
-- Alimentación
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Pescadería',   'g_alimentacion_pescaderia', 10),
    ('Carnicería',   'g_alimentacion_carniceria', 20),
    ('Frutería',     'g_alimentacion_fruteria',   30),
    ('Panadería',    'g_alimentacion_panaderia',  40),
    ('Droguería',    'g_alimentacion_drogueria',  50),
    ('Supermercado', 'g_alimentacion_super',      60),
    ('Herboristería','g_alimentacion_herbo',      70),
    ('Otros',        'g_alimentacion_otros',      80)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_alimentacion'
ON CONFLICT (codigo) DO NOTHING;

-- Salud y bebé
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Medicamentos',   'g_salud_medicamentos', 10),
    ('Material médico','g_salud_material',      20),
    ('Pruebas médicas','g_salud_pruebas',       30),
    ('Otros',          'g_salud_otros',         40)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_salud'
ON CONFLICT (codigo) DO NOTHING;

-- Vivienda
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Hipoteca',            'g_vivienda_hipoteca',     10),
    ('Reparaciones',        'g_vivienda_reparaciones', 20),
    ('Muebles',             'g_vivienda_muebles',      30),
    ('Electrodomésticos',   'g_vivienda_electro',      40),
    ('Otras compras casa',  'g_vivienda_compras',      50),
    ('Mantenimiento',       'g_vivienda_mantenimiento',60),
    ('IBI',                 'g_vivienda_ibi',          70),
    ('Seguros',             'g_vivienda_seguros',      80),
    ('Seguro de vida',      'g_vivienda_seg_vida',     90),
    ('Seguro de hogar',     'g_vivienda_seg_hogar',   100),
    ('Alarma',              'g_vivienda_alarma',      110)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_vivienda'
ON CONFLICT (codigo) DO NOTHING;

-- Suministros
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Internet (PTV)',            'g_sum_internet_ptv',  10),
    ('Internet DIGI',             'g_sum_internet_digi', 20),
    ('Luz',                       'g_sum_luz',           30),
    ('Gas/Bombona',               'g_sum_gas',           40),
    ('Agua, basura, comunidad',   'g_sum_agua',          50),
    ('Otros',                     'g_sum_otros',         60)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_suministros'
ON CONFLICT (codigo) DO NOTHING;

-- Transporte
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Tren',          'g_trans_tren',          10),
    ('Bus',           'g_trans_bus',           20),
    ('Avión',         'g_trans_avion',         30),
    ('Barco',         'g_trans_barco',         40),
    ('Coche',         'g_trans_coche',         50),
    ('Gasolina',      'g_trans_gasolina',      60),
    ('Mantenimiento', 'g_trans_mantenimiento', 70),
    ('Reparaciones',  'g_trans_reparaciones',  80),
    ('Impuestos',     'g_trans_impuestos',     90)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_transporte'
ON CONFLICT (codigo) DO NOTHING;

-- Formación
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Platzi', 'g_form_platzi', 10),
    ('Otros',  'g_form_otros',  20)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_formacion'
ON CONFLICT (codigo) DO NOTHING;

-- Ocio
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Teatro y cine',            'g_ocio_teatro',    10),
    ('Juegos de mesa',           'g_ocio_juegos',    20),
    ('Libros/manuales rol/fig',  'g_ocio_libros',    30),
    ('Videojuegos',              'g_ocio_videojuegos',40),
    ('Alojamientos fuera',       'g_ocio_alojamientos',50),
    ('Comidas fuera/a domicilio','g_ocio_comidas',   60)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_ocio'
ON CONFLICT (codigo) DO NOTHING;

-- Ropa
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Zapatos',                    'g_ropa_zapatos',   10),
    ('Calcetines y calzoncillos',  'g_ropa_calcetines',20),
    ('Pantalones',                 'g_ropa_pantalones',30),
    ('Camisas y camisetas',        'g_ropa_camisas',   40),
    ('Chaquetas',                  'g_ropa_chaquetas', 50),
    ('Trajes',                     'g_ropa_trajes',    60),
    ('Ropa deportiva',             'g_ropa_deportiva', 70),
    ('Accesorios',                 'g_ropa_accesorios',80)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_ropa'
ON CONFLICT (codigo) DO NOTHING;

-- Empresa
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Autónomo',                'g_emp_autonomo',    10),
    ('Gestoría / Director fin', 'g_emp_gestoria',    20),
    ('Salarios',                'g_emp_salarios',    30),
    ('Seguridad Social (salarios)','g_emp_ss',       40),
    ('IVA',                     'g_emp_iva',         50),
    ('IRPF',                    'g_emp_irpf',        60),
    ('Equipo y tecnología',     'g_emp_equipo',      70),
    ('Material y papelería',    'g_emp_material',    80),
    ('Software y servicios',    'g_emp_software',    90),
    ('Hosting (Siteground)',    'g_emp_hosting',    100),
    ('Dominios',                'g_emp_dominios',   110),
    ('G. Workspace',            'g_emp_workspace',  120),
    ('Ads y publicidad',        'g_emp_ads',        130),
    ('Genially / Renderforest', 'g_emp_genially',   140),
    ('Amazon Prime / Business', 'g_emp_amazon',     150),
    ('Inteligencia artificial', 'g_emp_ia',         160),
    ('Plugins y programas',     'g_emp_plugins',    170),
    ('Otros',                   'g_emp_otros',      180)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_empresa'
ON CONFLICT (codigo) DO NOTHING;

-- Otros gastos
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, v.nombre, 'gasto', v.codigo, v.orden FROM categorias c,
  (VALUES
    ('Regalos', 'g_otros_regalos', 10),
    ('Otros',   'g_otros_otros',   20)
  ) AS v(nombre, codigo, orden)
WHERE c.codigo = 'g_otros'
ON CONFLICT (codigo) DO NOTHING;

-- ── Categorías de INGRESO (tipos de servicio) ────────────────────────────
-- Líneas de servicio, para analizar por qué me pagan (construir, mantener,
-- formar, automatizar, growth...). Editable/ampliable desde la UI.
-- Rolyfi NO es servicio: es producto propio → subcategoría de "Productos
-- propios / plataformas".
INSERT INTO categorias (nombre, tipo, codigo, orden) VALUES
  ('Desarrollo web',                  'ingreso', 'i_desarrollo_web', 10),
  ('Mantenimiento y soporte web',     'ingreso', 'i_mantenimiento',  20),
  ('SEO y contenidos',                'ingreso', 'i_seo',            30),
  ('Growth / marketing digital',      'ingreso', 'i_growth',         40),
  ('Publicidad / Ads',                'ingreso', 'i_ads',            50),
  ('Automatización e IA',             'ingreso', 'i_ia',             60),
  ('Formación en IA',                 'ingreso', 'i_formacion',      70),
  ('Consultoría técnica / infraestructura', 'ingreso', 'i_consultoria', 80),
  ('Encargos artísticos / diseño',    'ingreso', 'i_arte',           90),
  ('Productos propios / plataformas', 'ingreso', 'i_productos',     100),
  ('Otros ingresos',                  'ingreso', 'i_otros',         110)
ON CONFLICT (codigo) DO NOTHING;

-- Subcategoría de productos propios: Rolyfi.
INSERT INTO categorias (parent_id, nombre, tipo, codigo, orden)
SELECT id, 'Rolyfi', 'ingreso', 'i_productos_rolyfi', 10 FROM categorias
WHERE codigo = 'i_productos'
ON CONFLICT (codigo) DO NOTHING;

-- ─── Registro de la migración ────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('003_categorias_terceros')
  ON CONFLICT (version) DO NOTHING;

-- ─── GRANT para finanzas_user (dentro de la misma transacción) ───────────
-- Reaplica sobre TODAS las tablas/sequences del esquema; cubre las nuevas
-- (categorias, terceros) sin pisar las anteriores. finanzas_user solo DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finanzas_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finanzas_user;

COMMIT;
