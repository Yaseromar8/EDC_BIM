-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 06 · PLANTILLAS DE FLUJO DE REVISION
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
--   + doc_review_plantillas   el MOLDE
--   ~ doc_reviews             tres columnas de PROCEDENCIA (traza, no autoridad)
--   + project_tools           siembra la herramienta en las obras existentes
--
-- LO QUE ESTA MIGRACION **NO** HACE, Y ES EL PUNTO DEL GAP
-- --------------------------------------------------------
-- No anade ninguna clave foranea de `doc_reviews` a `doc_review_plantillas` con
-- integridad viva. `plantilla_id` es un NUMERO SUELTO, a proposito:
--
--     PLANTILLA  --aplicar-->  REVISION        SI
--     PLANTILLA  --gobierna->  REVISION        NUNCA
--
-- Una revision iniciada conserva SU flujo en `doc_reviews.steps`, que ya era un
-- snapshot antes de este gap. Si hubiera una FK viva, borrar o editar una
-- plantilla arrastraria procesos ya firmados -- que en obra publica significa
-- cambiar quien tenia que aprobar algo DESPUES de que se aprobara.
--
-- Por eso tampoco hay ON DELETE CASCADE: no hay relacion que cascadear. Se
-- guarda ademas el NOMBRE y la VERSION aplicados, porque «plantilla 4» dejaria
-- de decir nada el dia que esa plantilla se renombre.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS doc_review_plantillas (
    id             BIGSERIAL PRIMARY KEY,

    -- ALCANCE. Una plantilla de ENTIDAD no pertenece a ninguna obra --por eso
    -- `project_id` es nulo-- y es lo que la hace servir en veinte obras. Una de
    -- OBRA pertenece a la suya.
    alcance        TEXT        NOT NULL DEFAULT 'OBRA',
    project_id     TEXT,

    nombre         TEXT        NOT NULL,
    descripcion    TEXT,
    pasos          JSONB       NOT NULL,

    -- HABILITADA / DESHABILITADA. No se borra: una plantilla que se aplico a
    -- treinta revisiones es parte de como se goberno esta obra, y borrarla
    -- dejaria esas revisiones citando un molde inexistente.
    activa         BOOLEAN     NOT NULL DEFAULT TRUE,

    -- La VERSION sube con cada modificacion del molde. Es lo que permite decir
    -- «esta revision se abrio con la version 2» cuando la plantilla ya va por
    -- la 5.
    version        INTEGER     NOT NULL DEFAULT 1,

    creado_por     INTEGER,
    creado_en      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modificado_por INTEGER,
    modificado_en  TIMESTAMP,
    history        JSONB       NOT NULL DEFAULT '[]'::jsonb
);

DO $$ BEGIN
    ALTER TABLE doc_review_plantillas ADD CONSTRAINT fk_rev_plantilla_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_review_plantillas ADD CONSTRAINT ck_rev_plantilla_alcance
        CHECK (alcance IN ('OBRA','ENTIDAD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EL ALCANCE Y LA OBRA TIENEN QUE CUADRAR. Una plantilla de OBRA sin obra no se
-- podria aplicar en ninguna parte; una de ENTIDAD con obra seria una de obra
-- disfrazada, y se aplicaria donde no toca.
DO $$ BEGIN
    ALTER TABLE doc_review_plantillas ADD CONSTRAINT ck_rev_plantilla_alcance_coherente
        CHECK ((alcance = 'OBRA'    AND project_id IS NOT NULL)
            OR (alcance = 'ENTIDAD' AND project_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UN MOLDE SIN PASOS NO ES UN FLUJO. La comprobacion fina --que cada paso
-- designe a alguien y diga que se le pide-- vive en `plantillas_de_revision`,
-- pero «al menos un paso» se garantiza en la base: es lo que impide que una
-- escritura directa deje una plantilla que se aplica y no hace nada.
DO $$ BEGIN
    ALTER TABLE doc_review_plantillas ADD CONSTRAINT ck_rev_plantilla_con_pasos
        CHECK (jsonb_typeof(pasos) = 'array' AND jsonb_array_length(pasos) >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El nombre identifica dentro de su ambito: dos plantillas «Aprobacion de
-- planos» en la misma obra son un error de quien la creo, no una eleccion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rev_plantilla_nombre_obra
    ON doc_review_plantillas(project_id, lower(nombre)) WHERE alcance = 'OBRA';
CREATE UNIQUE INDEX IF NOT EXISTS idx_rev_plantilla_nombre_entidad
    ON doc_review_plantillas(lower(nombre)) WHERE alcance = 'ENTIDAD';

CREATE INDEX IF NOT EXISTS idx_rev_plantilla_activas
    ON doc_review_plantillas(project_id) WHERE activa;


-- ── LA PROCEDENCIA, EN LA REVISION ─────────────────────────────────────────
-- Tres columnas sueltas y SIN clave foranea. Ver la cabecera: la revision no
-- vuelve a mirar la plantilla nunca mas, y una FK viva permitiria que editarla
-- arrastrase procesos ya firmados.
ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS plantilla_id BIGINT;
ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS plantilla_nombre TEXT;
ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS plantilla_version INTEGER;

CREATE INDEX IF NOT EXISTS idx_reviews_plantilla
    ON doc_reviews(plantilla_id) WHERE plantilla_id IS NOT NULL;


-- ── LA HERRAMIENTA ─────────────────────────────────────────────────────────
-- Las plantillas viven DENTRO de la herramienta `reviews`, que ya existe: no se
-- siembra una herramienta nueva. Configurar el flujo de revision no es otra
-- capacidad que se activa aparte -- es parte de tener revisiones.

COMMIT;
