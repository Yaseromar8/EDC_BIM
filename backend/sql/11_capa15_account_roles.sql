-- ============================================================================
-- CAPA 15 · ACCOUNT ROLES — delegación acotada al nivel de la entidad
-- ============================================================================
-- Se ejecuta como `ecd_migrator`. NO requiere `postgres`.
--
-- EL PROBLEMA que cierra: solo existían `user` y Entity Admin. Quien tenía
-- que dar de alta gente acababa siendo custodio de la instancia entera — y el
-- PASO 14 existió porque eso se había ido de las manos.
--
-- LA FILA ES LA CONCESIÓN. Aquí NO hay defecto permisivo: esto es
-- AUTORIZACIÓN, no disponibilidad. Sin fila no hay facultad, y si la consulta
-- falla tampoco (fail-closed en el módulo). Es la diferencia con las capas 16
-- y 08, que deciden si algo está disponible y se abren ante un fallo de
-- infraestructura para no dejar una obra inservible.
--
-- El Entity Admin NO tiene filas: las tiene todas por definición. Depender de
-- filas permitiría dejar la entidad sin quien la administre borrando
-- registros.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS roles_de_entidad (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facultad      TEXT    NOT NULL,
    concedida_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concedida_por TEXT,
    PRIMARY KEY (user_id, facultad),
    CONSTRAINT ck_facultad_conocida CHECK (facultad IN (
        'gestionar_usuarios', 'gestionar_obras',
        'gestionar_empresas', 'gestionar_perfiles'))
);

COMMENT ON TABLE roles_de_entidad IS
  'CAPA 15 · ACCOUNT ROLES: facultades acotadas al nivel de la ENTIDAD. La '
  'fila ES la concesión (fail-closed: sin fila no hay facultad). NO es '
  'PROJECT ADMIN (no administra ninguna obra), NO es MEMBER TOOL ACCESS (no '
  'abre ninguna herramienta) y NO es RESOURCE PERMISSION (no concede ni un '
  'documento). El Entity Admin no aparece aquí: las tiene todas por '
  'definición, para que borrar filas no pueda dejar la entidad sin custodio.';

CREATE INDEX IF NOT EXISTS idx_roles_entidad_usuario
    ON roles_de_entidad (user_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'roles_de_entidad') THEN
        RAISE EXCEPTION 'roles_de_entidad no existe tras el CREATE';
    END IF;
    RAISE NOTICE 'CAPA 15 lista: % delegaciones declaradas',
                 (SELECT count(*) FROM roles_de_entidad);
END $$;

COMMIT;
