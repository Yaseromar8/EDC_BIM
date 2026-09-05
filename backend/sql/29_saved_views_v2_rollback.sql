-- ═══════════════════════════════════════════════════════════════════════════
-- SAVED VIEWS 2.0 · E-0 · REVERSION
--
-- Ejecutar como  ecd_migrator. Escrito ANTES de necesitarlo: no se improvisa
-- SQL de reversion despues de un incidente.
--
-- SE NIEGA SI YA HAY VISTAS v2
-- ----------------------------
-- Quitar `state` cuando dentro hay documentos v2 no seria revertir un cambio
-- de esquema: seria borrar vistas que alguien guardo. La reversion solo es
-- legitima mientras la columna siga vacia, es decir, antes de E-4.
--
-- Devuelve el esquema exacto: sin las seis columnas, sin la clave foranea y
-- sin el indice. Lo que habia antes de la 29.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $negarse$
DECLARE
    v2 INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'saved_views' AND column_name = 'schema_version') THEN
        RAISE NOTICE 'la 29 no esta aplicada: nada que revertir.';
        RETURN;
    END IF;

    SELECT count(*) INTO v2 FROM saved_views WHERE schema_version <> 1 OR state IS NOT NULL;
    IF v2 > 0 THEN
        RAISE EXCEPTION 'ME NIEGO: hay % vista(s) en formato v2. Revertir borraria '
                        'su estado. Primero hay que decidir que pasa con ellas.', v2;
    END IF;
END
$negarse$;

DROP INDEX IF EXISTS ix_saved_views_project_updated;

ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS fk_saved_views_created_by;

ALTER TABLE saved_views DROP COLUMN IF EXISTS description;
ALTER TABLE saved_views DROP COLUMN IF EXISTS thumbnail;
ALTER TABLE saved_views DROP COLUMN IF EXISTS created_by;
ALTER TABLE saved_views DROP COLUMN IF EXISTS updated_at;
ALTER TABLE saved_views DROP COLUMN IF EXISTS state;
ALTER TABLE saved_views DROP COLUMN IF EXISTS schema_version;

DO $verificar$
DECLARE
    sobran TEXT;
BEGIN
    SELECT string_agg(column_name, ', ') INTO sobran
      FROM information_schema.columns
     WHERE table_name = 'saved_views'
       AND column_name IN ('schema_version','state','updated_at',
                           'created_by','thumbnail','description');
    IF sobran IS NOT NULL THEN
        RAISE EXCEPTION 'la reversion dejo columnas: %', sobran;
    END IF;
    RAISE NOTICE 'saved_views devuelta al esquema anterior a la 29.';
END
$verificar$;

COMMIT;
