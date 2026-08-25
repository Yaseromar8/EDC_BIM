-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 11 · CORE · ISSUE — condición detectada que exige corrección Y verificación
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- SOLO EL NUCLEO que GAP 04 necesita. Fuera, a proposito: campos
-- personalizados, causa raiz, estados configurables, tipos configurables.
-- Eso sigue siendo GAP 11 GRANDE y no se declara COMPLETE hoy.
--
--   + doc_issues        el objeto
--   ~ encargos          se amplia el tipo con 'ISSUE'
--   ~ plano_anclajes    se amplia el tipo con 'ISSUE'
--   + project_tools     siembra la herramienta
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS doc_issues (
    id              BIGSERIAL PRIMARY KEY,
    project_id      TEXT        NOT NULL,
    model_urn       VARCHAR(255) NOT NULL,
    codigo          TEXT        NOT NULL,

    tipo            TEXT        NOT NULL,
    titulo          TEXT        NOT NULL,
    descripcion     TEXT,

    -- ── UBICACION ──────────────────────────────────────────────────────────
    -- LA REVISION DONDE NACIO, y es INMUTABLE. Un punch se levanto mirando UNA
    -- lamina concreta; cuando esa revision quede superada, el punch tiene que
    -- seguir diciendo sobre cual se levanto. Si se pudiera reapuntar, la
    -- historia del defecto cambiaria cada vez que se emite un plano nuevo.
    --
    -- La COORDENADA no se guarda aqui: vive en `plano_anclajes` (GAP 02), que
    -- es donde ya se clavan los registros sobre una lamina. Dos columnas x/y
    -- aqui serian una segunda fuente de verdad para la misma pregunta.
    revision_id     BIGINT,
    ubicacion       TEXT,
    progresiva      TEXT,

    -- ── LAS TRES IDENTIDADES ───────────────────────────────────────────────
    autor_id        INTEGER     NOT NULL,   -- quien DETECTA
    responsable_id  INTEGER,                -- quien CORRIGE
    verificado_por  INTEGER,                -- quien VERIFICA
    created_by      TEXT,

    estado          TEXT        NOT NULL DEFAULT 'Abierto',
    vence_en        TIMESTAMP,

    evidencia            JSONB  NOT NULL DEFAULT '[]'::jsonb,  -- del defecto
    evidencia_correccion JSONB  NOT NULL DEFAULT '[]'::jsonb,  -- de la correccion

    -- LA EXCEPCION, DECLARADA. La pone un administrador de obra con motivo, y
    -- queda en el historial. Una excepcion que se puede leer es gobierno; una
    -- que se concede en silencio es un agujero.
    autoverificacion         BOOLEAN NOT NULL DEFAULT FALSE,
    autoverificacion_motivo  TEXT,
    autoverificacion_por     INTEGER,

    -- De donde vino, cuando lo genero otro objeto (protocolo, inspeccion...).
    origen_tipo     TEXT,
    origen_id       TEXT,

    history         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    creado_en       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    corregido_en    TIMESTAMP,
    verificado_en   TIMESTAMP,
    cerrado_en      TIMESTAMP
);

-- ── INTEGRIDAD ─────────────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT en las personas: borrar la cuenta de quien detecto, corrigio o
-- verifico un defecto dejaria un acto de obra sin autor.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_autor
        FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_responsable
        FOREIGN KEY (responsable_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_verificador
        FOREIGN KEY (verificado_por) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La revision: RESTRICT. Un issue apunta a la lamina donde nacio, y esa lamina
-- no puede desaparecer dejandolo sin referencia historica.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_revision
        FOREIGN KEY (revision_id) REFERENCES doc_plano_revisiones(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipos y estados: listas CERRADAS en la base. Configurarlos es GAP 11 grande.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_tipo
        CHECK (tipo IN ('PUNCH','NO_CONFORMIDAD','CALIDAD','SEGURIDAD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_estado
        CHECK (estado IN ('Abierto','Corregido','Verificado','Reabierto','Anulado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ LAS TRES INVARIANTES DEL OBJETO, EN LA BASE ═══
--
-- 1 · QUIEN CORRIGE NO VERIFICA SU PROPIA CORRECCION.
--     Sin esto, «verificado» significa «el responsable dice que ya esta».
--     La excepcion `autoverificacion` es la unica via, y es un dato explicito
--     que un administrador puso con motivo.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_verificador_distinto
        CHECK (verificado_por IS NULL
               OR responsable_id IS NULL
               OR verificado_por <> responsable_id
               OR autoverificacion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2 · VERIFICADO EXIGE VERIFICADOR. Un cierre sin quien lo firme no prueba nada.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_verificado_con_verificador
        CHECK (estado <> 'Verificado' OR verificado_por IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3 · CORREGIDO EXIGE EVIDENCIA. Un «ya esta arreglado» sin prueba obliga al
--     verificador a ir a mirar, y cuando la obra avanzo encima puede ser
--     imposible. La evidencia es lo que permite verificar DESDE el expediente.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_corregido_con_evidencia
        CHECK (estado NOT IN ('Corregido','Verificado')
               OR jsonb_array_length(evidencia_correccion) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La excepcion, si se usa, tiene que decir POR QUE y QUIEN la concedio.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_autoverificacion_justificada
        CHECK (NOT autoverificacion
               OR (coalesce(autoverificacion_motivo,'') <> ''
                   AND autoverificacion_por IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_codigo ON doc_issues(project_id, codigo);
CREATE INDEX IF NOT EXISTS idx_issues_estado ON doc_issues(project_id, estado);
CREATE INDEX IF NOT EXISTS idx_issues_tipo   ON doc_issues(project_id, tipo);
CREATE INDEX IF NOT EXISTS idx_issues_urn    ON doc_issues(model_urn);
CREATE INDEX IF NOT EXISTS idx_issues_revision ON doc_issues(revision_id);
CREATE INDEX IF NOT EXISTS idx_issues_origen ON doc_issues(origen_tipo, origen_id);

-- ── TIPOS AMPLIADOS ────────────────────────────────────────────────────────
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo
    CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL',
                           'PROTOCOLO','ISSUE'));

ALTER TABLE plano_anclajes DROP CONSTRAINT IF EXISTS ck_anclaje_tipo;
ALTER TABLE plano_anclajes ADD CONSTRAINT ck_anclaje_tipo
    CHECK (objeto_tipo IN ('RFI','REDLINE','SUBMITTAL','REVIEW','PROTOCOLO','ISSUE'));

-- ── CAPA 16 ────────────────────────────────────────────────────────────────
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, 'issues', TRUE, 'migracion 16'
  FROM projects p
 WHERE NOT EXISTS (SELECT 1 FROM project_tools t
                    WHERE t.project_id = p.id AND t.herramienta = 'issues')
ON CONFLICT DO NOTHING;

COMMIT;
