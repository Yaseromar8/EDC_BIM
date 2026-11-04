-- 47 · Las nubes de una incidencia: número propio y estable, una fila por nube desde el alta, e índices
-- (4-nov-2026, docs/archivos/25 §4 fase 1).
--
-- Por qué. Hasta la 46 el número de una nube era su POSICIÓN, calculada en tres sitios (la hoja, el panel y el
-- cliente), y una nube sin asignar no tenía fila («virtual»). Resultado: la hoja decía «3» y el panel «2» a quien no
-- veía los encargos, y borrar una marca renumeraba las siguientes. Procore numera cada ítem con un número propio.
--
-- 1 · `doc_issue_nubes.numero`: el número de la nube DENTRO de su incidencia. Lo pone la BASE al insertar (disparador
--     `tg_issue_nubes_numero`: el siguiente libre de la incidencia, con la incidencia bloqueada para que dos altas a la
--     vez no se pisen) y no cambia nunca. UNIQUE (issue_id, numero).
-- 2 · Una fila por cada nube que la incidencia ya lleva (su evidencia y su marca de origen) y aún no la tenía: desde
--     ahora el código la crea al dar de alta la incidencia, y deja de haber nubes virtuales.
-- 3 · Los números de hoy se conservan: las filas se numeran en el orden que hoy enseña el panel (el sitio de la marca
--     en la evidencia y, después, por alta).
-- 4 · Índices: por marca (la hoja busca la nube de cada marca) y los estados que alguien debe (la conciliación de
--     «Mi trabajo»).
--
-- Aplicar manualmente como ecd_migrator ANTES de desplegar el backend que la usa. REPETIBLE: si entre esta migración
-- y el despliegue el backend anterior dio de alta incidencias, volver a aplicarla (paso 2) les crea sus filas.
-- Aditiva: una columna, una función, un disparador, una restricción y dos índices; no borra nada.
BEGIN;

ALTER TABLE doc_issue_nubes ADD COLUMN IF NOT EXISTS numero INTEGER;

-- 2 · Las nubes que aún no tienen fila: las marcas de tipo nube de la evidencia y la marca de origen.
WITH marcas AS (
    SELECT i.id AS issue_id, i.model_urn, (e.x ->> 'marca')::int AS marca, min(e.k) AS sitio
      FROM doc_issues i
     CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(i.evidencia) = 'array' THEN i.evidencia ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS e(x, k)
     WHERE e.x ->> 'tipo' = 'marca' AND (e.x ->> 'marca') ~ '^[0-9]{1,9}$'
     GROUP BY i.id, i.model_urn, (e.x ->> 'marca')::int
    UNION ALL
    SELECT i.id, i.model_urn, i.origen_id::int, 1000000000
      FROM doc_issues i
     WHERE i.origen_tipo = 'MARCA' AND i.origen_id ~ '^[0-9]{1,9}$'
)
INSERT INTO doc_issue_nubes (issue_id, markup_id, model_urn, clase)
SELECT x.issue_id, x.marca, x.model_urn, 'observacion'
  FROM (SELECT issue_id, model_urn, marca, min(sitio) AS sitio FROM marcas GROUP BY issue_id, model_urn, marca) x
  JOIN pdf_markups m ON m.id = x.marca AND m.kind = 'cloud'
 ORDER BY x.issue_id, x.sitio
ON CONFLICT (issue_id, markup_id) DO NOTHING;

-- 3 · Numerar lo que aún no tiene número, en el orden de hoy, después de lo ya numerado (si se repite).
WITH sitio AS (
    SELECT i.id AS issue_id, (e.x ->> 'marca')::int AS marca, min(e.k) AS k
      FROM doc_issues i
     CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(i.evidencia) = 'array' THEN i.evidencia ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS e(x, k)
     WHERE e.x ->> 'tipo' = 'marca' AND (e.x ->> 'marca') ~ '^[0-9]{1,9}$'
     GROUP BY i.id, (e.x ->> 'marca')::int
), base AS (
    SELECT issue_id, COALESCE(max(numero), 0) AS hasta FROM doc_issue_nubes GROUP BY issue_id
), orden AS (
    SELECT n.id, b.hasta + row_number() OVER (PARTITION BY n.issue_id
                                              ORDER BY s.k NULLS LAST, n.id) AS numero
      FROM doc_issue_nubes n
      JOIN base b ON b.issue_id = n.issue_id
      LEFT JOIN sitio s ON s.issue_id = n.issue_id AND s.marca = n.markup_id
     WHERE n.numero IS NULL
)
UPDATE doc_issue_nubes n SET numero = o.numero FROM orden o WHERE o.id = n.id;

-- 1 · La base pone el número al insertar. Bloquea la incidencia: dos altas a la vez en la misma esperan su turno.
CREATE OR REPLACE FUNCTION fn_issue_nubes_numero() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.numero IS NULL THEN
        PERFORM 1 FROM doc_issues WHERE id = NEW.issue_id FOR UPDATE;
        SELECT COALESCE(max(numero), 0) + 1 INTO NEW.numero FROM doc_issue_nubes WHERE issue_id = NEW.issue_id;
    END IF;
    RETURN NEW;
END $$;
ALTER FUNCTION fn_issue_nubes_numero() OWNER TO ecd_migrator;

DROP TRIGGER IF EXISTS tg_issue_nubes_numero ON doc_issue_nubes;
CREATE TRIGGER tg_issue_nubes_numero BEFORE INSERT ON doc_issue_nubes
    FOR EACH ROW EXECUTE FUNCTION fn_issue_nubes_numero();

-- El número no cambia: ni la app ni nadie lo reescribe (una fila nueva toma el siguiente).
ALTER TABLE doc_issue_nubes ALTER COLUMN numero SET NOT NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_issue_nubes_numero') THEN
        ALTER TABLE doc_issue_nubes ADD CONSTRAINT uq_issue_nubes_numero UNIQUE (issue_id, numero);
    END IF;
END $$;
REVOKE UPDATE (numero) ON doc_issue_nubes FROM ecd_app;
REVOKE UPDATE ON doc_issue_nubes FROM ecd_app;
GRANT UPDATE (destino_usuario, destino_empresa, pedido, vence_en, estado, ronda, rondas, verificacion, history,
              actualizado_en, markup_id, padre_id, empresa_equipo, clase) ON doc_issue_nubes TO ecd_app;

-- 4 · Índices.
CREATE INDEX IF NOT EXISTS idx_issue_nubes_marca ON doc_issue_nubes(markup_id) WHERE markup_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_nubes_debidas ON doc_issue_nubes(estado)
    WHERE estado IN ('pedida', 'devuelta', 'entregada');

COMMIT;

-- Comprobación (como ecd_migrator, después):
--   SELECT count(*) FROM doc_issue_nubes WHERE numero IS NULL;                                       -- 0
--   SELECT issue_id, numero, count(*) FROM doc_issue_nubes GROUP BY 1, 2 HAVING count(*) > 1;         -- ninguna
--   SELECT tgname FROM pg_trigger WHERE tgname = 'tg_issue_nubes_numero';                            -- 1 fila
--   SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_issue_nubes_marca', 'idx_issue_nubes_debidas'); -- 2
--   SELECT has_column_privilege('ecd_app', 'doc_issue_nubes', 'numero', 'UPDATE');                    -- false
