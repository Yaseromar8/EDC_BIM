-- ============================================================================
-- CAPA 08 · MEMBER TOOL ACCESS — quién entra a una herramienta habilitada
-- ============================================================================
-- Se ejecuta como `ecd_migrator`. NO requiere `postgres`.
--
-- La fila es la EXCEPCIÓN, no el permiso. La puerta fail-closed es la
-- MEMBRESÍA (capa 03), comprobada antes; esta capa RESTRINGE dentro de una
-- pertenencia ya concedida, así que su acto explícito es QUITAR. Sin filas,
-- un miembro alcanza las herramientas activas de su obra — que es el
-- comportamiento de hoy, y desplegar una capa nueva no puede ser un apagón.
--
-- NO se siembra nada a propósito: sembrar 'permitido=TRUE' para todos sería
-- ruido (miles de filas que dicen lo mismo que el defecto) y haría ilegible
-- lo que de verdad importa: las restricciones, que aquí se ven de un vistazo.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS member_tool_access (
    project_id   TEXT    NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    herramienta  TEXT    NOT NULL,
    permitido    BOOLEAN NOT NULL DEFAULT TRUE,
    cambiado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cambiado_por TEXT,
    PRIMARY KEY (project_id, user_id, herramienta)
);

COMMENT ON TABLE member_tool_access IS
  'CAPA 08 · MEMBER TOOL ACCESS: si ESTE miembro entra a ESTA herramienta en '
  'ESTA obra. La fila es la EXCEPCIÓN: ausencia = permitido, porque la puerta '
  'fail-closed es la membresía (capa 03), ya comprobada antes. No sustituye a '
  'TOOL ACTIVATION (capa 16: si está apagada no entra nadie) ni concede un '
  'solo recurso (capa 09 decide eso).';
COMMENT ON COLUMN member_tool_access.permitido IS
  'FALSE = retirada explícita. Se lee en la base; nunca se supone.';

CREATE INDEX IF NOT EXISTS idx_mta_obra_usuario
    ON member_tool_access (project_id, user_id);

-- La clave ajena a users con ON DELETE CASCADE: si una identidad se PURGA
-- (acto humano excepcional), sus excepciones se van con ella — no quedan
-- filas apuntando a nadie. Retirar la MEMBRESÍA no las toca: son cosas
-- distintas y la capa 03 ya lo demostró con caso real.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'member_tool_access') THEN
        RAISE EXCEPTION 'member_tool_access no existe tras el CREATE';
    END IF;
    RAISE NOTICE 'CAPA 08 lista: % restricciones declaradas',
                 (SELECT count(*) FROM member_tool_access);
END $$;

COMMIT;
