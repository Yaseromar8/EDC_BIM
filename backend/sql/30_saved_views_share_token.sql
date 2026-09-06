-- ═══════════════════════════════════════════════════════════════════════════
-- SAVED VIEWS · E-4D · LA CAPACIDAD PUBLICA DEJA DE SER LA CLAVE PRIMARIA
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- QUE PROBLEMA RESUELVE
-- ---------------------
-- El enlace de una vista compartida es `?shareView=<saved_views.id>`, y ese id
-- ES la credencial: quien lo tiene, ve la vista. Eso funciona mientras el id
-- sea impredecible. Medido sobre la copia de produccion del 4-sep-2026:
--
--     7 vistas   ->   3 con id = hora en milisegundos (13 cifras)
--                     4 con id = secrets.token_urlsafe(24)
--
-- Los cuatro tokens estan bien: 192 bits. Los tres timestamps, no. Su espacio
-- real es de 33,6 bits sobre los 150 dias en que se crearon, y baja a 15,9 bits
-- si se sabe el minuto --que es lo que sabe cualquiera a quien le hayan dicho
-- «acabo de guardar una vista»--.
--
-- La solucion no es alargar el id: es dejar de usar la IDENTIDAD como
-- CAPACIDAD. Son dos cosas distintas y aqui se separan:
--
--     saved_views.id     identidad interna. No cambia, no se rota, la usan las
--                        rutas autenticadas y cualquier referencia futura.
--     share_token        capacidad publica. Aleatoria, opcional, rotable, y su
--                        rotacion invalida el enlace anterior sin tocar el id.
--
-- POR QUE `uuid` Y NO OTRO TOKEN
-- ------------------------------
-- Porque ya hay un precedente en esta base y conviene tener UNA sola forma de
-- capacidad publica: `document_shares.id` es `uuid DEFAULT gen_random_uuid()`,
-- con `expires_at` y `revoked`. 122 bits de aleatoriedad, generados por el
-- propio PostgreSQL, sin que el token pase nunca por el cliente.
--
-- NULL SIGNIFICA «NO COMPARTIDA», Y ES EL VALOR DE PARTIDA
-- --------------------------------------------------------
-- Ninguna vista nace con capacidad publica. El token se crea el dia que alguien
-- pulsa «Copiar enlace», y no antes: una capacidad que existe sin que nadie la
-- haya pedido es una puerta abierta que nadie recuerda haber abierto.
--
-- Por eso el UNIQUE es PARCIAL (`WHERE share_token IS NOT NULL`): un indice
-- unico normal aceptaria varios NULL igualmente, pero decirlo asi deja escrito
-- que la unicidad se exige SOLO donde hay capacidad.
--
-- EL CENSO DE LA VIA ANTIGUA
-- --------------------------
-- Retirar los enlaces viejos sin saber si alguien los usa es tirar de un cable
-- a ver que se apaga. Estas dos columnas responden a eso y a nada mas:
--
--     legacy_accesos         cuantos MINUTOS DISTINTOS se abrio por la via
--                            antigua. No son peticiones: el backend anota como
--                            mucho una vez por minuto y por vista, porque esto
--                            es una escritura en una ruta publica sin sesion y
--                            no puede convertirse en un amplificador.
--     legacy_ultimo_acceso   cuando fue la ultima
--
-- Ni IP, ni navegador, ni quien. Para decidir si se retira una via hace falta
-- saber SI se usa y CUANDO, no quien la usa.
--
-- LA VENTANA LEGACY NO SE FIJA AQUI, Y HAY QUE DECIDIRLA AL DESPLEGAR
-- -------------------------------------------------------------------
-- Una fecha escrita en una migracion es irreversible y se decidiria a ciegas,
-- antes de tener el censo -- que es justo el dato con el que hay que decidirla.
-- La vigencia la gobierna `ENLACES_LEGACY_HASTA`, cambiable en produccion sin
-- desplegar codigo:
--
--     abierto                     la via antigua sigue abierta
--     retirado                    cerrada
--     2026-12-31T23:59:59-05:00   abierta hasta ese instante (ISO 8601 CON zona)
--
-- ATENCION AL DESPLEGAR. Si la variable NO ESTA PUESTA, o esta mal escrita, la
-- via antigua queda CERRADA: no decidir no puede significar dejarla abierta
-- para siempre. Eso implica que desplegar esto sin escribir la variable APAGA
-- LOS 7 ENLACES HISTORICOS DE PRODUCCION. Para conservarlos durante la
-- transicion hay que poner `ENLACES_LEGACY_HASTA=abierto` --o una fecha-- en el
-- entorno del backend ANTES de desplegar.
--
-- `postura_de_seguridad` lleva el punto `ENLACES_LEGACY_DECIDIDA`, asi que
-- «faltan: N» sube si alguien despliega sin haberlo decidido.
--
-- Ver `backend/vistas_compartidas.py`.
--
-- LO QUE NO HACE
-- --------------
-- No cambia ni un id y no genera ningun token. De las vistas que ya existen no
-- reescribe ni una fila: `legacy_enlace` entra con DEFAULT TRUE, que PostgreSQL
-- guarda en el catalogo sin recorrer la tabla, y el DEFAULT pasa a FALSE en la
-- sentencia siguiente. Despues de esta migracion los enlaces repartidos siguen
-- abriendo exactamente igual.
--
-- REVERSION
-- ---------
-- `30_saved_views_share_token_rollback.sql`. Se niega si ya hay algun token
-- emitido: quitar la columna con capacidades vivas no es revertir un cambio de
-- esquema, es romper enlaces que hay repartidos por ahi.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Fallo rapido: todo el DDL de aqui pide ACCESS EXCLUSIVE sobre `saved_views`.
-- Una migracion esperando en produccion no es una migracion lenta: es una caida.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- LA MARCA DE LA VIA ANTIGUA. Se anade con DEFAULT TRUE --las filas que ya
-- existen tienen enlaces repartidos por ahi-- y acto seguido el DEFAULT pasa a
-- FALSE, de modo que NINGUNA vista creada a partir de ahora la hereda.
--
-- Es el punto entero de E-4D: si la via antigua se reconociera por el FORMATO
-- del id, los ids que genera el codigo de hoy --`token_urlsafe(24)`, los mismos
-- 32 caracteres que los 4 enlaces de produccion-- seguirian sirviendo de
-- capacidad, y la identidad nunca dejaria de ser la llave.
--
-- PostgreSQL no reescribe la tabla al anadir una columna con DEFAULT (11+):
-- guarda el valor en el catalogo. Cero filas tocadas, tambien aqui.
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS legacy_enlace BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE saved_views ALTER COLUMN legacy_enlace SET DEFAULT FALSE;

ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS share_token          UUID;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS legacy_accesos       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS legacy_ultimo_acceso TIMESTAMP;

COMMENT ON COLUMN saved_views.legacy_enlace IS
    'TRUE = esta vista ya tenia enlaces repartidos con su `id` cuando llego E-4D, '
    'y ese `id` sigue abriendo mientras ENLACES_LEGACY_HASTA lo permita. '
    'FALSE en todo lo creado despues: su unica capacidad publica es share_token.';
COMMENT ON COLUMN saved_views.share_token IS
    'Capacidad publica del enlace compartido. NULL = la vista no se ha compartido. '
    'NO es la identidad: rotarlo invalida el enlace anterior y deja el id intacto.';
COMMENT ON COLUMN saved_views.legacy_accesos IS
    'Minutos distintos en que se abrio por la via antigua (?shareView=<id>). '
    'No son peticiones: se anota como mucho una vez por minuto y por vista.';
COMMENT ON COLUMN saved_views.legacy_ultimo_acceso IS
    'Ultima apertura por la via antigua. Es el dato con el que se decide retirarla.';

-- UNICIDAD SOLO DONDE HAY CAPACIDAD. Dos vistas no pueden compartir token; un
-- numero cualquiera de vistas puede no tener ninguno.
CREATE UNIQUE INDEX IF NOT EXISTS ux_saved_views_share_token
    ON saved_views (share_token) WHERE share_token IS NOT NULL;

-- ── VERIFICACION ──────────────────────────────────────────────────────────
-- El fichero promete cuatro columnas, un indice unico parcial, CERO tokens y
-- CERO filas tocadas. Que lo confirme la base, no el texto.
DO $verificar$
DECLARE
    faltan TEXT;
BEGIN
    SELECT string_agg(c, ', ') INTO faltan
      FROM unnest(ARRAY['share_token','legacy_accesos','legacy_ultimo_acceso',
                        'legacy_enlace']) AS c
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'saved_views' AND column_name = c);
    IF faltan IS NOT NULL THEN
        RAISE EXCEPTION 'faltan columnas tras la migracion: %', faltan;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE tablename = 'saved_views'
                      AND indexname = 'ux_saved_views_share_token') THEN
        RAISE EXCEPTION 'no se creo ux_saved_views_share_token';
    END IF;

    IF EXISTS (SELECT 1 FROM saved_views WHERE share_token IS NOT NULL) THEN
        RAISE EXCEPTION 'esta migracion NO emite tokens: alguna vista trae uno';
    END IF;

    IF EXISTS (SELECT 1 FROM saved_views WHERE legacy_accesos <> 0
                                            OR legacy_ultimo_acceso IS NOT NULL) THEN
        RAISE EXCEPTION 'el censo tiene que empezar en cero';
    END IF;

    -- Las que ya estaban conservan su enlace; lo que nazca despues, no.
    IF EXISTS (SELECT 1 FROM saved_views WHERE NOT legacy_enlace) THEN
        RAISE EXCEPTION 'alguna vista existente quedo sin la marca de enlace antiguo';
    END IF;
    IF (SELECT column_default FROM information_schema.columns
         WHERE table_name = 'saved_views' AND column_name = 'legacy_enlace') <> 'false' THEN
        RAISE EXCEPTION 'el DEFAULT de legacy_enlace tiene que quedar en FALSE';
    END IF;

    RAISE NOTICE 'saved_views: share_token y censo listos. 0 tokens emitidos, '
                 '0 filas tocadas, ningun id cambiado. La ventana legacy la '
                 'gobierna ENLACES_LEGACY_HASTA, no esta migracion.';
END
$verificar$;

COMMIT;
