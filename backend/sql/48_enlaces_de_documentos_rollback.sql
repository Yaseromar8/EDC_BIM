-- Rollback de 48. Rechaza el DROP si ya hay enlaces: no perder lo que la gente enlazó por revertir código.
-- El rollback normal de un despliegue es volver al código, no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM doc_enlaces LIMIT 1) THEN
    RAISE EXCEPTION 'Hay enlaces de documentos; no se pueden borrar con rollback automático';
  END IF;
END $$;
DROP TABLE IF EXISTS doc_enlaces;
