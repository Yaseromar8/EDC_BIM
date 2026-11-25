-- Vuelta atrás de 52_planilla_valorizaciones.sql. El rollback normal es revertir el código (AGENTS.md 4.3):
-- esto sólo se usa si la tabla no llegó a usarse. Se NIEGA si hay alguna valorización guardada.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'PLANILLA_VALORIZACIONES_ROLLBACK_ROLE_GUARD: va como ecd_migrator, no como %', current_user;
    END IF;
    IF to_regclass('public.planilla_valorizaciones') IS NOT NULL
       AND EXISTS (SELECT 1 FROM planilla_valorizaciones) THEN
        RAISE EXCEPTION 'planilla_valorizaciones tiene datos: no se borra. Revierte el código en su lugar.';
    END IF;
END $$;

DROP TABLE IF EXISTS planilla_valorizaciones;

COMMIT;
