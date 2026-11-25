-- ============================================================================
-- 52 · LA VALORIZACIÓN DEL MES DE LA PLANILLA (docs/visor/71 §8)
-- ============================================================================
--
-- El dueño (25-nov-2026): «eso solo yo lo podría subir con admin, ese Excel. Y debe permanecer para todos».
-- El Excel de la valorización (VAL13_PARTIDA_POR_PARTIDA…) se guarda TAL CUAL, por obra y frente, con versiones,
-- como el itemizado (migraciones 40 y 42): lo sube un administrador de la obra y lo leen todos los de la obra.
-- El visor lo abre igual que si se cargara del disco (hoja, filas verdes, fórmulas calculadas si hacen falta).
--
-- QUE HACE
--   Una tabla nueva. No toca ninguna otra.
--
-- COMO SE APLICA
--   A mano, como ecd_migrator, ANTES de desplegar el backend que la usa. Se puede aplicar dos veces.
--   Sin ella, las rutas responden 503 MIGRATION_MISSING y el visor sigue cargando el Excel sólo en el navegador.
--
-- VUELTA ATRAS
--   El rollback normal es revertir el código (AGENTS.md 4.3). 52_planilla_valorizaciones_rollback.sql se NIEGA
--   si ya hay alguna valorización guardada.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_VALORIZACIONES_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS planilla_valorizaciones (
    id            BIGSERIAL PRIMARY KEY,
    project_id    TEXT NOT NULL,
    frente        TEXT NOT NULL DEFAULT '',
    version       INTEGER NOT NULL CHECK (version > 0),
    archivo       TEXT NOT NULL,
    tamano        INTEGER NOT NULL CHECK (tamano > 0 AND tamano <= 8388608),
    huella        TEXT NOT NULL CHECK (huella ~ '^[a-f0-9]{64}$'),
    contenido     BYTEA NOT NULL,
    vigente       BOOLEAN NOT NULL DEFAULT true,
    creado_por    INTEGER REFERENCES users(id),
    creado_en     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    retirado_por  INTEGER REFERENCES users(id),
    retirado_en   TIMESTAMP WITH TIME ZONE,
    UNIQUE (project_id, version)
);

-- Una sola vigente por obra y frente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_valorizacion_vigente
    ON planilla_valorizaciones (project_id, frente) WHERE vigente;

-- La aplicación lee y añade versiones; de las existentes sólo retira la vigente. Nunca borra ni cambia el Excel.
-- Primero se quita todo: los permisos por defecto del esquema (03_grants_ida) dan a toda tabla nueva SELECT, INSERT,
-- UPDATE y DELETE completos a ecd_app (medido en la base de ensayo el 25-nov-2026).
REVOKE ALL ON planilla_valorizaciones FROM ecd_app;
GRANT SELECT, INSERT ON planilla_valorizaciones TO ecd_app;
GRANT UPDATE (vigente, retirado_por, retirado_en) ON planilla_valorizaciones TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE planilla_valorizaciones_id_seq TO ecd_app;

-- Y se comprueba, para no confiar en el orden de los GRANT.
DO $$
BEGIN
    IF has_table_privilege('ecd_app', 'planilla_valorizaciones', 'DELETE')
       OR has_column_privilege('ecd_app', 'planilla_valorizaciones', 'contenido', 'UPDATE')
       OR has_column_privilege('ecd_app', 'planilla_valorizaciones', 'huella', 'UPDATE') THEN
        RAISE EXCEPTION 'ecd_app puede borrar o reescribir una valorización guardada: no se aplica.';
    END IF;
END $$;

COMMIT;
