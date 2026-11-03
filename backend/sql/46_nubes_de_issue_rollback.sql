-- 46 rollback. El rollback NORMAL de un despliegue es revertir el código, no esto (AGENTS.md §4.3).
-- Solo si hay que deshacer la migración: devuelve las dos listas cerradas y quita la tabla.
-- NO se puede volver atrás si ya hay encargos 'NUBE' o empresas 'SUBCONTRATISTA': la restricción fallaría (a
-- propósito: primero hay que decidir qué hacer con esas filas).
BEGIN;
ALTER TABLE encargos DROP CONSTRAINT IF EXISTS ck_encargos_tipo;
ALTER TABLE encargos ADD CONSTRAINT ck_encargos_tipo
    CHECK (objeto_tipo IN ('REVIEW','RFI','REDLINE','TRANSMITTAL','SUBMITTAL',
                           'PROTOCOLO','ISSUE','PARTE','ASIENTO','INSTRUCCION','AVANCE'));
ALTER TABLE project_companies DROP CONSTRAINT IF EXISTS ck_project_companies_funcion;
ALTER TABLE project_companies ADD CONSTRAINT ck_project_companies_funcion
    CHECK (funcion IN ('ENTIDAD','SUPERVISION','CONTRATISTA','PROYECTISTA','OTRO'));
DROP TABLE IF EXISTS doc_issue_nubes;
COMMIT;
