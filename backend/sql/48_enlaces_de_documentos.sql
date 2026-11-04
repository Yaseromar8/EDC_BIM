-- 48 · Enlaces de documentos (5-nov-2026, docs/archivos/27). Un documento VIVE en una carpeta; otras carpetas lo
-- ENLAZAN: lo enseñan en su lista con la marca ⤷ y, al abrirlo, se abre el original con su última versión. No se
-- copia nada. El dueño: «tengo un único archivo que sirve a varias calles; subirlo a cada calle sería un trabajo en
-- vano y almacenar el mismo archivo varias veces».
--
-- Una tabla propia, no una fila más en file_nodes: así ningún recuento, cuota, búsqueda, mosaico ni plan de entregas
-- confunde un enlace con un segundo archivo.
--
-- Aditiva. Aplicar a mano como ecd_migrator ANTES de desplegar el backend que la usa (que, sin ella, lista las
-- carpetas igual, sin enlaces, y niega crear uno). Rollback: 48_enlaces_de_documentos_rollback.sql; el rollback
-- normal de un despliegue es volver al código, no esto.
BEGIN;

CREATE TABLE IF NOT EXISTS doc_enlaces (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_urn    TEXT NOT NULL,
    -- El original. Borrado de verdad (purga de la papelera), se van sus enlaces. En la papelera (is_deleted) el
    -- enlace sigue aquí y no se enseña; al restaurarlo, vuelve.
    documento_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    -- La carpeta donde se ve. Lo mismo: purgada la carpeta, se van sus enlaces.
    carpeta_id   UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    creado_por   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_doc_enlace UNIQUE (documento_id, carpeta_id),
    CONSTRAINT ck_doc_enlace_distintos CHECK (documento_id <> carpeta_id)
);

-- Lo que se pregunta: qué enlaces hay en esta carpeta (al listarla) y dónde está enlazado este documento (su ficha).
-- El segundo lo cubre el índice de la UNIQUE (documento_id primero).
CREATE INDEX IF NOT EXISTS idx_doc_enlaces_carpeta ON doc_enlaces (carpeta_id);

-- REVOKE ALL antes del GRANT: en producción hay privilegios por defecto que dan a ecd_app TODO sobre cada tabla nueva
-- de ecd_migrator (medido el 5-nov-2026: tras el GRANT, UPDATE seguía en true). Un enlace se crea o se quita; no se
-- modifica.
REVOKE ALL ON doc_enlaces FROM ecd_app;
GRANT SELECT, INSERT, DELETE ON doc_enlaces TO ecd_app;

COMMIT;
