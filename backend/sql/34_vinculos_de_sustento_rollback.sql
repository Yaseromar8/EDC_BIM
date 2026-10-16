-- Rollback de 34. Rechaza el DROP si ya hay vínculos: nunca perder el sustento de un metrado
-- por revertir código. El rollback normal de un despliegue es volver al código, no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vinculos_de_sustento LIMIT 1) THEN
    RAISE EXCEPTION 'Hay vínculos de sustento; no se pueden borrar con rollback automático';
  END IF;
END $$;
DROP TABLE IF EXISTS vinculos_de_sustento;
