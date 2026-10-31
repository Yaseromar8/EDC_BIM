-- Rollback de 44. Rechaza el DROP si algún tablero se cerró a sus invitados o tiene más miembros que su autor: quitar
-- la tabla lo dejaría abierto a toda la obra sin que nadie lo decidiera. El rollback normal de un despliegue es volver
-- al código (el código de antes no lee nada de esto), no esto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tableros WHERE acceso <> 'obra')
     OR EXISTS (SELECT 1 FROM tableros_miembros m JOIN tableros t ON t.id = m.tablero_id
                 WHERE m.user_id <> t.created_by_id OR m.rol <> 'responsable') THEN
    RAISE EXCEPTION 'Hay tableros con miembros o cerrados a sus invitados; no se pueden borrar con rollback automático';
  END IF;
END $$;
BEGIN;
DROP TABLE IF EXISTS tableros_miembros;
ALTER TABLE tableros DROP CONSTRAINT IF EXISTS tableros_acceso_valido;
ALTER TABLE tableros DROP COLUMN IF EXISTS acceso;
COMMIT;
