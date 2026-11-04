-- 47 rollback. El rollback NORMAL de un despliegue es revertir el código, no esto (AGENTS.md §4.3).
-- Solo si hay que deshacer la migración: quita el disparador, la restricción, los índices y la columna, y devuelve a
-- la app el UPDATE de toda la tabla. Las filas que la 47 creó para nubes sin asignar se QUEDAN: son nubes «sin
-- asignar» válidas para el código de la 46 (que las encontraba igual por su marca).
BEGIN;
DROP TRIGGER IF EXISTS tg_issue_nubes_numero ON doc_issue_nubes;
DROP FUNCTION IF EXISTS fn_issue_nubes_numero();
ALTER TABLE doc_issue_nubes DROP CONSTRAINT IF EXISTS uq_issue_nubes_numero;
DROP INDEX IF EXISTS idx_issue_nubes_marca;
DROP INDEX IF EXISTS idx_issue_nubes_debidas;
ALTER TABLE doc_issue_nubes DROP COLUMN IF EXISTS numero;
GRANT UPDATE ON doc_issue_nubes TO ecd_app;
COMMIT;
