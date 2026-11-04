-- Rollback de 49. Rechaza el DROP si ya hay vistas fijadas: no perder lo que la gente fijó por revertir código.
-- El rollback normal de un despliegue es volver al código, no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM doc_vistas_de_apertura LIMIT 1) THEN
    RAISE EXCEPTION 'Hay vistas de apertura fijadas; no se pueden borrar con rollback automático';
  END IF;
END $$;
DROP TABLE IF EXISTS doc_vistas_de_apertura;
