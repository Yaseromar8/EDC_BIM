-- 42: el itemizado y los criterios de medida de la Planilla pasan a ser POR FRENTE.
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa. Si el backend
--     llega antes, sigue funcionando como hoy (uno por obra) y solo rechaza guardar en un frente
--     con 503 MIGRATION_MISSING: no pisa el itemizado de la obra.
--
-- POR QUÉ
-- -------
-- El dueño (30-oct-2026): «tengo dos frentes, canal y drenaje urbano, y subiré en cada uno lo
-- que le corresponde». Cada frente tiene su presupuesto (Componente 4 · Canal, Componente 11.2 ·
-- Drenaje urbano). Con una sola versión vigente por obra (40, 41), subir el del Canal reemplazaba
-- también el del Drenaje. docs/visor/51.
--
-- QUÉ CAMBIA
-- ----------
-- - Columna `frente` en las dos tablas: '' = la obra entera (lo que había), 'CANAL' = ese frente
--   (el `front_id` de project_frentes; el visor lo manda como '<obra>_<FRENTE>').
-- - «Una vigente» pasa de por obra a por obra Y frente.
-- - Las filas que ya existen quedan con frente '' (de la obra): no se reasignan a ningún frente.
--   Un frente sin itemizado propio sigue usando el de la obra hasta que suba el suyo.
-- - El número de versión sigue siendo único por obra (UNIQUE (project_id, version) no cambia).
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Aditiva: dos columnas con DEFAULT (sin reescribir la tabla) y dos índices nuevos en lugar de
-- los anteriores. No toca ni borra datos. Se puede repetir sin daño.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_POR_FRENTE_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

ALTER TABLE planilla_itemizados ADD COLUMN IF NOT EXISTS frente TEXT NOT NULL DEFAULT '';
ALTER TABLE planilla_criterios_medida ADD COLUMN IF NOT EXISTS frente TEXT NOT NULL DEFAULT '';

-- Primero el índice nuevo y después se quita el viejo: en ningún momento hay dos vigentes posibles.
CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_itemizado_vigente_frente
    ON planilla_itemizados (project_id, frente) WHERE vigente;
DROP INDEX IF EXISTS uq_planilla_itemizado_vigente;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planilla_criterios_medida_vigente_frente
    ON planilla_criterios_medida (project_id, frente) WHERE vigente;
DROP INDEX IF EXISTS uq_planilla_criterios_medida_vigente;

COMMIT;
