-- 40: el itemizado de la obra que se sube a la Planilla del visor, guardado y con versiones.
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa (sin la tabla,
--     /api/planilla/itemizado responde 503 MIGRATION_MISSING; el resto del backend no la necesita).
--
-- POR QUÉ
-- -------
-- La vista Partidas del visor arma las partidas con el itemizado de la obra (ítem, descripción,
-- unidad) que sube el usuario: es el criterio, y ningún criterio de obra va escrito en el código
-- (decisión del propietario, 24-oct-2026). Hasta hoy vivía solo en el navegador: al recargar se
-- perdía y cada persona veía otra cosa. Además, los campos derivados que usará Filters («estado
-- frente al itemizado», «capítulo», «partida») tienen que existir al abrir la obra, también al
-- restaurar una vista guardada. docs/visor/27 §6.
--
-- QUÉ GUARDA
-- ----------
-- Una fila por VERSIÓN del itemizado de una obra (projects.id, resuelto en el servidor): la lista
-- validada en JSONB, de dónde salió (archivo, hoja, columnas), su huella y quién y cuándo. Solo una
-- vigente por obra. Quitar o reemplazar NO borra: la versión anterior queda en el historial.
-- Los datos del modelo NO se duplican aquí: los campos derivados se calculan en el visor.
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Aditiva: una tabla nueva y su índice. No toca datos ni tablas existentes. Se puede repetir sin daño.
-- No reutiliza `doc_partidas` ni `presupuesto_maestro` (prototipos sin versiones, uno con la
-- importación atada a un Excel del repositorio): unificarlos es otra decisión.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_ITEMIZADOS_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS planilla_itemizados (
    id            BIGSERIAL PRIMARY KEY,
    project_id    TEXT NOT NULL,
    version       INTEGER NOT NULL CHECK (version > 0),
    archivo       TEXT NOT NULL,
    hoja          TEXT NOT NULL DEFAULT '',
    columnas      JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(columnas) = 'object'),
    items         JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array'),
    n_items       INTEGER NOT NULL CHECK (n_items > 0),
    huella        TEXT NOT NULL CHECK (huella ~ '^[a-f0-9]{64}$'),
    vigente       BOOLEAN NOT NULL DEFAULT true,
    creado_por    INTEGER REFERENCES users(id),
    creado_en     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    retirado_por  INTEGER REFERENCES users(id),
    retirado_en   TIMESTAMP WITH TIME ZONE,
    UNIQUE (project_id, version)
);
-- Una sola versión vigente por obra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_itemizado_vigente
    ON planilla_itemizados (project_id) WHERE vigente;

GRANT SELECT, INSERT, UPDATE ON planilla_itemizados TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE planilla_itemizados_id_seq TO ecd_app;

COMMIT;
