-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSION DE E-4D. Escrita antes de necesitarla.
--
--     psql ... -f 30_saved_views_share_token_rollback.sql     como ecd_migrator
--
-- SE NIEGA SI HAY ALGUNA CAPACIDAD EMITIDA
-- ----------------------------------------
-- Quitar `share_token` cuando ya hay tokens repartidos no es deshacer un cambio
-- de esquema: es romper, en silencio, todos los enlaces que alguien haya
-- compartido desde que se desplego. Si hace falta revertir de verdad con
-- tokens vivos, es una decision que se toma mirando cuantos son y avisando a
-- quien los tenga -- no una que se ejecuta de un tiron.
--
-- El censo se pierde con la reversion, y eso es correcto: son datos sobre una
-- via que se estaba estudiando retirar, no historia de la obra.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $negarse$
DECLARE
    con_token INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'saved_views' AND column_name = 'share_token') THEN
        RAISE NOTICE 'no hay nada que revertir: share_token no existe.';
        RETURN;
    END IF;

    EXECUTE 'SELECT count(*) FROM saved_views WHERE share_token IS NOT NULL'
       INTO con_token;

    IF con_token > 0 THEN
        RAISE EXCEPTION 'ME NIEGO: hay % enlace(s) compartido(s) vivos. Quitar la '
                        'columna los rompe todos sin avisar a nadie.', con_token;
    END IF;
END
$negarse$;

DROP INDEX IF EXISTS ux_saved_views_share_token;
ALTER TABLE saved_views DROP COLUMN IF EXISTS share_token;
ALTER TABLE saved_views DROP COLUMN IF EXISTS legacy_accesos;
ALTER TABLE saved_views DROP COLUMN IF EXISTS legacy_ultimo_acceso;
ALTER TABLE saved_views DROP COLUMN IF EXISTS legacy_enlace;

DO $comprobar$
DECLARE
    sobran TEXT;
BEGIN
    SELECT string_agg(column_name, ', ') INTO sobran
      FROM information_schema.columns
     WHERE table_name = 'saved_views'
       AND column_name IN ('share_token','legacy_accesos','legacy_ultimo_acceso',
                          'legacy_enlace');
    IF sobran IS NOT NULL THEN
        RAISE EXCEPTION 'la reversion no termino: siguen %', sobran;
    END IF;
    RAISE NOTICE 'E-4D revertido: saved_views vuelve a su forma anterior.';
END
$comprobar$;

COMMIT;
