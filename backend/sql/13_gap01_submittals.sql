-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 01 · SUBMITTALS — someter un producto a aprobacion contra la especificacion
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- QUE ANADE Y QUE NO TOCA
--   + doc_submittals            el registro
--   ~ encargos.ck_encargos_tipo se AMPLIA para admitir 'SUBMITTAL'
--   + project_tools             siembra la herramienta en las obras existentes
--   NADA MAS. No se toca una sola fila de historia de ningun otro objeto.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── EL REGISTRO ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_submittals (
    id                  BIGSERIAL PRIMARY KEY,
    project_id          TEXT        NOT NULL,
    model_urn           VARCHAR(255) NOT NULL,
    codigo              TEXT        NOT NULL,

    titulo              TEXT        NOT NULL,
    descripcion         TEXT,

    -- La especificacion. HOY TEXTO, manana clave foranea (GAP 05). Se deja
    -- desde el principio para que ese dia sea una FK y no una migracion de
    -- datos inventados.
    spec_seccion        TEXT,
    spec_titulo         TEXT,

    -- El PAQUETE agrupa submittals relacionados (los dos fabricantes lo tienen).
    -- Texto, no tabla: un paquete sin submittals dentro no es nada, y una tabla
    -- para un nombre seria estructura sin contenido.
    paquete             TEXT,

    -- LOS TRES PAPELES. Identidad ESTRUCTURADA desde el primer dia: el RFI y el
    -- Red Line nacieron con responsable en texto libre y costo un rediseno.
    autor_id            INTEGER     NOT NULL,   -- contratista responsable
    responsable_id      INTEGER,                -- submittal manager
    created_by          TEXT,                   -- instantanea legible, NO identidad

    -- EL FLUJO DE REVISION. Misma forma que doc_reviews A PROPOSITO: los
    -- resuelve el MISMO modulo (flujo_de_revision), y por eso no pueden
    -- discrepar sobre a quien le toca.
    steps               JSONB       NOT NULL DEFAULT '[]'::jsonb,
    current_step        INTEGER     NOT NULL DEFAULT 0,
    paso_vence_en       TIMESTAMP,

    estado              TEXT        NOT NULL DEFAULT 'Borrador',
    veredicto           TEXT,
    veredicto_en        TIMESTAMP,
    veredicto_por       INTEGER,

    -- REVISIONES: un rechazo NO reabre la fila, crea otra. `revision` numera y
    -- `revision_de` encadena. Asi el rechazo sigue existiendo y se puede probar.
    revision            INTEGER     NOT NULL DEFAULT 0,
    revision_de         BIGINT,

    adjuntos            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    distribucion        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    history             JSONB       NOT NULL DEFAULT '[]'::jsonb,

    vence_en            TIMESTAMP,
    created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enviado_en          TIMESTAMP,
    cerrado_en          TIMESTAMP,
    cerrado_por         INTEGER
);

-- ── INTEGRIDAD ─────────────────────────────────────────────────────────────

-- La obra: CASCADE, como el resto del expediente.
DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT fk_submittals_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Las personas: RESTRICT, y esto es deliberado y distinto de la obra. Borrar la
-- cuenta de quien sometio un producto a aprobacion dejaria un acto contractual
-- sin autor. Que falle el borrado y haya que mirarlo es exactamente lo correcto.
DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT fk_submittals_autor
        FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT fk_submittals_responsable
        FOREIGN KEY (responsable_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La cadena de revisiones apunta dentro de la propia tabla.
DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT fk_submittals_revision_de
        FOREIGN KEY (revision_de) REFERENCES doc_submittals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estados y veredictos: listas CERRADAS en la base, no solo en Python. Una
-- comprobacion que vive unicamente en el codigo la salta cualquier script.
DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT ck_submittals_estado
        CHECK (estado IN ('Borrador','Enviado','En revision','Respondido','Cerrado','Anulado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT ck_submittals_veredicto
        CHECK (veredicto IS NULL OR veredicto IN
               ('Aprobado','Aprobado con observaciones','Revisar y reenviar',
                'Rechazado','Solo para informacion'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CERRADO SIN VEREDICTO NO EXISTE. Es la invariante contractual de este objeto:
-- un submittal cerrado dice si el producto entra en la obra o no entra.
DO $$ BEGIN
    ALTER TABLE doc_submittals ADD CONSTRAINT ck_submittals_cierre_con_veredicto
        CHECK (estado <> 'Cerrado' OR veredicto IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El codigo es unico DENTRO DE LA OBRA y por revision: SUB-007 rev.0 y
-- SUB-007 rev.1 son el mismo submittal en dos momentos, y ambos deben existir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submittals_codigo_obra
    ON doc_submittals(project_id, codigo, revision);

CREATE INDEX IF NOT EXISTS idx_submittals_obra    ON doc_submittals(project_id);
CREATE INDEX IF NOT EXISTS idx_submittals_urn     ON doc_submittals(model_urn);
CREATE INDEX IF NOT EXISTS idx_submittals_estado  ON doc_submittals(project_id, estado);
CREATE INDEX IF NOT EXISTS idx_submittals_spec    ON doc_submittals(project_id, spec_seccion);

-- ── ENCARGOS: AMPLIAR EL TIPO ──────────────────────────────────────────────
--
-- Sin esto `encargos.abrir` rechazaria el tipo y el submittal no tendria
-- pelota; y `divergencias()` lanzaria TipoNoInterpretable en cuanto existiera
-- el primer encargo de submittal, que es el tripwire haciendo su trabajo.
-- Se REEMPLAZA la restriccion en vez de anadir otra: dos CHECK sobre la misma
-- columna se cumplen a la vez y la vieja seguiria prohibiendo el valor nuevo.
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo
    CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL'));

-- ── CAPA 16: la herramienta EXISTE en las obras que ya existen ─────────────
--
-- Misma decision que la migracion 08: se siembra fila EXPLICITA en vez de
-- confiar en el defecto del catalogo, para que el estado se vea y no se adivine.
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, 'submittals', TRUE, 'migracion 13'
  FROM projects p
 WHERE NOT EXISTS (SELECT 1 FROM project_tools t
                    WHERE t.project_id = p.id AND t.herramienta = 'submittals')
ON CONFLICT DO NOTHING;

COMMIT;
