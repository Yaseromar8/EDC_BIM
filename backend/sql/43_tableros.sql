-- 43 · Tableros de Docs (30-oct-2026, docs/visor/57). La pizarra de la obra dentro de ALEPHIA Docs, como los
-- «Tableros» (Paneles) de ACC: notas, texto, secciones y, en fases siguientes, documentos, incidencias y vistas.
-- Un tablero es DE LA OBRA (lo ven quienes pertenecen a ella). `config` guarda su contenido; `version` sube en
-- cada guardado y el servidor rechaza un guardado sobre una versión vieja (409): así dos personas no se pisan.
-- `tableros_abiertos` dice cuándo abrió cada persona cada tablero («Abierto por última vez por usted»).
-- Aplicar manualmente como ecd_migrator ANTES de desplegar las rutas /api/docs/tableros. Aditiva: no toca el
-- tablero de análisis del visor (dashboards).
BEGIN;
CREATE TABLE IF NOT EXISTS tableros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_urn TEXT NOT NULL,
    nombre TEXT NOT NULL DEFAULT 'Sin título',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    archivado BOOLEAN NOT NULL DEFAULT false,
    created_by_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_id INTEGER REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tableros_obra ON tableros (model_urn, archivado, updated_at DESC);

CREATE TABLE IF NOT EXISTS tableros_abiertos (
    tablero_id UUID NOT NULL REFERENCES tableros(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    abierto_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tablero_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON tableros TO ecd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tableros_abiertos TO ecd_app;
COMMIT;
