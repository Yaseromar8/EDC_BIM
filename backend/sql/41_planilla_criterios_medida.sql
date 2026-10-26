-- 41: los criterios de medida de la obra para la Planilla del visor («Medir con…»), con versiones.
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa (sin la tabla,
--     /api/planilla/criterios-medida responde 503 MIGRATION_MISSING y el visor los usa solo en el
--     navegador; el resto del backend no la necesita).
--
-- POR QUÉ
-- -------
-- La Planilla da la cantidad de cada partida con la medida NATIVA del elemento según la unidad. Muchos
-- elementos no la traen (familias propias, genéricos, IFC de otros programas, Revit en otro idioma,
-- metrados volcados a un parámetro): la medida está en algún parámetro del elemento y solo la obra sabe
-- cuál. Un criterio lo dice («la partida 01.02 en m se mide con Cotas › Long. Reja») y solo rellena lo
-- que no tiene medida nativa. Es criterio de OBRA: lo ve todo el equipo y no puede vivir en un
-- navegador. docs/visor/32.
--
-- QUÉ GUARDA
-- ----------
-- Una fila por VERSIÓN del juego completo de criterios de una obra (projects.id, resuelto en el
-- servidor): la lista validada en JSONB, su huella y quién y cuándo. Solo una vigente por obra. Quitar
-- un criterio es guardar el juego sin él: la versión anterior queda en el historial. Los datos del
-- modelo NO se duplican aquí: las cantidades se calculan en el visor.
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Aditiva: una tabla nueva y su índice. No toca datos ni tablas existentes. Se puede repetir sin daño.
-- Separada de planilla_itemizados (40): el itemizado dice qué partidas hay; los criterios, cómo se mide.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_CRITERIOS_MEDIDA_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS planilla_criterios_medida (
    id            BIGSERIAL PRIMARY KEY,
    project_id    TEXT NOT NULL,
    version       INTEGER NOT NULL CHECK (version > 0),
    criterios     JSONB NOT NULL CHECK (jsonb_typeof(criterios) = 'array'),
    n_criterios   INTEGER NOT NULL CHECK (n_criterios >= 0),
    huella        TEXT NOT NULL CHECK (huella ~ '^[a-f0-9]{64}$'),
    vigente       BOOLEAN NOT NULL DEFAULT true,
    creado_por    INTEGER REFERENCES users(id),
    creado_en     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    retirado_por  INTEGER REFERENCES users(id),
    retirado_en   TIMESTAMP WITH TIME ZONE,
    UNIQUE (project_id, version)
);
-- Una sola versión vigente por obra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_criterios_medida_vigente
    ON planilla_criterios_medida (project_id) WHERE vigente;

GRANT SELECT, INSERT, UPDATE ON planilla_criterios_medida TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE planilla_criterios_medida_id_seq TO ecd_app;

COMMIT;
