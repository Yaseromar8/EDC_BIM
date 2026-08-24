-- ============================================================================
-- CAPA 13 · PERMISSION PROFILES — configuración de acceso, reutilizable
-- ============================================================================
-- Se ejecuta como `ecd_migrator`. NO requiere `postgres`.
--
-- UN PERFIL SE APLICA; NO GOBIERNA. Al aplicarlo se escriben filas normales
-- de `member_tool_access` (capa 08) y ahí termina su papel: después manda esa
-- tabla, no el perfil. Así no existen dos sitios que respondan a la misma
-- pregunta — que es como una plantilla acaba compitiendo con la autoridad
-- real y cada pantalla resuelve el conflicto a su manera.
--
-- `project_users.perfil_aplicado` es PROCEDENCIA, no autoridad: explica de
-- dónde salió una configuración y permite ofrecer «re-aplicar». ON DELETE SET
-- NULL a propósito: borrar un perfil no puede cambiarle el acceso a nadie —
-- lo que tienen ya está escrito en la capa 08 y sigue vigente.
--
-- NO es una función contractual (capa 05): esa dice QUIÉN ES la empresa y en
-- qué calidad viene; un perfil es una preferencia repetible del
-- administrador. Dos personas de la misma función pueden llevar perfiles
-- distintos.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS perfiles_de_acceso (
    id           SERIAL PRIMARY KEY,
    nombre       TEXT NOT NULL,
    descripcion  TEXT,
    -- {codigo_de_herramienta: bool} — solo códigos del catálogo cerrado.
    herramientas JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creado_por   TEXT
);

COMMENT ON TABLE perfiles_de_acceso IS
  'CAPA 13 · PERMISSION PROFILES: configuración de acceso reutilizable, de la '
  'ENTIDAD. Se APLICA (escribe member_tool_access) y no gobierna: después manda '
  'la capa 08. NO es identidad contractual (capa 05) ni concede recursos '
  '(capa 09) ni autoridad de flujo (capa 10).';
COMMENT ON COLUMN perfiles_de_acceso.herramientas IS
  'Configuración que el perfil deja escrita al aplicarse: '
  '{"rfi": true, "redlines": false, ...} con códigos del catálogo cerrado.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_perfil_nombre
    ON perfiles_de_acceso (LOWER(nombre));

-- PROCEDENCIA en la fila de membresía, no una tabla nueva: el perfil que se
-- aplicó pertenece al par (persona, obra), que es exactamente project_users.
ALTER TABLE project_users
    ADD COLUMN IF NOT EXISTS perfil_aplicado INTEGER
        REFERENCES perfiles_de_acceso(id) ON DELETE SET NULL;

COMMENT ON COLUMN project_users.perfil_aplicado IS
  'PROCEDENCIA, no autoridad: qué perfil dejó esta configuración. Nadie decide '
  'un acceso leyendo esto — la autoridad es member_tool_access. Borrar el '
  'perfil lo pone a NULL y no cambia ni un acceso.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='project_users' AND column_name='perfil_aplicado') THEN
        RAISE EXCEPTION 'perfil_aplicado no existe tras el ALTER';
    END IF;
    RAISE NOTICE 'CAPA 13 lista: % perfiles declarados',
                 (SELECT count(*) FROM perfiles_de_acceso);
END $$;

COMMIT;
