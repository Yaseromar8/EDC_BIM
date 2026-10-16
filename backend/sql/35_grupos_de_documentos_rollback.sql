-- Rollback de 35. Rechaza el DROP si ya hay grupos: no perder lo que la gente armó por revertir código.
-- El rollback normal de un despliegue es volver al código, no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM grupos_de_documentos LIMIT 1) THEN
    RAISE EXCEPTION 'Hay grupos de documentos; no se pueden borrar con rollback automático';
  END IF;
END $$;
DROP TABLE IF EXISTS grupo_documentos;
DROP TABLE IF EXISTS grupos_de_documentos;
