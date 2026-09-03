-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEWS-R01 · ROLLBACK DE LA FASE A
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- CUANDO SE PUEDE USAR ESTO, Y CUANDO YA NO
-- ------------------------------------------
-- Deshace exactamente lo que dejo `27_r01_contrato_de_revision.sql`. Es valido
-- MIENTRAS NO EXISTA NINGUNA REVISION CON UN CONTRATO DISTINTO DE 'PRE'. En
-- cuanto exista la primera `AUTORIDAD_TERMINAL` --fase D-- borrar esta columna
-- destruiria el unico sitio donde consta con que reglas nacio ese expediente.
--
-- Por eso lo PRIMERO que hace es comprobarlo y negarse. No es una cortesia: es
-- la diferencia entre revertir un cambio de esquema y borrar una declaracion de
-- autoridad documental.
--
-- QUE DEVUELVE
-- ------------
--   · sin columna `contrato`
--   · sin `ck_contrato_conocido`
--   · sin `tg_contrato_inmutable` ni su funcion
--   · `ecd_app` con UPDATE DE TABLA otra vez, como antes de la fase A
--
-- LO QUE NO DESHACE, PORQUE LA FASE A NO LO HIZO
-- -----------------------------------------------
-- Ni una fila de `doc_reviews` cambia aqui. La fase A tampoco cambio ninguna:
-- solo puso nombre --'PRE'-- a lo que ya eran. Al quitar la columna ese nombre
-- desaparece y el expediente queda exactamente como estaba.
--
-- ESTE GUION SE ENSAYO ANTES DE EXISTIR LA NECESIDAD. No se improvisa SQL de
-- reversion despues de un incidente.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── LA PUERTA ──────────────────────────────────────────────────────────────
DO $puerta$
DECLARE
    hay_columna boolean;
    no_pre      bigint;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='doc_reviews'
                      AND column_name='contrato')
      INTO hay_columna;

    IF NOT hay_columna THEN
        RAISE NOTICE 'La columna `contrato` no existe: la fase A no esta aplicada '
                     'o ya se revirtio. No hay nada que deshacer.';
        RETURN;
    END IF;

    EXECUTE 'SELECT count(*) FROM doc_reviews WHERE contrato <> ''PRE''' INTO no_pre;
    IF no_pre > 0 THEN
        RAISE EXCEPTION
            'ME NIEGO: hay % revision(es) con un contrato distinto de PRE. '
            'Revertir la fase A borraria la unica constancia de con que reglas '
            'nacieron. El rollback de la fase A solo es valido ANTES de la '
            'primera AUTORIDAD_TERMINAL.', no_pre;
    END IF;
END
$puerta$;

-- ── DESHACER, EN ORDEN INVERSO ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS tg_contrato_inmutable ON doc_reviews;
DROP FUNCTION IF EXISTS contrato_de_revision_es_inmutable();

ALTER TABLE doc_reviews DROP CONSTRAINT IF EXISTS ck_contrato_conocido;

-- Al quitar la columna caen tambien sus privilegios por columna.
ALTER TABLE doc_reviews DROP COLUMN IF EXISTS contrato;

-- ── LOS PRIVILEGIOS, COMO ESTABAN ──────────────────────────────────────────
-- La fase A cambio `GRANT UPDATE ON doc_reviews` (de tabla) por una lista de
-- columnas. Quitar la columna no restituye el privilegio de tabla: hay que
-- devolverlo a mano. Se revoca primero para barrer los privilegios POR COLUMNA
-- que quedaron sobre las demas columnas; si no, `ecd_app` acabaria con la lista
-- de columnas Y el de tabla, que no es el estado anterior.
DO $privilegios$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_app') THEN
        RAISE NOTICE 'ecd_app no existe: no hay privilegios que restituir.';
        RETURN;
    END IF;
    EXECUTE 'REVOKE UPDATE ON doc_reviews FROM ecd_app';
    EXECUTE 'GRANT UPDATE ON doc_reviews TO ecd_app';
END
$privilegios$;

-- ── VERIFICACION ───────────────────────────────────────────────────────────
DO $verificar$
DECLARE
    sobra text;
    por_columna bigint;
    de_tabla    boolean;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='doc_reviews'
                  AND column_name='contrato') THEN
        RAISE EXCEPTION 'la columna contrato sigue ahi';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_contrato_conocido') THEN
        RAISE EXCEPTION 'ck_contrato_conocido sigue ahi';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tg_contrato_inmutable') THEN
        RAISE EXCEPTION 'tg_contrato_inmutable sigue ahi';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc
                WHERE proname='contrato_de_revision_es_inmutable') THEN
        RAISE EXCEPTION 'la funcion del disparador sigue ahi';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_app') THEN
        SELECT count(*) INTO por_columna
          FROM information_schema.column_privileges
         WHERE table_name='doc_reviews' AND grantee='ecd_app'
           AND privilege_type='UPDATE';
        SELECT has_table_privilege('ecd_app', 'doc_reviews', 'UPDATE')
          INTO de_tabla;
        IF NOT de_tabla THEN
            RAISE EXCEPTION 'ecd_app se quedo SIN UPDATE sobre doc_reviews';
        END IF;
        RAISE NOTICE 'ecd_app: UPDATE de tabla = %, entradas por columna = %',
                     de_tabla, por_columna;
    END IF;

    RAISE NOTICE 'ROLLBACK DE LA FASE A completado. El esquema queda como antes.';
END
$verificar$;

COMMIT;
