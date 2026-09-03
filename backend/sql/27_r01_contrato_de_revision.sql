-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEWS-R01 · FASE A · EL CONTRATO DE UNA REVISION
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- QUE RESUELVE
-- ------------
-- `REVISA` y `APRUEBA` existian como etiquetas de paso y no significaban nada:
-- `/act` cierra la revision por POSICION -- `current_step + 1 < len(steps)` --,
-- no por autoridad. Dar significado a esas etiquetas cambia el comportamiento
-- del motor, y cambiarlo para TODAS las revisiones reescribiria procesos ya
-- firmados. Por eso cada revision declara con que reglas nacio:
--
--     PRE                  cierra por POSICION. Es lo que hace hoy el motor.
--     AUTORIDAD_TERMINAL   cierra solo si el ULTIMO paso posicional tiene
--                          decision=APRUEBA y se aprueba.
--
-- POR QUE UNA COLUMNA Y NO UN CAMPO DENTRO DE JSONB
-- --------------------------------------------------
-- Porque tiene que poder RESTRINGIRSE. `steps` y `history` son JSONB sin
-- restriccion: la medicion del 3-sep-2026 encontro una revision APROBADA cuyos
-- pasos no tienen `user_id`, aunque `_pasos_validos` lo exige desde hace
-- tiempo. Un discriminante de motor dentro de un JSONB sin restriccion es un
-- discriminante que nadie garantiza. `history` ademas admite NULL.
--
-- LA FASE A ES INERTE PARA EL BACKEND VIVO, Y ESTA DEMOSTRADO
-- ------------------------------------------------------------
-- Ninguna consulta de `doc_reviews` usa `SELECT *`: las tres enumeran columnas
-- y terminan en `plantilla_version`, y `_row_to_dict` indexa por posicion. Una
-- columna nueva al final es invisible para el backend en produccion. Por eso
-- esta migracion puede aplicarse y quedarse aplicada sin desplegar nada.
--
-- LAS 9 REVISIONES EXISTENTES QUEDAN `PRE`
-- -----------------------------------------
-- No se convierten, no se reinterpretan, no se les rellena `decision`. Cada una
-- termina bajo las reglas con las que nacio. El `DEFAULT 'PRE'` existe para que
-- el backend anterior --que no conoce la columna-- pueda seguir insertando
-- durante las fases A a D. Se retira en la fase E, y entonces omitir el
-- contrato pasa a ser un error en vez de una herencia silenciosa.
--
-- LA INMUTABILIDAD QUE ESTO DA, Y LA QUE NO
-- ------------------------------------------
-- NIVEL 1 · OPERACIONAL: ninguna operacion normal autorizada puede cambiar
-- PRE <-> AUTORIDAD_TERMINAL. Lo sostienen el disparador --que se dispara en
-- CUALQUIER UPDATE y en CUALQUIER rol, incluido el propietario haciendo
-- mantenimiento con SQL ordinario-- y el privilegio por columna sobre ecd_app.
--
-- NIVEL 2 · FRENTE A UN ADMINISTRADOR DELIBERADO: **NO DEMOSTRADA**. Quien
-- pueda ejecutar DDL puede `ALTER TABLE ... DISABLE TRIGGER` y cambiar el
-- valor. Esto no lo impide y no finge impedirlo: lo unico que consigue es que
-- deje de ser un efecto colateral y pase a exigir un acto deliberado.
--
-- Es el mismo limite que 03_grants_ida.sql ya dejo escrito para la auditoria:
-- «la inmutabilidad de verdad necesita separacion de funciones, almacenamiento
-- append-only y evidencia fuera del alcance de quien administra. Ese hallazgo
-- sigue abierto». R01 NO lo cierra.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── LA COLUMNA ─────────────────────────────────────────────────────────────
-- En tres pasos y no en un `ADD COLUMN ... NOT NULL DEFAULT`, para que una
-- ejecucion parcial anterior no deje la columna a medias sin que se note.
ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS contrato TEXT;

-- Las que ya existen son PRE POR DEFINICION: nacieron antes de que hubiera otro
-- contrato. No es una conversion, es ponerle nombre a lo que ya eran.
UPDATE doc_reviews SET contrato = 'PRE' WHERE contrato IS NULL;

ALTER TABLE doc_reviews ALTER COLUMN contrato SET DEFAULT 'PRE';
ALTER TABLE doc_reviews ALTER COLUMN contrato SET NOT NULL;

-- ── LISTA CERRADA ──────────────────────────────────────────────────────────
-- Igual que `ck_sync_objeto`: la lista de contratos vive en la BASE para que
-- nadie invente un motor que ninguna revision vio. La misma lista esta en
-- `backend/flujo_de_revision.py`, y `test_r01_contrato_de_revision` casa las
-- dos -- es la clase de defecto que ya nos costo la 24 (codigo y migracion
-- divergiendo sin que ninguna prueba los casara).
--
-- DONDE MANDA ESTA RESTRICCION, Y DONDE NO. Medido en el ensayo, no supuesto:
-- manda en el **INSERT**. Por UPDATE no llega a evaluarse nunca, porque el
-- disparador de inmutabilidad de mas abajo es BEFORE y rechaza cualquier cambio
-- de valor antes de que la restriccion entre en juego. Quien audite esto
-- creyendo que el CHECK vigila los UPDATE se equivocaria: a los UPDATE los
-- vigila el disparador, y de forma mas estricta -- no solo rechaza los valores
-- desconocidos, rechaza TODOS los cambios.
ALTER TABLE doc_reviews DROP CONSTRAINT IF EXISTS ck_contrato_conocido;
ALTER TABLE doc_reviews ADD CONSTRAINT ck_contrato_conocido
    CHECK (contrato IN ('PRE','AUTORIDAD_TERMINAL'));

-- ── NIVEL 1a · EL DISPARADOR DE INMUTABILIDAD ──────────────────────────────
-- Compara VALORES y no usa `BEFORE UPDATE OF contrato`: esa forma se dispara
-- cuando la columna APARECE en el SET, no cuando CAMBIA. La invariante que hay
-- que enunciar es la del valor.
--
-- Es transparente para los 7 UPDATE que existen sobre esta tabla: ninguno
-- menciona `contrato`, luego NEW.contrato = OLD.contrato y la comparacion es
-- falsa. No es un freno colateral sobre `/act`.
--
-- Seria el PRIMER disparador del repositorio. Se declara como lo que es: una
-- clase de mecanismo nueva aqui.
CREATE OR REPLACE FUNCTION contrato_de_revision_es_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $inmutable$
BEGIN
    IF NEW.contrato IS DISTINCT FROM OLD.contrato THEN
        RAISE EXCEPTION
            'El contrato de la revision %  no se puede cambiar (% -> %). Una '
            'revision termina bajo las reglas con las que nacio.',
            OLD.id, OLD.contrato, NEW.contrato;
    END IF;
    RETURN NEW;
END;
$inmutable$;

DROP TRIGGER IF EXISTS tg_contrato_inmutable ON doc_reviews;
CREATE TRIGGER tg_contrato_inmutable
    BEFORE UPDATE ON doc_reviews
    FOR EACH ROW
    EXECUTE FUNCTION contrato_de_revision_es_inmutable();

-- ── NIVEL 1b · PRIVILEGIO POR COLUMNA SOBRE ecd_app ────────────────────────
-- Defensa en profundidad, no requisito: el disparador ya cubre a todos los
-- roles. Esto hace que la garantia no dependa de que el disparador siga ahi, y
-- es el idioma con el que este repositorio ya expresa «esto no lo muta la
-- aplicacion» (03_grants_ida.sql: REVOKE UPDATE ... ON activity_log).
--
-- MECANICA QUE NO ES LA OBVIA: un GRANT de tabla cubre TODAS las columnas y no
-- admite restarle una. Hay que revocar el de tabla y reconceder por columna.
--
-- CONSECUENCIA QUE HAY QUE SABER (R01-RES-07): un ADD COLUMN futuro sobre
-- doc_reviews NO quedara actualizable por ecd_app, porque
-- ALTER DEFAULT PRIVILEGES cubre tablas nuevas, no columnas nuevas de una tabla
-- que ya existe. Es fallo cerrado --mejor que lo contrario-- pero quien anada
-- una columna aqui tiene que volver a conceder.
--
-- La lista se calcula, no se escribe a mano: una lista escrita a mano se queda
-- vieja el dia que alguien anada una columna.
DO $privilegios$
DECLARE
    columnas text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_app') THEN
        RAISE NOTICE 'ecd_app no existe en este cluster: el privilegio por '
                     'columna NO se aplica. El disparador si, y es el que '
                     'sostiene la garantia. Ejecuta antes 00_roles.sql si '
                     'esperabas la defensa en profundidad.';
        RETURN;
    END IF;

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO columnas
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'doc_reviews'
       AND column_name <> 'contrato';

    IF columnas IS NULL THEN
        RAISE EXCEPTION 'doc_reviews no tiene columnas ademas de contrato: algo '
                        'esta muy mal.';
    END IF;

    EXECUTE 'REVOKE UPDATE ON doc_reviews FROM ecd_app';
    EXECUTE format('GRANT UPDATE (%s) ON doc_reviews TO ecd_app', columnas);
END
$privilegios$;

-- ── VERIFICACION ───────────────────────────────────────────────────────────
-- Una migracion que no comprueba lo que dejo hecho solo comprueba que no
-- reventó. Se afirma cada garantia por separado.
DO $verificar$
DECLARE
    sin_contrato bigint;
    no_pre       bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='doc_reviews'
                      AND column_name='contrato' AND is_nullable='NO') THEN
        RAISE EXCEPTION 'doc_reviews.contrato no existe o admite NULL';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname='ck_contrato_conocido'
                      AND conrelid='doc_reviews'::regclass) THEN
        RAISE EXCEPTION 'falta ck_contrato_conocido';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname='tg_contrato_inmutable'
                      AND tgrelid='doc_reviews'::regclass
                      AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'falta tg_contrato_inmutable: sin el disparador no hay '
                        'inmutabilidad operacional';
    END IF;

    -- El disparador tiene que estar HABILITADO, no solo existir.
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgname='tg_contrato_inmutable'
                  AND tgrelid='doc_reviews'::regclass
                  AND tgenabled = 'D') THEN
        RAISE EXCEPTION 'tg_contrato_inmutable existe pero esta DESHABILITADO';
    END IF;

    SELECT count(*) INTO sin_contrato FROM doc_reviews WHERE contrato IS NULL;
    IF sin_contrato > 0 THEN
        RAISE EXCEPTION 'quedan % revisiones sin contrato', sin_contrato;
    END IF;

    SELECT count(*) INTO no_pre FROM doc_reviews WHERE contrato <> 'PRE';
    IF no_pre > 0 THEN
        RAISE EXCEPTION 'la fase A no puede dejar % revisiones con un contrato '
                        'distinto de PRE', no_pre;
    END IF;

    RAISE NOTICE 'FASE A aplicada: contrato NOT NULL + lista cerrada + '
                 'disparador de inmutabilidad. Todas las revisiones son PRE.';
END
$verificar$;

COMMIT;
