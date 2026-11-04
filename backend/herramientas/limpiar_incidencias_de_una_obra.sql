-- LIMPIAR LAS INCIDENCIAS DE UNA OBRA (5-nov-2026): borra TODAS las incidencias de la obra, sus nubes, sus encargos
-- («Mi trabajo») y las marcas de los planos que eran nubes o evidencia de ellas. Para empezar de cero después de las
-- pruebas: el dueño, «ahora que tenemos ya pulido quisiera empezar de nuevo».
--
-- NO ES UNA MIGRACIÓN: no cambia el esquema, borra datos. Se ejecuta UNA vez, a mano, como ecd_migrator, y solo
-- cuando el dueño lo decide. No hay vuelta atrás salvo la copia de seguridad.
--
-- Qué NO toca:
--   · activity_log: el registro de lo que pasó se conserva entero (y ecd_app no puede borrarlo);
--   · las marcas de los planos que no eran de ninguna incidencia (las de otras personas siguen);
--   · los archivos subidos como evidencia (INCIDENCIAS/<código>/, MULTIMEDIA/): se quitan desde Archivos, con la
--     papelera, para que también se borren del almacenamiento.
-- La numeración vuelve a ISS-001 sola: el siguiente código es el MÁXIMO que existe + 1 (flujo_de_registro.py).
--
-- PASO 1 · MIRAR (solo lee): qué obras tienen incidencias, y cuántas.
--   SELECT project_id, model_urn, count(*) AS incidencias, min(codigo) AS desde, max(codigo) AS hasta
--     FROM doc_issues GROUP BY 1, 2 ORDER BY 1, 2;
--
-- PASO 2 · BORRAR: sustituir OBRA_AQUI por el project_id del paso 1, en la línea tras BEGIN (es el único sitio).
BEGIN;
CREATE TEMP TABLE zz_obra ON COMMIT DROP AS SELECT 'OBRA_AQUI'::text AS id;

CREATE TEMP TABLE zz_incidencias ON COMMIT DROP AS
    SELECT id, codigo, evidencia, origen_tipo, origen_id FROM doc_issues WHERE project_id = (SELECT id FROM zz_obra);

-- Las marcas de los planos que eran de esas incidencias: sus nubes, su evidencia y la de origen.
CREATE TEMP TABLE zz_marcas ON COMMIT DROP AS
    SELECT n.markup_id AS id FROM doc_issue_nubes n JOIN zz_incidencias i ON i.id = n.issue_id
     WHERE n.markup_id IS NOT NULL
    UNION
    SELECT (e->>'marca')::int FROM zz_incidencias i, jsonb_array_elements(i.evidencia) e
     WHERE jsonb_typeof(i.evidencia) = 'array' AND e->>'tipo' = 'marca' AND e->>'marca' ~ '^[0-9]+$'
    UNION
    SELECT origen_id::int FROM zz_incidencias WHERE origen_tipo = 'MARCA' AND origen_id ~ '^[0-9]+$';

-- Los encargos de «Mi trabajo» que venían de ellas o de sus nubes.
DELETE FROM encargos
 WHERE (objeto_tipo = 'ISSUE' AND objeto_id IN (SELECT id::text FROM zz_incidencias))
    OR (objeto_tipo = 'NUBE'  AND objeto_id IN (SELECT n.id::text FROM doc_issue_nubes n
                                                 JOIN zz_incidencias i ON i.id = n.issue_id));

-- Las incidencias. Sus nubes (doc_issue_nubes) se van con ellas: ON DELETE CASCADE.
DELETE FROM doc_issues WHERE id IN (SELECT id FROM zz_incidencias);

-- Las marcas que eran de ellas.
DELETE FROM pdf_markups WHERE id IN (SELECT id FROM zz_marcas);

SELECT (SELECT count(*) FROM zz_incidencias) AS incidencias_borradas,
       (SELECT count(*) FROM zz_marcas)      AS marcas_borradas,
       (SELECT count(*) FROM doc_issues WHERE project_id = (SELECT id FROM zz_obra)) AS quedan;

COMMIT;
