-- Rollback de 33. Rechaza el DROP si ya existen revisiones: nunca perderlas
-- por revertir código. El rollback operativo habitual es volver al código.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cad_review_marks LIMIT 1) THEN
    RAISE EXCEPTION 'Hay marcas CAD; no se pueden borrar con rollback automático';
  END IF;
END $$;
DROP TABLE IF EXISTS cad_review_attachments;
DROP TABLE IF EXISTS cad_review_marks;
