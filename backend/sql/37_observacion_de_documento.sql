-- 37: nuevo tipo de incidencia OBSERVACION («Observación de documento»).
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa.
--
-- POR QUÉ
-- -------
-- Una marca del lector (nube, flecha, foto, sello…) DIBUJA; no lleva el ciclo de
-- vida de una tarea. Cuando lo marcado hay que corregirlo, se crea desde la marca
-- una OBSERVACIÓN DE DOCUMENTO, que es una incidencia (`doc_issues`) con todo lo
-- que ya tiene: quien detecta, responsable miembro de la obra, verificador
-- designado, fecha límite, evidencia de la corrección, historial y «Mi trabajo».
-- Es lo que hacen ACC (Issue desde la marca) y Procore (Observation), y lo que
-- pide ISO 19650: quién pidió qué, a quién, para cuándo y cómo se cerró.
-- Decisión del propietario, 20-oct-2026 (docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md, opción A).
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Solo AMPLÍA la lista cerrada de tipos de `ck_issues_tipo`: quita la restricción
-- y la vuelve a poner con un valor más. Ninguna fila existente deja de cumplirla.
-- No toca datos. Se puede repetir sin daño.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'OBSERVACION_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

ALTER TABLE doc_issues DROP CONSTRAINT IF EXISTS ck_issues_tipo;
ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_tipo
    CHECK (tipo IN ('PUNCH','NO_CONFORMIDAD','CALIDAD','SEGURIDAD','OBSERVACION'));

-- Para encontrar en un paso la observación de una marca (origen_tipo='MARCA').
CREATE INDEX IF NOT EXISTS idx_issues_origen ON doc_issues(origen_tipo, origen_id);

COMMIT;
