-- Rollback de la 39. NO es el camino normal: el rollback de un despliegue es revertir el código.
-- OJO: el backend que usa esta tabla NO arranca sin ella; revierte primero el código.
-- Solo guarda trabajos en curso de Design Automation: al quitarla se pierden los que estén a medias.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS da_trabajos;
COMMIT;
