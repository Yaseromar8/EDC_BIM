-- 35 · Grupos de documentos (15-oct-2026). Los documentos VIVEN en sus carpetas; un grupo solo APUNTA a ellos,
-- como «anclar» en Windows. Personal (owner_id = quien lo crea) o de la obra (owner_id NULL, lo crea un
-- administrador de la obra y lo ven todos). Cada documento abre la vigente o una versión fija.
-- Aplicar manualmente como ecd_migrator ANTES de desplegar las rutas /api/docs/grupos. Aditiva: no toca los
-- Conjuntos (doc_sets), que son fotos congeladas de una entrega y siguen como están.
BEGIN;
CREATE TABLE IF NOT EXISTS grupos_de_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_urn TEXT NOT NULL,
    nombre TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_nombre
    ON grupos_de_documentos (model_urn, COALESCE(owner_id, 0), lower(nombre));

CREATE TABLE IF NOT EXISTS grupo_documentos (
    grupo_id UUID NOT NULL REFERENCES grupos_de_documentos(id) ON DELETE CASCADE,
    file_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    version_id UUID REFERENCES file_versions(id) ON DELETE SET NULL,
    added_by_id INTEGER REFERENCES users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (grupo_id, file_node_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON grupos_de_documentos TO ecd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON grupo_documentos TO ecd_app;
COMMIT;
