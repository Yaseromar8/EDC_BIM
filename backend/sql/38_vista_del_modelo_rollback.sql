-- Rollback de la 38. NO es el camino normal: el rollback de un despliegue es revertir el código.
-- OJO: el backend que usa esta columna NO arranca sin ella; revierte primero el código.
-- Al quitarla se pierde qué vista eligió cada modelo por nombre (queda el GUID).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS inventory_vista_extraida;
ALTER TABLE model_config DROP COLUMN IF EXISTS default_view_name;
COMMIT;
