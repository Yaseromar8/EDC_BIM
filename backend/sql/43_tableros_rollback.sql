-- Rollback de 43. Rechaza el DROP si ya hay tableros: no perder lo que la gente armó por revertir código.
-- El rollback normal de un despliegue es volver al código, no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tableros LIMIT 1) THEN
    RAISE EXCEPTION 'Hay tableros; no se pueden borrar con rollback automático';
  END IF;
END $$;
DROP TABLE IF EXISTS tableros_abiertos;
DROP TABLE IF EXISTS tableros;
