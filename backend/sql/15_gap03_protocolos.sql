-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 03 · PROTOCOLOS E INSPECCIONES — la conformidad, con consecuencia
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
--   + doc_protocolos     la PLANTILLA: qué hay que comprobar
--   + doc_actas          UNA aplicación: qué se comprobó y si liberó
--   ~ encargos           se amplía el tipo con 'PROTOCOLO'
--   ~ plano_anclajes     se amplía el tipo con 'PROTOCOLO' (GAP 02 ya dio la
--                        capacidad de clavar un registro en un punto del plano)
--   + project_tools      siembra la herramienta en las obras existentes
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── LA PLANTILLA ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_protocolos (
    id            BIGSERIAL PRIMARY KEY,
    project_id    TEXT        NOT NULL,
    codigo        TEXT        NOT NULL,
    nombre        TEXT        NOT NULL,
    descripcion   TEXT,
    disciplina    TEXT,

    -- Las secciones y sus puntos. JSONB y no dos tablas más: una plantilla se
    -- lee y se escribe ENTERA, nunca por punto suelto, y partirla en filas
    -- obligaría a reconstruir el orden en cada lectura sin ganar una sola
    -- consulta útil.
    secciones     JSONB       NOT NULL DEFAULT '[]'::jsonb,

    activo        BOOLEAN     NOT NULL DEFAULT TRUE,
    creado_por    INTEGER,
    creado_en     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version       INTEGER     NOT NULL DEFAULT 1
);

DO $$ BEGIN
    ALTER TABLE doc_protocolos ADD CONSTRAINT fk_protocolos_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_protocolos ADD CONSTRAINT ck_protocolos_disciplina
        CHECK (disciplina IS NULL OR disciplina IN
               ('ARQ','EST','SAN','ELE','MEC','CIV','VIA','TOP','GEN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_protocolos_codigo
    ON doc_protocolos(project_id, codigo);

-- ── EL ACTA ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_actas (
    id             BIGSERIAL PRIMARY KEY,
    project_id     TEXT        NOT NULL,
    model_urn      VARCHAR(255) NOT NULL,
    codigo         TEXT        NOT NULL,

    protocolo_id   BIGINT,
    -- LA PLANTILLA SE COPIA AL LEVANTAR EL ACTA, no se referencia y ya.
    -- Si la plantilla cambiara después, un acta firmada diría haber comprobado
    -- puntos que en su día no existían — que es falsificar el pasado con buena
    -- intención. `protocolo_nombre` y `protocolo_version` guardan CUÁL se usó.
    protocolo_nombre  TEXT,
    protocolo_version INTEGER,

    titulo         TEXT        NOT NULL,
    ubicacion      TEXT,                  -- «Losa eje 4, nivel +3.20»
    progresiva     TEXT,                  -- obra lineal: «PK 0+340»

    items          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    firmas         JSONB       NOT NULL DEFAULT '[]'::jsonb,

    estado         TEXT        NOT NULL DEFAULT 'Borrador',
    motivo_veredicto TEXT,

    autor_id       INTEGER     NOT NULL,
    responsable_id INTEGER,
    created_by     TEXT,

    history        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    vence_en       TIMESTAMP,
    creada_en      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    firmada_en     TIMESTAMP,
    cerrada_en     TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_actas ADD CONSTRAINT fk_actas_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT, igual que en los submittals: borrar la cuenta de quien firmó un
-- acta dejaría una conformidad sin firmante, y la firma es todo lo que este
-- documento produce.
DO $$ BEGIN
    ALTER TABLE doc_actas ADD CONSTRAINT fk_actas_autor
        FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La plantilla SÍ puede desaparecer: el acta ya guardó su nombre y su versión,
-- así que no depende de ella para seguir siendo legible.
DO $$ BEGIN
    ALTER TABLE doc_actas ADD CONSTRAINT fk_actas_protocolo
        FOREIGN KEY (protocolo_id) REFERENCES doc_protocolos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_actas ADD CONSTRAINT ck_actas_estado
        CHECK (estado IN ('Borrador','Firmada','Liberado','No liberado','Anulada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ LA INVARIANTE DE ESTE GAP, EN LA BASE ═══
--
-- UN ACTA LIBERADA NO PUEDE CONTENER UN PUNTO NO CONFORME.
--
-- La comprobación vive también en el manejador, pero una regla que solo está
-- en Python la salta cualquier script — y esta es justo la que hace que la
-- firma pruebe algo. Si un acta pudiera declararse liberada con un punto en
-- rojo dentro, el protocolo sería un trámite.
DO $$ BEGIN
    ALTER TABLE doc_actas ADD CONSTRAINT ck_actas_liberada_sin_no_conformes
        CHECK (estado <> 'Liberado' OR NOT (items @> '[{"resultado":"No conforme"}]'::jsonb));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un veredicto negativo tiene que decir POR QUÉ. «No liberado» sin motivo no
-- le sirve a quien tiene que levantarlo.
DO $$ BEGIN
    ALTER TABLE doc_actas ADD CONSTRAINT ck_actas_no_liberado_con_motivo
        CHECK (estado <> 'No liberado' OR coalesce(motivo_veredicto,'') <> '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_actas_codigo ON doc_actas(project_id, codigo);
CREATE INDEX IF NOT EXISTS idx_actas_estado   ON doc_actas(project_id, estado);
CREATE INDEX IF NOT EXISTS idx_actas_urn      ON doc_actas(model_urn);
CREATE INDEX IF NOT EXISTS idx_actas_protocolo ON doc_actas(protocolo_id);

-- ── ENCARGOS Y ANCLAJES: ampliar los tipos ────────────────────────────────
--
-- Se REEMPLAZA la restricción, no se añade otra: dos CHECK sobre la misma
-- columna se cumplen a la vez y la vieja seguiría prohibiendo el valor nuevo.
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo
    CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL','PROTOCOLO'));

-- Un acta se levanta EN UN SITIO, y ese sitio suele estar en un plano. GAP 02
-- ya dio la capacidad; aquí solo se admite el tipo.
ALTER TABLE plano_anclajes DROP CONSTRAINT IF EXISTS ck_anclaje_tipo;
ALTER TABLE plano_anclajes ADD CONSTRAINT ck_anclaje_tipo
    CHECK (objeto_tipo IN ('RFI','REDLINE','SUBMITTAL','REVIEW','PROTOCOLO'));

-- ── CAPA 16 ────────────────────────────────────────────────────────────────
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, 'protocolos', TRUE, 'migracion 15'
  FROM projects p
 WHERE NOT EXISTS (SELECT 1 FROM project_tools t
                    WHERE t.project_id = p.id AND t.herramienta = 'protocolos')
ON CONFLICT DO NOTHING;

COMMIT;
