-- Rollback de la 36. NO es el camino normal: el rollback de un despliegue es revertir el código
-- (el backend anterior ignora estas columnas). Solo si hay que quitarlas de verdad.
-- Al quitarlas se pierde a qué versión pertenecía cada marca y de cuál era copia.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS idx_pdf_markups_node_version;
ALTER TABLE pdf_markups DROP COLUMN IF EXISTS llevada_de;
ALTER TABLE pdf_markups DROP COLUMN IF EXISTS file_version_id;
COMMIT;
