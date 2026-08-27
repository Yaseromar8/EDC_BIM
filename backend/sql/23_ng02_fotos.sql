-- ═══════════════════════════════════════════════════════════════════════════
-- NG-02 · FOTOS DE CAMPO — la foto como EVIDENCIA CITABLE (doc 94)
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
--   + doc_fotos        una fila por foto-evidencia
--   + doc_albumes      agrupación NO exclusiva; un álbum NO concede permisos
--   + doc_album_fotos  n:m — una foto puede estar en varios álbumes
--
-- MIGRACIÓN EXPAND: solo añade. `photo_evidences` queda LEGACY CONGELADA
-- (decisión 1 del doc 94): está vacía, no se hereda y no se toca.
--
-- LECCIÓN F1/F2 APLICADA: los GRANTS a ecd_app van AQUÍ DENTRO, en la misma
-- transacción que crea las tablas — no en un paso aparte que alguien olvida.
-- Y las identidades que escribe el cliente son TEXT, no UUID.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS doc_fotos (
    id            BIGSERIAL PRIMARY KEY,
    project_id    TEXT         NOT NULL,
    model_urn     VARCHAR(255) NOT NULL,

    -- LA IDENTIDAD DEL BINARIO: el nombre del objeto en el almacén, con el
    -- MISMO esquema del GAP 07 (evidencia/<obra>/<uuid>). UNIQUE: el mismo
    -- blob no puede ser dos fotos — adjuntar es vincular, no copiar.
    objeto        TEXT         NOT NULL,

    nombre        TEXT,
    tipo_mime     TEXT,
    tamano        BIGINT,
    sha256        TEXT,

    -- DECLARADO por el dispositivo (GAP 07): no es un reloj autoritativo.
    capturado_en  TIMESTAMP,
    subido_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    autor_id      INTEGER      NOT NULL,
    created_by    TEXT,

    descripcion   TEXT,
    -- DÓNDE (decisión 3: la progresiva ES nuestra geolocalización; lat-long
    -- fuera — el GPS se limpia del fichero y lo limpiado vive en exif).
    progresiva    TEXT,
    external_id   TEXT,          -- elemento del modelo (sigue entre versiones)
    ubicacion     TEXT,          -- texto libre («caseta norte»)

    sensibilidad  TEXT         NOT NULL DEFAULT 'N1',
    exif          JSONB        NOT NULL DEFAULT '{}',
    marcas        JSONB        NOT NULL DEFAULT '[]',
    history       JSONB        NOT NULL DEFAULT '[]',

    CONSTRAINT uq_fotos_objeto UNIQUE (objeto),
    CONSTRAINT ck_fotos_sensibilidad
        CHECK (sensibilidad IN ('N0','N1','N2','N3'))
);

CREATE INDEX IF NOT EXISTS idx_fotos_obra
    ON doc_fotos(project_id, subido_en DESC);
CREATE INDEX IF NOT EXISTS idx_fotos_obra_capturada
    ON doc_fotos(project_id, capturado_en DESC);

CREATE TABLE IF NOT EXISTS doc_albumes (
    id            BIGSERIAL PRIMARY KEY,
    project_id    TEXT      NOT NULL,
    nombre        TEXT      NOT NULL,
    descripcion   TEXT,
    -- El nivel del ÁLBUM restringe el álbum como conjunto; jamás CONCEDE:
    -- una foto N2 dentro de un álbum N0 sigue siendo N2 para quien mira.
    sensibilidad  TEXT      NOT NULL DEFAULT 'N1',
    creado_por    INTEGER,
    creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_albumes_nombre UNIQUE (project_id, nombre),
    CONSTRAINT ck_albumes_sensibilidad
        CHECK (sensibilidad IN ('N0','N1','N2','N3'))
);

CREATE TABLE IF NOT EXISTS doc_album_fotos (
    album_id    BIGINT    NOT NULL,
    foto_id     BIGINT    NOT NULL,
    anadido_por INTEGER,
    anadido_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (album_id, foto_id)
);

DO $$ BEGIN
    ALTER TABLE doc_album_fotos ADD CONSTRAINT fk_albumfoto_album
        FOREIGN KEY (album_id) REFERENCES doc_albumes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE doc_album_fotos ADD CONSTRAINT fk_albumfoto_foto
        FOREIGN KEY (foto_id) REFERENCES doc_fotos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── GRANTS, en la misma transacción ────────────────────────────────────────
-- Sin DELETE en doc_fotos ni doc_albumes: la evidencia no se borra — la misma
-- postura que la auditoría de solo anexar. Quitar una foto de un álbum SÍ
-- (DELETE en la n:m): deshacer una agrupación no destruye evidencia.
GRANT SELECT, INSERT, UPDATE ON doc_fotos    TO ecd_app;
GRANT SELECT, INSERT, UPDATE ON doc_albumes  TO ecd_app;
GRANT SELECT, INSERT, DELETE ON doc_album_fotos TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE doc_fotos_id_seq   TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE doc_albumes_id_seq TO ecd_app;

COMMIT;
