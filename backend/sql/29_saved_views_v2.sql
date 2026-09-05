-- ═══════════════════════════════════════════════════════════════════════════
-- SAVED VIEWS 2.0 · E-0 · LAS SEIS COLUMNAS
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- QUE HACE
-- --------
-- Prepara `saved_views` para el contrato v2 SIN tocar una sola fila y SIN
-- cambiar el comportamiento de nada. Despues de esta migracion la aplicacion
-- sigue leyendo y escribiendo exactamente igual que antes: las columnas nuevas
-- quedan vacias hasta que E-4 empiece a usarlas.
--
--     schema_version   1 = documento v1 (las tres columnas de siempre)
--                      2 = documento v2 (columna `state`)
--     state            el documento v2 completo, en JSONB
--     updated_at       ultima modificacion. Hoy no existe: una vista se crea
--                      y no se puede actualizar, y por eso no habia que anotarlo
--     created_by       autor. Hoy las vistas NO TIENEN AUTOR, y por eso
--                      cualquier sesion puede borrar la de cualquiera
--     thumbnail        miniatura para la galeria (data URI)
--     description      nota del autor
--
-- POR QUE `state` NUEVA Y NO REUTILIZAR `viewer_state`
-- ----------------------------------------------------
-- Porque el camino v1 restaura con `viewer.restoreState(state)` SIN FILTRO
-- (frontend-react/src/components/Viewer.jsx:3206): aplica todo lo que el
-- documento traiga. Si la captura v2 --que incluye `cutplanes` y el estado de
-- AEC Levels-- escribiera en `viewer_state`, el codigo v1 desplegado lo
-- restauraria de inmediato, sin que nadie lo hubiera decidido.
--
-- Columnas separadas = los dos caminos no se ven. Es la unica forma de que v2
-- se pueda construir y probar mientras v1 sigue vivo en produccion.
--
-- LO QUE NO HACE
-- --------------
-- No rellena `created_by` de las vistas historicas. No hay backfill y no lo
-- habra: inventar un autor para una vista de marzo seria escribir historia que
-- nadie vivio. `NULL` significa «autor desconocido», y la politica de permisos
-- de E-4 lo trata como tal --admin para modificar, cualquiera para Save As--.
-- Ver deploy/RECUPERACION.md sobre por que este proyecto no rellena huecos.
--
-- REVERSION
-- ---------
-- `29_saved_views_v2_rollback.sql`, escrito antes de necesitarlo. Se niega si
-- ya existe alguna vista v2: quitar `state` con documentos dentro no seria
-- revertir un cambio de esquema, seria borrar vistas.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Fallo rapido. Todo el DDL de aqui pide ACCESS EXCLUSIVE sobre `saved_views`;
-- con una transaccion larga abierta, la peticion se pone en COLA y bloquea a
-- todo el que llegue detras. Una migracion esperando en produccion no es una
-- migracion lenta: es una caida. `SET LOCAL` la ata a esta transaccion.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS state          JSONB;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS created_by     INTEGER;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS thumbnail      TEXT;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS description    TEXT;

COMMENT ON COLUMN saved_views.schema_version IS
    '1 = documento v1 en viewer_state/filter_state/config. 2 = documento v2 en state.';
COMMENT ON COLUMN saved_views.state IS
    'Documento SavedViewState v2. NULL en las vistas v1, que no se migran al escribirse.';
COMMENT ON COLUMN saved_views.created_by IS
    'Autor. NULL = desconocido (vista anterior a esta migracion). NO se rellena nunca: '
    'la politica de permisos trata NULL como «de la obra», no como «mia».';

-- La clave foranea va SEPARADA y NOT VALID a proposito: asi no recorre las
-- filas existentes --todas con created_by NULL, que la cumplen trivialmente--
-- ni pide un lock de validacion sobre `users`. Se valida despues, en frio.
DO $fk$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'fk_saved_views_created_by'
                      AND conrelid = 'saved_views'::regclass) THEN
        ALTER TABLE saved_views
            ADD CONSTRAINT fk_saved_views_created_by
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            NOT VALID;
    END IF;
END
$fk$;

-- El listado ligero (LIST) filtra por obra y ordena por fecha. Sin este indice
-- son escaneos completos en cuanto haya vistas de varias obras.
CREATE INDEX IF NOT EXISTS ix_saved_views_project_updated
    ON saved_views (project_id, updated_at DESC NULLS LAST);

-- ── VERIFICACION ──────────────────────────────────────────────────────────
-- El fichero promete seis columnas. Que la base lo confirme, no el texto.
DO $verificar$
DECLARE
    faltan TEXT;
BEGIN
    SELECT string_agg(c, ', ') INTO faltan
      FROM unnest(ARRAY['schema_version','state','updated_at',
                        'created_by','thumbnail','description']) AS c
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'saved_views' AND column_name = c);
    IF faltan IS NOT NULL THEN
        RAISE EXCEPTION 'faltan columnas tras la migracion: %', faltan;
    END IF;

    IF EXISTS (SELECT 1 FROM saved_views WHERE schema_version IS NULL) THEN
        RAISE EXCEPTION 'schema_version quedo NULL en alguna fila';
    END IF;

    IF EXISTS (SELECT 1 FROM saved_views WHERE schema_version <> 1) THEN
        RAISE EXCEPTION 'esta migracion NO debe cambiar ninguna vista a v2';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'fk_saved_views_created_by') THEN
        RAISE EXCEPTION 'no se creo fk_saved_views_created_by';
    END IF;

    RAISE NOTICE 'saved_views listo para v2: 6 columnas nuevas, 0 filas tocadas, '
                 'todas siguen en schema_version = 1.';
END
$verificar$;

COMMIT;
