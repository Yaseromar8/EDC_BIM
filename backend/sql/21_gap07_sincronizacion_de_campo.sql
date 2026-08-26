-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 07 · SINCRONIZACION DE CAMPO — el registro de OPERACIONES
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
--   + sync_operaciones   una fila por ACTO capturado en campo
--
-- MIGRACION EXPAND: solo anade. No toca ni una fila de lo que ya existe, y los
-- objetos que crea son nuevos. El codigo viejo sigue funcionando sin enterarse.
--
-- LA SEPARACION QUE GOBIERNA ESTE OBJETO
-- ---------------------------------------
--     local_object_id   el OBJETO que todavia no existe en el servidor
--     operation_id      el ACTO que se hizo sobre el
--
-- Un issue levantado sin red tiene UN `local_object_id` y varios
-- `operation_id`: CREATE, ADD_EVIDENCE, MARK_CORRECTED. Confundirlos haria que
-- reintentar la foto reintentara la creacion.
--
-- LA IDEMPOTENCIA PERTENECE AL ACTO, no al objeto:
--
--     UNIQUE (project_id, operation_id)
--
-- y en un reenvio se DEVUELVE EL RESULTADO YA CONSOLIDADO. No se vuelve a
-- ejecutar. El caso real que esto ataca: el movil envia, el servidor crea, la
-- respuesta se pierde en el tunel. Sin esto, el reintento crea un segundo punch
-- para el mismo defecto y en obra aparecen dos.
--
-- EL ACTOR NO VIENE DEL MOVIL
-- ----------------------------
-- `actor_id` lo pone el servidor con la identidad AUTENTICADA al sincronizar.
-- Un acto offline no congela los permisos que el usuario tenia cuando perdio
-- cobertura: si mientras tanto lo sacaron de la obra, ese acto no entra.
--
-- Lo que SI se conserva del campo es CUANDO se hizo: `capturado_en` es la marca
-- del dispositivo, y va aparte de `recibida_en`. Son dos hechos distintos y
-- mezclarlos borraria la unica prueba de que el trabajo se hizo en obra y no
-- en la oficina tres dias despues.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS sync_operaciones (
    id                BIGSERIAL PRIMARY KEY,

    -- ── IDENTIDAD DEL ACTO ────────────────────────────────────────────────
    operation_id      UUID        NOT NULL,
    project_id        TEXT        NOT NULL,

    -- ── QUE OBJETO, Y CUAL ────────────────────────────────────────────────
    object_type       TEXT        NOT NULL,
    local_object_id   UUID        NOT NULL,
    server_object_id  TEXT,                 -- lo asigna el servidor al aplicar
    action            TEXT        NOT NULL,

    payload           JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- El estado que el cliente CREIA que tenia el objeto. Con esto se detecta
    -- que el servidor se movio mientras no habia red -- y se marca CONFLICTO en
    -- vez de pisar lo que otro decidio.
    base_version      TEXT,

    -- ── LAS DOS MARCAS DE TIEMPO, SEPARADAS ───────────────────────────────
    capturado_en      TIMESTAMP WITH TIME ZONE,   -- el reloj del dispositivo
    recibida_en       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ── QUIEN. Identidad AUTENTICADA al sincronizar ───────────────────────
    actor_id          INTEGER,
    actor_visible     TEXT,

    -- ── EL DESENLACE ──────────────────────────────────────────────────────
    estado            TEXT        NOT NULL,
    resultado         JSONB,                -- lo que se devuelve en un reenvio
    motivo            TEXT,
    code              TEXT,

    -- La operacion de la que depende. Si aquella no se aplico, esta no se
    -- ejecuta: marcar corregido antes de crear el issue no es un orden raro,
    -- es un acto sobre algo que no existe.
    depende_de        UUID,

    intentos          INTEGER     NOT NULL DEFAULT 1
);

DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT fk_sync_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT fk_sync_actor
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ LA LLAVE DE IDEMPOTENCIA ═══
-- Es lo que convierte un reenvio en una consulta. Sin ella, la red mala duplica
-- actos y nadie se entera hasta que hay dos punch para el mismo defecto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_idempotencia
    ON sync_operaciones(project_id, operation_id);

-- Estados del ACTO en el servidor. `PENDING` y `SYNCING` son del cliente y no
-- llegan aqui: aqui solo se anota lo que el servidor decidio.
--
-- `EN_CURSO` NO estaba en el diseno inicial y hace falta. El acto se RESERVA
-- antes de ejecutarlo --insertando su fila-- y se cierra despues. Si el proceso
-- muriera en medio, la fila se queda en EN_CURSO: el reenvio ve que ese acto ya
-- se intento y NO lo repite, que es lo unico que importa. Sin la reserva previa
-- habria una ventana en la que el acto surtio efecto y no quedo registrado, y
-- el siguiente reenvio lo aplicaria otra vez -- justo lo que la idempotencia
-- viene a impedir.
--
-- Una fila EN_CURSO es una operacion cuyo desenlace nadie sabe. Se ve, se
-- cuenta y se reconcilia; no se limpia sola.
DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_estado
        CHECK (estado IN ('EN_CURSO','APLICADA','RECHAZADA','CONFLICTO','BLOQUEADA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lista CERRADA de objetos. La primera vertical son dos, y ampliarla es una
-- decision que se toma y se escribe -- no un texto que llegue en el cuerpo de
-- una peticion y acabe creando una familia de actos que nadie reviso.
DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_objeto
        CHECK (object_type IN ('PROTOCOLO','ISSUE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_accion
        CHECK (action IN ('CREATE','SET_ITEMS','SIGN','ADD_EVIDENCE','MARK_CORRECTED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una operacion APLICADA tiene que decir SOBRE QUE quedo aplicada. Sin eso el
-- cliente no puede atar su objeto local al canonico, y al reintentar volveria a
-- crear.
DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_aplicada_con_objeto
        CHECK (estado <> 'APLICADA' OR server_object_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lo que NO se aplico tiene que decir POR QUE. «Rechazada» sin motivo obliga a
-- quien perdio su trabajo a adivinar si puede recuperarlo.
DO $$ BEGIN
    ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_negativa_con_motivo
        CHECK (estado IN ('APLICADA','EN_CURSO') OR motivo IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Para atar el objeto local al canonico sin recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS idx_sync_objeto_local
    ON sync_operaciones(project_id, local_object_id);
CREATE INDEX IF NOT EXISTS idx_sync_pendientes
    ON sync_operaciones(project_id, estado) WHERE estado <> 'APLICADA';

COMMIT;
