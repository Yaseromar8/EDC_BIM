-- 33 · Marcas de revisión sobre vistas CAD de ALEPHIA Docs.
-- Aplicar manualmente como ecd_migrator ANTES de desplegar las rutas nuevas.
-- No altera pdf_markups, doc_redlines, archivos ni traducciones Autodesk.
BEGIN;
CREATE TABLE IF NOT EXISTS cad_review_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
    view_guid TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('cloud', 'text', 'photo')),
    geometry JSONB NOT NULL,
    text_content TEXT,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    deleted_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cad_review_visible
    ON cad_review_marks(file_node_id, version_id, view_guid, published);
CREATE INDEX IF NOT EXISTS idx_cad_review_author
    ON cad_review_marks(created_by_id) WHERE NOT published;

CREATE TABLE IF NOT EXISTS cad_review_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mark_id UUID NOT NULL REFERENCES cad_review_marks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'file', 'photo')),
    file_node_id UUID REFERENCES file_nodes(id) ON DELETE RESTRICT,
    storage_object TEXT,
    name TEXT NOT NULL,
    mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by_id INTEGER REFERENCES users(id),
    CONSTRAINT cad_review_attachment_source CHECK (
      (file_node_id IS NOT NULL AND storage_object IS NULL) OR
      (file_node_id IS NULL AND storage_object IS NOT NULL)
    )
);
ALTER TABLE cad_review_attachments
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_cad_review_attachment_mark
    ON cad_review_attachments(mark_id);

-- El runtime no recibe DDL. Los permisos de datos se explicitan además de
-- los DEFAULT PRIVILEGES existentes para que la migración sea autónoma.
GRANT SELECT, INSERT, UPDATE ON cad_review_marks TO ecd_app;
GRANT SELECT, INSERT, UPDATE ON cad_review_attachments TO ecd_app;
COMMIT;
