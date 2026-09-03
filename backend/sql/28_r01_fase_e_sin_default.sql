-- ═══════════════════════════════════════════════════════════════════════════
-- REVIEWS-R01 · FASE E · SE RETIRA EL `DEFAULT 'PRE'`
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- QUE HACE, Y POR QUE ES LO ULTIMO
-- ---------------------------------
-- El `DEFAULT 'PRE'` existia para que el backend ANTERIOR --que no conocia la
-- columna-- pudiera seguir insertando durante las fases A a D. Cumplida su
-- funcion, se convierte en lo contrario de lo que R01 persigue: un escritor que
-- olvide el contrato heredaria PRE EN SILENCIO, y una revision acabaria
-- declarando un motor que nadie eligio.
--
--     ANTES de E   omitir `contrato`  ->  hereda 'PRE' sin decir nada
--     DESPUES de E omitir `contrato`  ->  ERROR, la fila no entra
--
-- Es la palanca de fallo cerrado del contrato: a partir de aqui, TODO escritor
-- declara con que reglas nace lo que escribe.
--
-- PRECONDICION QUE ESTA MIGRACION NO PUEDE COMPROBAR SOLA
-- --------------------------------------------------------
-- Que el backend DESPLEGADO aporte `contrato` explicitamente. Desde la build B
-- (`f003a3b`) lo hace, y los cinco INSERT de los ensayos se adaptaron en el
-- mismo commit que este fichero. Pero el catalogo no sabe que codigo esta
-- corriendo: quien aplique esto tiene que confirmar la version desplegada
-- ANTES. Se dice aqui en vez de fingir una comprobacion que no existe.
--
-- REVERSION
-- ---------
-- Una linea, y por eso no lleva fichero propio:
--
--     ALTER TABLE doc_reviews ALTER COLUMN contrato SET DEFAULT 'PRE';
--
-- No confundir con revertir la FASE A: eso es `27_r01_rollback.sql`, y desde
-- que existe la primera revision AUTORIDAD_TERMINAL esta PROHIBIDO -- borraria
-- la unica constancia de con que reglas nacio un expediente.
--
-- LO QUE NO TOCA
-- --------------
-- Ni una fila. Ni la semantica del motor. Ni la compatibilidad PRE: las 6
-- revisiones PRE vivas siguen cerrando por POSICION hasta su cierre natural.
-- Retirar esa rama sera un cambio futuro, cuando `PRE + pending = 0`.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Mismo criterio que la fase A: si la tabla esta ocupada, esto se rinde en 5 s
-- y no deja nada a medias, en vez de bloquear a todo el que llegue detras.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── LA PUERTA ──────────────────────────────────────────────────────────────
DO $puerta$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='doc_reviews'
                      AND column_name='contrato') THEN
        RAISE EXCEPTION 'ME NIEGO: la columna `contrato` no existe. La fase A no '
                        'esta aplicada, asi que no hay DEFAULT que retirar.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname='ck_contrato_conocido'
                      AND conrelid='doc_reviews'::regclass) THEN
        RAISE EXCEPTION 'ME NIEGO: falta ck_contrato_conocido. La fase A esta '
                        'incompleta y retirar el DEFAULT ahora dejaria la '
                        'columna sin red por ningun lado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname='tg_contrato_inmutable'
                      AND tgrelid='doc_reviews'::regclass AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'ME NIEGO: falta tg_contrato_inmutable.';
    END IF;
END
$puerta$;

-- ── LA PALANCA ─────────────────────────────────────────────────────────────
ALTER TABLE doc_reviews ALTER COLUMN contrato DROP DEFAULT;

-- ── VERIFICACION ───────────────────────────────────────────────────────────
DO $verificar$
DECLARE
    dflt  text;
    nulos bigint;
BEGIN
    SELECT column_default, (SELECT count(*) FROM doc_reviews WHERE contrato IS NULL)
      INTO dflt, nulos
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='doc_reviews'
       AND column_name='contrato';

    IF dflt IS NOT NULL THEN
        RAISE EXCEPTION 'el DEFAULT sigue puesto: %', dflt;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='doc_reviews'
                      AND column_name='contrato' AND is_nullable='NO') THEN
        RAISE EXCEPTION 'contrato dejo de ser NOT NULL';
    END IF;
    IF nulos > 0 THEN
        RAISE EXCEPTION 'quedan % revisiones sin contrato', nulos;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname='ck_contrato_conocido'
                      AND conrelid='doc_reviews'::regclass) THEN
        RAISE EXCEPTION 'ck_contrato_conocido desaparecio';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgname='tg_contrato_inmutable'
                  AND tgrelid='doc_reviews'::regclass AND tgenabled='D') THEN
        RAISE EXCEPTION 'tg_contrato_inmutable quedo DESHABILITADO';
    END IF;

    RAISE NOTICE 'FASE E aplicada: sin DEFAULT. Omitir `contrato` al insertar '
                 'pasa a ser un error, no una herencia silenciosa.';
END
$verificar$;

COMMIT;
