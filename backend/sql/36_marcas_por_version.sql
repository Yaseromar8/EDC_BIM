-- 36: cada marca de PDF pertenece a la VERSIÓN donde se dibujó.
--     Migración manual como ecd_migrator, ANTES de desplegar el backend que la usa.
--
-- POR QUÉ
-- -------
-- Hasta hoy una marca (medición, nube, foto, sello…) estaba atada al DOCUMENTO.
-- Al subir la V2 de un plano, las marcas de la V1 aparecían encima de la V2
-- aunque el dibujo hubiera cambiado: una observación sobre algo que ya no está
-- ahí. Lo profesional (ACC, Bluebeam, ISO 19650) es que la observación quede
-- sobre la revisión que se revisó. Decisión del propietario, 16-oct-2026.
--
-- QUÉ HACE Y QUÉ NO
-- -----------------
-- Aditiva: añade `file_version_id` (nula = marca anterior a esta migración) y
-- `llevada_de` (de qué marca es copia, si alguien la llevó a la vigente).
-- Las marcas que ya existen se asignan a la versión VIGENTE de su documento hoy,
-- que es sobre la que se ven ahora mismo: nadie nota el cambio al desplegar.
-- No borra ni reescribe nada más. Se puede repetir sin daño.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_user <> 'ecd_migrator' THEN
        RAISE EXCEPTION 'MARCAS_VERSION_ROLE_GUARD: el DDL va como ecd_migrator, no como %', current_user;
    END IF;
END $$;

ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS file_version_id UUID;
ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS llevada_de INTEGER;

UPDATE pdf_markups m
   SET file_version_id = n.current_version_id
  FROM file_nodes n
 WHERE n.id = m.file_node_id
   AND m.file_version_id IS NULL
   AND n.current_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pdf_markups_node_version ON pdf_markups(file_node_id, file_version_id);

COMMIT;
