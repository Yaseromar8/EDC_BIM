-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 02 · EL PLANO COMO OBJETO — identidad sobre ficheros que ya existen
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- NO CREA UN SEGUNDO ALMACEN. Cada revision APUNTA a un file_version que ya
-- vive en el expediente, con su carpeta, su permiso y su SHA-256. Por eso el
-- permiso de recurso se hereda solo y capa 09 sigue siendo la unica autoridad.
--
--   + doc_plano_sets          el acto de emitir una entrega
--   + doc_planos              la identidad: numero y titulo
--   + doc_plano_revisiones    que soporte vale y cual quedo superado
--   + plano_anclajes          un registro clavado en un PUNTO del plano
--   ~ pdf_markups             se le anade PERSONAL vs PUBLICADO
--   + project_tools           siembra la herramienta en las obras existentes
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── EL ACTO DE EMITIR ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_plano_sets (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT        NOT NULL,
    nombre      TEXT        NOT NULL,
    descripcion TEXT,
    emitido_en  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emitido_por INTEGER,
    creado_en   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_plano_sets ADD CONSTRAINT fk_plano_sets_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plano_sets_nombre
    ON doc_plano_sets(project_id, lower(nombre));

-- ── LA IDENTIDAD ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_planos (
    id          BIGSERIAL PRIMARY KEY,
    project_id  TEXT        NOT NULL,
    model_urn   VARCHAR(255) NOT NULL,
    numero      TEXT        NOT NULL,       -- normalizado: PL-EST-104
    titulo      TEXT        NOT NULL,
    disciplina  TEXT,
    creado_por  INTEGER,
    creado_en   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_planos ADD CONSTRAINT fk_planos_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Disciplina de lista CERRADA. Texto libre convertiria el filtro en un adorno:
-- 'EST', 'Estructuras' y 'ESTRUCT.' serian tres disciplinas distintas.
DO $$ BEGIN
    ALTER TABLE doc_planos ADD CONSTRAINT ck_planos_disciplina
        CHECK (disciplina IS NULL OR disciplina IN
               ('ARQ','EST','SAN','ELE','MEC','CIV','VIA','TOP','GEN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- EL NUMERO ES LA IDENTIDAD: uno por obra y no dos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_planos_numero_obra
    ON doc_planos(project_id, numero);
CREATE INDEX IF NOT EXISTS idx_planos_disciplina
    ON doc_planos(project_id, disciplina);

-- ── QUE SOPORTE VALE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_plano_revisiones (
    id               BIGSERIAL PRIMARY KEY,
    plano_id         BIGINT      NOT NULL,
    codigo_revision  TEXT        NOT NULL,   -- 'A','B','00','01'
    set_id           BIGINT,

    -- EL SOPORTE, DONDE YA ESTABA. No se copia el fichero: se apunta.
    file_node_id     UUID        NOT NULL,
    file_version_id  UUID,

    estado           TEXT        NOT NULL DEFAULT 'Vigente',
    emitida_en       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emitida_por      INTEGER,
    superada_en      TIMESTAMP,
    superada_por_id  BIGINT,                 -- la revision que la sustituyo
    motivo           TEXT,
    creada_en        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_plano_revisiones ADD CONSTRAINT fk_plano_rev_plano
        FOREIGN KEY (plano_id) REFERENCES doc_planos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_plano_revisiones ADD CONSTRAINT fk_plano_rev_set
        FOREIGN KEY (set_id) REFERENCES doc_plano_sets(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El nodo: RESTRICT. Borrar el fichero al que apunta una revision emitida
-- dejaria el expediente diciendo que existe un soporte que ya no existe.
DO $$ BEGIN
    ALTER TABLE doc_plano_revisiones ADD CONSTRAINT fk_plano_rev_nodo
        FOREIGN KEY (file_node_id) REFERENCES file_nodes(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_plano_revisiones ADD CONSTRAINT ck_plano_rev_estado
        CHECK (estado IN ('Vigente','Superada','Anulada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una revision superada tiene que decir CUANDO lo fue. Sin fecha, «superada»
-- es una etiqueta que no permite reconstruir que se miraba en una fecha dada.
DO $$ BEGIN
    ALTER TABLE doc_plano_revisiones ADD CONSTRAINT ck_plano_rev_superada_con_fecha
        CHECK (estado <> 'Superada' OR superada_en IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plano_rev_codigo
    ON doc_plano_revisiones(plano_id, upper(codigo_revision));

-- ═══ LA INVARIANTE DE ESTE GAP ═══
-- UNA SOLA REVISION VIGENTE POR PLANO, garantizada por la BASE y no por el
-- codigo. Dos vigentes significa gente construyendo contra soportes distintos
-- sin que nadie lo sepa: es el peor estado posible de un expediente de obra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plano_una_sola_vigente
    ON doc_plano_revisiones(plano_id) WHERE estado = 'Vigente';

CREATE INDEX IF NOT EXISTS idx_plano_rev_nodo ON doc_plano_revisiones(file_node_id);

-- ── UN REGISTRO CLAVADO EN UN PUNTO DEL PLANO ──────────────────────────────
--
-- UNA SOLA TABLA para todos los tipos, con el mismo patron (objeto_tipo,
-- objeto_id) que ya usa `encargos`. La alternativa era anadir tres columnas a
-- doc_rfis, doc_redlines y doc_submittals -- y una cuarta cuando llegue el
-- punch (GAP 04), y una quinta con los formularios (GAP 03).
--
-- El ancla apunta a la REVISION, no al plano: una observacion se levanto sobre
-- un soporte concreto, y cuando ese soporte quede superado el ancla tiene que
-- seguir diciendo sobre CUAL se levanto.
CREATE TABLE IF NOT EXISTS plano_anclajes (
    id            BIGSERIAL PRIMARY KEY,
    revision_id   BIGINT      NOT NULL,
    objeto_tipo   TEXT        NOT NULL,
    objeto_id     TEXT        NOT NULL,
    pagina        INTEGER     NOT NULL DEFAULT 1,
    x             DOUBLE PRECISION NOT NULL,   -- 0..1, relativo al ancho
    y             DOUBLE PRECISION NOT NULL,   -- 0..1, relativo al alto
    creado_por    INTEGER,
    creado_en     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE plano_anclajes ADD CONSTRAINT fk_anclaje_revision
        FOREIGN KEY (revision_id) REFERENCES doc_plano_revisiones(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RELATIVAS Y NO EN PUNTOS PDF: un ancla en coordenadas absolutas se descoloca
-- en cuanto el plano se reexporta con otro tamano de lamina.
DO $$ BEGIN
    ALTER TABLE plano_anclajes ADD CONSTRAINT ck_anclaje_dentro_de_la_lamina
        CHECK (x >= 0 AND x <= 1 AND y >= 0 AND y <= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE plano_anclajes ADD CONSTRAINT ck_anclaje_tipo
        CHECK (objeto_tipo IN ('RFI','REDLINE','SUBMITTAL','REVIEW'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_anclaje_unico
    ON plano_anclajes(revision_id, objeto_tipo, objeto_id);
CREATE INDEX IF NOT EXISTS idx_anclaje_objeto ON plano_anclajes(objeto_tipo, objeto_id);

-- ── MARKUP: PERSONAL vs PUBLICADO ──────────────────────────────────────────
--
-- El gap nombrado en el doc 82 §4.5. Los dos fabricantes lo tienen y por la
-- misma razon: un markup es primero un BORRADOR de quien lo dibuja. Sin la
-- distincion, cualquier trazo tentativo aparece para toda la obra en el acto,
-- asi que la gente deja de marcar sobre el plano y usa capturas por WhatsApp.
--
-- NACE PERSONAL (FALSE) A PROPOSITO. Si el defecto fuera publicado, desplegar
-- esta columna haria visibles de golpe todos los markups privados que ya
-- existen. Los que ya estan se marcan publicados EXPLICITAMENTE abajo, porque
-- se crearon bajo la regla anterior --toda marca era de todos-- y cambiarles
-- el significado retroactivamente seria reescribir lo que sus autores hicieron.
ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS publicado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS publicado_en TIMESTAMP;
ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS publicado_por INTEGER;

UPDATE pdf_markups SET publicado = TRUE, publicado_en = COALESCE(created_at, CURRENT_TIMESTAMP)
 WHERE publicado = FALSE AND publicado_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_markups_publicado
    ON pdf_markups(file_node_id, page) WHERE publicado;

-- ── CAPA 16: la herramienta EXISTE en las obras que ya existen ─────────────
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, 'planos', TRUE, 'migracion 14'
  FROM projects p
 WHERE NOT EXISTS (SELECT 1 FROM project_tools t
                    WHERE t.project_id = p.id AND t.herramienta = 'planos')
ON CONFLICT DO NOTHING;

COMMIT;
