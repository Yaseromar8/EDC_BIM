-- ============================================================================
-- CAPA 16 · TOOL ACTIVATION — qué herramientas existen en cada obra
-- ============================================================================
-- Se ejecuta como `ecd_migrator` (dueño del esquema). NO requiere `postgres`.
--
-- QUÉ ES: la disponibilidad de una herramienta EN LA OBRA. No es permiso de
-- una persona (capa 08), ni acceso a un recurso (capa 09), ni autoridad para
-- un acto contractual (capa 10). Apagada, la herramienta no existe para nadie
-- de esa obra — tampoco para el Entity Admin, que la enciende si la necesita.
--
-- LA SIEMBRA: se escriben filas EXPLÍCITAS para todas las obras que ya
-- existen, con TRUE. Sin ellas el estado de una obra viva sería implícito
-- («lo que diga el catálogo»), y una capa de configuración cuyo estado no se
-- puede leer en la base no es auditable. A partir de aquí, cada obra nueva
-- siembra las suyas al crearse.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS project_tools (
    project_id   TEXT    NOT NULL,
    herramienta  TEXT    NOT NULL,
    activa       BOOLEAN NOT NULL DEFAULT TRUE,
    cambiado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cambiado_por TEXT,
    PRIMARY KEY (project_id, herramienta)
);

COMMENT ON TABLE project_tools IS
  'CAPA 16 · TOOL ACTIVATION: disponibilidad de cada herramienta EN UNA OBRA. '
  'Ausencia de fila = el valor por defecto del catálogo '
  '(backend/herramientas_de_obra.py). Apagada = nadie de la obra la usa, '
  'incluido el Entity Admin.';
COMMENT ON COLUMN project_tools.herramienta IS
  'Código del catálogo CERRADO: rfi · redlines · reviews · transmittals · '
  'plan_entregas · conjuntos · fotos · visor. Documentos NO se apaga: es el '
  'substrato del producto (diferencia deliberada con ACC).';

CREATE INDEX IF NOT EXISTS idx_project_tools_obra ON project_tools (project_id);

-- ── SIEMBRA para las obras que YA existen ──────────────────────────────────
INSERT INTO project_tools (project_id, herramienta, activa, cambiado_por)
SELECT p.id, h.codigo, TRUE, 'migración capa 16'
  FROM projects p
 CROSS JOIN (VALUES ('rfi'), ('redlines'), ('reviews'), ('transmittals'),
                    ('plan_entregas'), ('conjuntos'), ('fotos'), ('visor')
            ) AS h(codigo)
ON CONFLICT (project_id, herramienta) DO NOTHING;

-- ── POSTCONDICIONES ───────────────────────────────────────────────────────
DO $$
DECLARE
    obras int;
    filas int;
    esperadas int;
BEGIN
    SELECT count(*) INTO obras FROM projects;
    SELECT count(*) INTO filas FROM project_tools;
    esperadas := obras * 8;
    IF filas < esperadas THEN
        RAISE EXCEPTION 'siembra incompleta: % filas para % obras (esperadas %)',
                        filas, obras, esperadas;
    END IF;
    RAISE NOTICE 'CAPA 16 sembrada: % obras x 8 herramientas = % filas', obras, filas;
END $$;

SELECT p.name,
       count(*) FILTER (WHERE t.activa) AS encendidas,
       count(*) FILTER (WHERE NOT t.activa) AS apagadas
  FROM projects p
  JOIN project_tools t ON t.project_id = p.id
 GROUP BY p.name ORDER BY p.name;

COMMIT;
