-- 34 · Vínculos de sustento de metrados (estándar LDA, capa 3; docs/ux/ESTANDAR_LDA.md §6).
-- Una zona de un plano, en una VERSIÓN fijada, sustenta una cantidad de una partida (por su ítem).
-- Aplicar manualmente como ecd_migrator ANTES de desplegar las rutas /api/docs/sustento.
-- Aditiva: no toca file_nodes, file_versions, pdf_markups ni doc_partidas.
BEGIN;
CREATE TABLE IF NOT EXISTS vinculos_de_sustento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_urn TEXT NOT NULL,
    item TEXT NOT NULL,
    cantidad NUMERIC(18,4),
    unidad TEXT,
    file_node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    pagina INTEGER NOT NULL DEFAULT 1,
    zona JSONB NOT NULL,
    nota TEXT,
    -- La planilla (Excel) desde la que se vinculó: el plano ofrece «Planilla ›» para volver a la fila.
    planilla_node_id UUID REFERENCES file_nodes(id) ON DELETE SET NULL,
    -- En un DWG: la vista 2D (presentación o espacio modelo) donde se marcó, por su guid del visor y su
    -- nombre. Con vista, la zona va en COORDENADAS DEL DIBUJO; sin vista (PDF), en fracciones de la página.
    vista TEXT,
    vista_nombre TEXT,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    deleted_by_id INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sustento_item
    ON vinculos_de_sustento(model_urn, item) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sustento_plano
    ON vinculos_de_sustento(file_node_id) WHERE deleted_at IS NULL;

-- El runtime no recibe DDL; los permisos de datos se dan aquí para que la migración sea autónoma.
GRANT SELECT, INSERT, UPDATE ON vinculos_de_sustento TO ecd_app;
COMMIT;
