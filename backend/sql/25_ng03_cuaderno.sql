-- ═══════════════════════════════════════════════════════════════════════════
-- NG-03 · CUADERNO DE OBRA — parte diario, asientos e instrucciones (doc 96)
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- TRES OBJETOS, NO UNO: el PARTE es la jornada (obra + fecha OPERATIVA
-- declarada, jamas derivada de created_at UTC -- regla congelada por el
-- propietario); el ASIENTO es un registro tipado con correlativo POR OBRA,
-- inmutable una vez registrado; la INSTRUCCION es un acto formal, inmutable
-- al emitirse -- su correccion es una RECTIFICACION nueva que la referencia.
--
-- LAS LISTAS CERRADAS CRECEN JUNTAS (leccion F2/N2, dos veces pagada):
-- esta migracion amplia `ck_sync_objeto` (PARTE y ASIENTO entran al motor de
-- campo) y `ck_encargos_tipo` EN LA MISMA pasada que el codigo. Los tripwires
-- de test_ng03_cuaderno casan cada lista con la suya.
--
-- LA CORRECCION DEL PROPIETARIO EN LA BASE: `ck_instrucciones_emisor_funcion`
-- fija que solo SUPERVISION y ENTIDAD emiten -- ni un script con el rol de la
-- app puede colar una instruccion de quien no tiene esa autoridad. Y el
-- destinatario de un encargo puede ser una EMPRESA concreta
-- (`destino_empresa`): el BIC de una instruccion se resuelve contra el sujeto
-- contractual, no contra cualquier miembro que hoy comparta funcion.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── EL PARTE: la jornada ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_partes (
    id              SERIAL PRIMARY KEY,
    project_id      TEXT      NOT NULL,
    model_urn       TEXT,
    -- La fecha OPERATIVA declarada de la jornada. Columna propia, DATE, y la
    -- identidad del parte: nunca created_at::date (a las 7 pm de Lima, UTC ya
    -- vive en manana).
    fecha_operativa DATE      NOT NULL,
    responsable_id  INTEGER   NOT NULL,
    created_by      TEXT,
    estado          TEXT      NOT NULL DEFAULT 'ABIERTO',
    cerrado_por     TEXT,
    cerrado_en      TIMESTAMP,
    creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    history         JSONB     NOT NULL DEFAULT '[]'::jsonb
);

DO $$ BEGIN
    ALTER TABLE doc_partes ADD CONSTRAINT uq_partes_obra_fecha
        UNIQUE (project_id, fecha_operativa);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_partes ADD CONSTRAINT ck_partes_estado
        CHECK (estado IN ('ABIERTO','CERRADO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un parte CERRADO sin sello de cierre seria un estado que no dice quien ni
-- cuando congelo la jornada.
DO $$ BEGIN
    ALTER TABLE doc_partes ADD CONSTRAINT ck_partes_cierre_con_sello
        CHECK (estado <> 'CERRADO' OR cerrado_en IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_partes ADD CONSTRAINT fk_partes_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT y no CASCADE: borrar la cuenta de quien abrio la jornada dejaria
-- un acto sin responsable.
DO $$ BEGIN
    ALTER TABLE doc_partes ADD CONSTRAINT fk_partes_responsable
        FOREIGN KEY (responsable_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── EL ASIENTO: el registro ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_asientos (
    id             SERIAL PRIMARY KEY,
    project_id     TEXT      NOT NULL,
    parte_id       INTEGER   NOT NULL,
    -- Correlativo POR OBRA, continuo entre dias: el asiento N.º 217 es el 217
    -- de la obra, no «el 3.º del martes».
    numero         INTEGER   NOT NULL,
    tipo           TEXT      NOT NULL,
    texto          TEXT,
    contenido      JSONB     NOT NULL DEFAULT '{}'::jsonb,
    referencias    JSONB     NOT NULL DEFAULT '{}'::jsonb,
    autor_id       INTEGER   NOT NULL,
    -- Snapshot DE ENTONCES: la funcion se deriva hoy del directorio, pero el
    -- asiento tiene que decir cual era CUANDO se registro.
    autor_empresa  TEXT,
    autor_funcion  TEXT,
    created_by     TEXT,
    estado         TEXT      NOT NULL,
    motivo_devolucion TEXT,
    aprobado_por   TEXT,
    aprobado_en    TIMESTAMP,
    -- DECLARADO por el dispositivo (GAP 07): util, no autoritativo.
    capturado_en   TIMESTAMP,
    registrado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    history        JSONB     NOT NULL DEFAULT '[]'::jsonb
);

DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT uq_asientos_obra_numero
        UNIQUE (project_id, numero);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La lista cerrada de tipos (doc 96 §F). Casada con
-- cuaderno_de_obra.TIPOS_DE_ASIENTO por tripwire.
DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT ck_asientos_tipo
        CHECK (tipo IN ('avance','personal','equipos','materiales','clima',
                        'seguridad','calidad','restriccion','visita','foto',
                        'instruccion','rectificacion','nota'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT ck_asientos_estado
        CHECK (estado IN ('REGISTRADO','EN_APROBACION','APROBADO','DEVUELTO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El snapshot de funcion, si existe, es una funcion contractual real.
DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT ck_asientos_funcion
        CHECK (autor_funcion IS NULL OR autor_funcion IN
               ('ENTIDAD','SUPERVISION','CONTRATISTA','PROYECTISTA','OTRO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un asiento DEVUELTO sin motivo no le dice a su autor que corregir.
DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT ck_asientos_devuelto_con_motivo
        CHECK (estado <> 'DEVUELTO' OR motivo_devolucion IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT fk_asientos_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT: un parte con asientos no se borra; un asiento sin parte no existe.
DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT fk_asientos_parte
        FOREIGN KEY (parte_id) REFERENCES doc_partes(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_asientos ADD CONSTRAINT fk_asientos_autor
        FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_asientos_parte ON doc_asientos(parte_id);
CREATE INDEX IF NOT EXISTS idx_asientos_obra  ON doc_asientos(project_id, numero DESC);

-- ── LA INSTRUCCIÓN: el acto formal ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_instrucciones (
    id             SERIAL PRIMARY KEY,
    project_id     TEXT      NOT NULL,
    model_urn      TEXT,
    codigo         TEXT      NOT NULL,
    asunto         TEXT      NOT NULL,
    contenido      TEXT      NOT NULL,
    emisor_id      INTEGER   NOT NULL,
    emisor_empresa TEXT,
    emisor_funcion TEXT      NOT NULL,
    created_by     TEXT,
    -- El SUJETO CONTRACTUAL con su snapshot: {tipo: persona|empresa, ...,
    -- empresa, funcion}. Nunca una funcion desnuda (correccion del
    -- propietario, doc 96).
    destinatario   JSONB     NOT NULL,
    referencias    JSONB     NOT NULL DEFAULT '{}'::jsonb,
    rectifica_a    INTEGER,
    -- Acuse grow-only, el patron de los transmittals: lista que solo CRECE.
    acuses         JSONB     NOT NULL DEFAULT '[]'::jsonb,
    estado         TEXT      NOT NULL DEFAULT 'EMITIDA',
    atencion       JSONB,
    emitida_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cerrada_en     TIMESTAMP,
    history        JSONB     NOT NULL DEFAULT '[]'::jsonb
);

DO $$ BEGIN
    ALTER TABLE doc_instrucciones ADD CONSTRAINT uq_instrucciones_codigo
        UNIQUE (project_id, codigo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_instrucciones ADD CONSTRAINT ck_instrucciones_estado
        CHECK (estado IN ('EMITIDA','ACUSADA','ATENDIDA','CERRADA','RECTIFICADA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LA AUTORIDAD DE EMISION, TAMBIEN EN LA BASE: solo las funciones emisoras
-- declaradas (doc 96 §L, aprobado). Casada con
-- cuaderno_de_obra.FUNCIONES_EMISORAS_DE_INSTRUCCION por tripwire.
DO $$ BEGIN
    ALTER TABLE doc_instrucciones ADD CONSTRAINT ck_instrucciones_emisor_funcion
        CHECK (emisor_funcion IN ('SUPERVISION','ENTIDAD'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_instrucciones ADD CONSTRAINT fk_instrucciones_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_instrucciones ADD CONSTRAINT fk_instrucciones_emisor
        FOREIGN KEY (emisor_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE doc_instrucciones ADD CONSTRAINT fk_instrucciones_rectifica
        FOREIGN KEY (rectifica_a) REFERENCES doc_instrucciones(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_instrucciones_obra ON doc_instrucciones(project_id);

-- ── LA UBICACIÓN DE LA OBRA (para el clima E08) ────────────────────────────
--
-- Las coordenadas DE LA OBRA, nunca las del dispositivo: la obra tiene
-- ubicacion; la persona, no (la misma regla de privacidad GPS de NG-02).

CREATE TABLE IF NOT EXISTS doc_obra_ubicacion (
    project_id      TEXT      PRIMARY KEY,
    lat             DOUBLE PRECISION NOT NULL,
    lon             DOUBLE PRECISION NOT NULL,
    descripcion     TEXT,
    actualizado_por TEXT,
    actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    ALTER TABLE doc_obra_ubicacion ADD CONSTRAINT fk_obra_ubicacion_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── EL MOTOR DE CAMPO: PARTE y ASIENTO entran a la lista cerrada ───────────
--
-- La MISMA pasada que el codigo (leccion N2). Aprobar, cerrar y emitir NO
-- entran: son actos SOLO EN LINEA por decision semantica (doc 96 §H).

ALTER TABLE sync_operaciones DROP CONSTRAINT IF EXISTS ck_sync_objeto;
ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_objeto
    CHECK (object_type IN ('PROTOCOLO','ISSUE','FOTO','PARTE','ASIENTO'));

-- ── ENCARGOS: el sujeto contractual y los tipos nuevos ─────────────────────
--
-- `destino_empresa`: el BIC de una instruccion dirigida a una empresa se
-- resuelve contra ESA empresa (sus miembros en la obra), no contra una
-- funcion. La invariante «un encargo nunca amplia acceso» se conserva: la
-- bandeja sigue exigiendo membresia de la obra en su JOIN.

ALTER TABLE encargos ADD COLUMN IF NOT EXISTS destino_empresa INTEGER;

DO $$ BEGIN
    ALTER TABLE encargos ADD CONSTRAINT fk_encargos_empresa
        FOREIGN KEY (destino_empresa) REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un encargo sin destinatario sigue sin ser un encargo; ahora hay tres formas
-- de tenerlo.
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_destino;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_destino
    CHECK (destino_usuario IS NOT NULL OR destino_funcion IS NOT NULL
           OR destino_empresa IS NOT NULL);

-- El REEMPLAZO, no un segundo CHECK: dos CHECK sobre la misma columna se
-- cumplen a la vez y el viejo seguiria prohibiendo los tipos nuevos.
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo
    CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL',
                           'PROTOCOLO','ISSUE','PARTE','ASIENTO','INSTRUCCION'));

-- El indice de unicidad de deuda abierta aprende la tercera forma de destino.
DROP INDEX IF EXISTS idx_encargos_abierto_unico;
CREATE UNIQUE INDEX idx_encargos_abierto_unico
    ON encargos(project_id, objeto_tipo, objeto_id,
                COALESCE(destino_usuario, -1), COALESCE(destino_funcion, ''),
                COALESCE(destino_empresa, -1))
 WHERE estado = 'abierto';

-- ── CAPA 16: la herramienta EXISTE en las obras que ya existen ─────────────
--
-- Fila EXPLICITA, como las migraciones 08 y 13: el estado se ve, no se adivina.
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, 'cuaderno', TRUE, 'migracion 25'
  FROM projects p
 WHERE NOT EXISTS (SELECT 1 FROM project_tools t
                    WHERE t.project_id = p.id AND t.herramienta = 'cuaderno')
ON CONFLICT DO NOTHING;

-- ── GRANTS, en la misma transaccion (leccion F1) ───────────────────────────
--
-- SIN DELETE en los tres objetos: el cuaderno es evidencia y no se borra --
-- se rectifica. La ubicacion admite UPDATE (es configuracion, no acto).

GRANT SELECT, INSERT, UPDATE ON doc_partes         TO ecd_app;
GRANT SELECT, INSERT, UPDATE ON doc_asientos       TO ecd_app;
GRANT SELECT, INSERT, UPDATE ON doc_instrucciones  TO ecd_app;
GRANT SELECT, INSERT, UPDATE ON doc_obra_ubicacion TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE doc_partes_id_seq         TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE doc_asientos_id_seq       TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE doc_instrucciones_id_seq  TO ecd_app;

-- EL RECORTE, EXPLICITO -- defecto real cazado por el ENSAYO de esta migracion:
-- los privilegios POR DEFECTO del rol migrador (`ALTER DEFAULT PRIVILEGES` ->
-- arwd) conceden tambien DELETE a ecd_app sobre cada tabla que crea, asi que
-- el GRANT de arriba no recorta nada por si solo. Sin este REVOKE, «sin
-- DELETE» era una frase del fichero y no una verdad de la base -- la misma
-- clase que N1: el texto promete y nadie le pregunta a la base.
REVOKE DELETE, TRUNCATE ON doc_partes         FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_asientos       FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_instrucciones  FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_obra_ubicacion FROM ecd_app;

-- Y el mismo recorte para la evidencia de NG-02, que lo DECLARABA (migracion
-- 23: «no borran fotos») y no lo tenia. `doc_album_fotos` conserva DELETE:
-- deshacer una agrupacion no destruye evidencia (decision de NG-02, intacta).
REVOKE DELETE, TRUNCATE ON doc_fotos   FROM ecd_app;
REVOKE DELETE, TRUNCATE ON doc_albumes FROM ecd_app;

COMMIT;
