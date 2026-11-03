-- 46 · Las NUBES de una incidencia: quién alimenta cada una y si quedó levantada (3-nov-2026).
--
-- Diseño y normas: docs/archivos/23_APORTES_POR_NUBE.md y 24_INVESTIGACION_REVISION_DE_PLANOS_NORMAS.md.
--
-- 1 · `doc_issue_nubes`: una fila por nube de una incidencia.
--       clase         'observacion' (la dibuja el revisor) o 'encargo' (el encargado reparte trabajo a su equipo);
--       padre_id      la observación de la que cuelga una nube de encargo;
--       destino_*     a quién se asigna: una persona O una empresa de la obra, nunca las dos;
--       empresa_equipo la empresa del encargado al crear un encargo: quién lo ve (es trabajo en proceso de su equipo);
--       estado        sin_asignar · pedida · entregada · devuelta · aceptada · levantada · no_levantada;
--       rondas        [{n, pedido, pedido_por, pedido_en, entregas[], entregado_por, entregado_en,
--                       decision, decidido_por, decidido_en, motivo}] — se AÑADEN, no se reescriben;
--       verificacion  {resultado, motivo, version_id, version_number, por, por_id, en} de la última verificación;
--       history       eventos, de solo añadir.
--     La app (ecd_app) puede leer, insertar y actualizar; NO borrar (como doc_issues desde la 26).
-- 2 · `encargos`: el tipo 'NUBE' (quien debe entregar en una nube lo ve en «Mi trabajo»).
-- 3 · `project_companies`: la función 'SUBCONTRATISTA'.
--
-- Aplicar manualmente como ecd_migrator ANTES de desplegar el código que escribe esto (el manifiesto congelado
-- esquema_objetos.txt ya declara las dos restricciones ampliadas: sin esta migración el backend no arranca).
-- Aditiva: una tabla nueva y dos listas cerradas que se AMPLÍAN (ninguna fila de hoy deja de cumplirlas).
BEGIN;

CREATE TABLE IF NOT EXISTS doc_issue_nubes (
    id              BIGSERIAL PRIMARY KEY,
    issue_id        INTEGER NOT NULL REFERENCES doc_issues(id) ON DELETE CASCADE,
    markup_id       INTEGER REFERENCES pdf_markups(id) ON DELETE SET NULL,
    model_urn       TEXT NOT NULL,
    clase           TEXT NOT NULL DEFAULT 'observacion',
    padre_id        BIGINT REFERENCES doc_issue_nubes(id) ON DELETE SET NULL,
    empresa_equipo  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    destino_usuario INTEGER REFERENCES users(id) ON DELETE SET NULL,
    destino_empresa INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    pedido          TEXT,
    vence_en        DATE,
    estado          TEXT NOT NULL DEFAULT 'sin_asignar',
    ronda           INTEGER NOT NULL DEFAULT 0,
    rondas          JSONB NOT NULL DEFAULT '[]'::jsonb,
    verificacion    JSONB,
    history         JSONB NOT NULL DEFAULT '[]'::jsonb,
    creado_por      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_issue_nubes_clase CHECK (clase IN ('observacion','encargo')),
    CONSTRAINT ck_issue_nubes_estado CHECK (estado IN
        ('sin_asignar','pedida','entregada','devuelta','aceptada','levantada','no_levantada')),
    -- Una persona O una empresa: con las dos no se sabría a quién reclamarle (como doc_issues, 45).
    CONSTRAINT ck_issue_nubes_un_destino CHECK (destino_usuario IS NULL OR destino_empresa IS NULL),
    -- Un encargo cuelga, si cuelga, de una observación; una observación no cuelga de nada.
    CONSTRAINT ck_issue_nubes_padre CHECK (clase = 'encargo' OR padre_id IS NULL),
    CONSTRAINT uq_issue_nubes_marca UNIQUE (issue_id, markup_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_nubes_issue ON doc_issue_nubes(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_nubes_destino ON doc_issue_nubes(destino_usuario) WHERE destino_usuario IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_nubes_empresa ON doc_issue_nubes(destino_empresa) WHERE destino_empresa IS NOT NULL;

ALTER TABLE doc_issue_nubes OWNER TO ecd_migrator;
GRANT SELECT, INSERT, UPDATE ON doc_issue_nubes TO ecd_app;
GRANT USAGE, SELECT ON SEQUENCE doc_issue_nubes_id_seq TO ecd_app;

ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo
    CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL',
                           'PROTOCOLO','ISSUE','PARTE','ASIENTO','INSTRUCCION','AVANCE','NUBE'));

ALTER TABLE project_companies DROP CONSTRAINT IF EXISTS ck_project_companies_funcion;
ALTER TABLE project_companies ADD CONSTRAINT ck_project_companies_funcion
    CHECK (funcion IN ('ENTIDAD','SUPERVISION','CONTRATISTA','PROYECTISTA','OTRO','SUBCONTRATISTA'));

COMMIT;

-- Comprobación (como ecd_migrator, después):
--   SELECT count(*) FROM doc_issue_nubes;                                   -- 0
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_encargos_tipo';           -- con 'NUBE'
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_project_companies_funcion'; -- con 'SUBCONTRATISTA'
--   SELECT has_table_privilege('ecd_app', 'doc_issue_nubes', 'DELETE');     -- false
