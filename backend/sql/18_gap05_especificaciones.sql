-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 05 · LA ESPECIFICACION COMO OBJETO
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- NO CREA UN SEGUNDO ALMACEN, igual que GAP 02. Cada revision APUNTA a un
-- file_version que ya vive en el expediente, con su carpeta, su permiso y su
-- SHA-256. Por eso el permiso de recurso se hereda solo y la capa 09 sigue
-- siendo la unica autoridad sobre quien ve que.
--
--   + doc_spec_sets            el acto de emitir un juego de especificaciones
--   + doc_spec_divisiones      la estructura, que la fija el CONTRATO
--   + doc_spec_secciones       la identidad: numero y titulo
--   + doc_spec_revisiones      que texto vale y cual quedo superado
--   ~ doc_submittals           `spec_section_id`: la FK que GAP 01 dejo prevista
--   + project_tools            siembra la herramienta en las obras existentes
--
-- LO QUE **NO** HACE, Y ES DELIBERADO
-- ------------------------------------
-- No convierte `doc_submittals.spec_seccion` (texto) en la nueva clave foranea.
-- Esos textos los escribio una persona a mano y no hay forma de saber a que
-- seccion se referia sin inventarselo. La columna de texto SE CONSERVA tal
-- cual; el que quiera enlazarla, la enlaza a mano desde la pantalla y queda
-- registrado quien lo hizo. Reescribir historia para que cuadre un modelo
-- nuevo es exactamente lo que este proyecto tiene prohibido.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── EL ACTO DE EMITIR ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_spec_sets (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT        NOT NULL,
    nombre      TEXT        NOT NULL,
    descripcion TEXT,
    emitido_en  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emitido_por INTEGER,
    creado_en   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_spec_sets ADD CONSTRAINT fk_spec_sets_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_sets_nombre
    ON doc_spec_sets(project_id, lower(nombre));


-- ── LA ESTRUCTURA ──────────────────────────────────────────────────────────
--
-- POR OBRA, y no una lista cerrada en el codigo. Los dos fabricantes usan
-- MasterFormat (00 a 48), que es el estandar norteamericano; en obra publica
-- peruana la estructura que manda es la del PRESUPUESTO, porque es contra ella
-- contra la que se valoriza. Imponer una obligaria a la entidad a mantener dos
-- estructuras paralelas del mismo proyecto. El catalogo estandar se ofrece como
-- SUGERENCIA desde el codigo (`especificaciones.CATALOGO_SUGERIDO`).
CREATE TABLE IF NOT EXISTS doc_spec_divisiones (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT        NOT NULL,
    numero      TEXT        NOT NULL,        -- normalizado a dos digitos: '03'
    titulo      TEXT        NOT NULL,
    creado_por  INTEGER,
    creado_en   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_spec_divisiones ADD CONSTRAINT fk_spec_div_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_div_numero
    ON doc_spec_divisiones(project_id, numero);


-- ── LA IDENTIDAD ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_spec_secciones (
    id           BIGSERIAL PRIMARY KEY,
    project_id   TEXT        NOT NULL,
    model_urn    VARCHAR(255) NOT NULL,
    division_id  BIGINT,
    numero       TEXT        NOT NULL,       -- '03 30 00' o '03.02.01'
    titulo       TEXT        NOT NULL,
    creado_por   INTEGER,
    creado_en    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_spec_secciones ADD CONSTRAINT fk_spec_sec_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT y no CASCADE: borrar una division no puede llevarse por delante las
-- secciones que cuelgan de ella. Una seccion tiene submittals apuntandola.
DO $$ BEGIN
    ALTER TABLE doc_spec_secciones ADD CONSTRAINT fk_spec_sec_division
        FOREIGN KEY (division_id) REFERENCES doc_spec_divisiones(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EL NUMERO ES LA IDENTIDAD: uno por obra y no dos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_sec_numero
    ON doc_spec_secciones(project_id, numero);
CREATE INDEX IF NOT EXISTS idx_spec_sec_division ON doc_spec_secciones(division_id);


-- ── QUE TEXTO VALE ─────────────────────────────────────────────────────────
--
-- Misma forma que `doc_plano_revisiones` A PROPOSITO: la mecanica de revisar
-- vive una sola vez, en `revisiones_de_documento`, y esa funcion compartida
-- escribe en las dos tablas. Si las columnas divergieran, el motor comun
-- dejaria de servir para una de las dos y volveriamos a tener dos copias.
CREATE TABLE IF NOT EXISTS doc_spec_revisiones (
    id               BIGSERIAL PRIMARY KEY,
    seccion_id       BIGINT      NOT NULL,
    codigo_revision  TEXT        NOT NULL,
    set_id           BIGINT,

    file_node_id     UUID        NOT NULL,
    file_version_id  UUID,

    estado           TEXT        NOT NULL DEFAULT 'Vigente',
    emitida_en       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emitida_por      INTEGER,
    superada_en      TIMESTAMP,
    superada_por_id  BIGINT,
    motivo           TEXT,
    creada_en        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_spec_revisiones ADD CONSTRAINT fk_spec_rev_seccion
        FOREIGN KEY (seccion_id) REFERENCES doc_spec_secciones(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_spec_revisiones ADD CONSTRAINT fk_spec_rev_set
        FOREIGN KEY (set_id) REFERENCES doc_spec_sets(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El nodo: RESTRICT. Borrar el fichero al que apunta una revision emitida
-- dejaria el expediente diciendo que existe un texto que ya no existe.
DO $$ BEGIN
    ALTER TABLE doc_spec_revisiones ADD CONSTRAINT fk_spec_rev_nodo
        FOREIGN KEY (file_node_id) REFERENCES file_nodes(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_spec_revisiones ADD CONSTRAINT ck_spec_rev_estado
        CHECK (estado IN ('Vigente','Superada','Anulada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_spec_revisiones ADD CONSTRAINT ck_spec_rev_superada_con_fecha
        CHECK (estado <> 'Superada' OR superada_en IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_rev_codigo
    ON doc_spec_revisiones(seccion_id, upper(codigo_revision));

-- ═══ LA INVARIANTE DE ESTE GAP ═══
-- UNA SOLA REVISION VIGENTE POR SECCION, garantizada por la BASE. Dos vigentes
-- significa gente comprando material contra exigencias distintas sin que nadie
-- lo sepa -- y en un submittal eso se descubre cuando el material ya esta en
-- obra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_una_sola_vigente
    ON doc_spec_revisiones(seccion_id) WHERE estado = 'Vigente';

CREATE INDEX IF NOT EXISTS idx_spec_rev_nodo ON doc_spec_revisiones(file_node_id);


-- ── EL ENGANCHE QUE GAP 01 DEJO PREVISTO ───────────────────────────────────
--
-- `doc_submittals` ya tenia `spec_seccion` y `spec_titulo` como TEXTO, con la
-- nota «hoy texto, manana clave foranea (GAP 05)». Hoy es manana.
--
-- El texto NO se migra ni se borra: se conserva al lado. Los submittals que ya
-- existen escribieron ese texto a mano y no hay forma de saber a que seccion se
-- referian sin inventarlo. Quien quiera enlazarlos, los enlaza uno a uno y
-- queda registrado.
ALTER TABLE doc_submittals ADD COLUMN IF NOT EXISTS spec_section_id BIGINT;

DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT fk_submittal_spec_section
        FOREIGN KEY (spec_section_id) REFERENCES doc_spec_secciones(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_submittal_spec_section
    ON doc_submittals(spec_section_id) WHERE spec_section_id IS NOT NULL;


-- ── LA HERRAMIENTA, SEMBRADA EN LAS OBRAS QUE YA EXISTEN ───────────────────
-- Capa 16: una herramienta que no esta en `project_tools` no se puede activar,
-- y la pantalla no la ofreceria nunca.
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, 'especificaciones', TRUE, 'migracion 18'
  FROM projects p
 WHERE NOT EXISTS (SELECT 1 FROM project_tools t
                    WHERE t.project_id = p.id AND t.herramienta = 'especificaciones')
ON CONFLICT DO NOTHING;

COMMIT;
