-- VUELTA (rollback): retirar los permisos concedidos a ecd_app
-- Generado el 12-ago-2026. Inverso exacto de 03_grants_ida.sql.
--
-- CUANDO SE USA
-- Solo si hay que deshacer la separacion. NO borra los roles: revocar y dejar el
-- rol existiendo es reversible; DROP ROLE falla si el rol posee algo o tiene
-- permisos en otra base, y ese fallo llega en el peor momento.
--
-- ORDEN CORRECTO DE UN ROLLBACK COMPLETO
--   1) devolver el servicio a la identidad anterior (variable de entorno)
--   2) este guion
--   3) 02_ownership_vuelta.sql
--   4) solo al final, si se quiere: DROP ROLE ecd_app; DROP ROLE ecd_migrator;
--
-- Idempotente: revocar algo no concedido no falla.

BEGIN;

-- Privilegios por defecto sobre objetos FUTUROS. Se retiran PRIMERO: si se
-- dejaran puestos, cualquier objeto nuevo volveria a conceder permisos a un rol
-- que se pretende retirar.
ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public, ai_brain
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ecd_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public, ai_brain
      REVOKE USAGE, SELECT ON SEQUENCES FROM ecd_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public, ai_brain
      REVOKE EXECUTE ON FUNCTIONS FROM ecd_app;

REVOKE EXECUTE ON FUNCTION resolve_folder_path(text, varchar, varchar, boolean) FROM ecd_app;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, ai_brain FROM ecd_app;
REVOKE ALL ON ALL TABLES    IN SCHEMA public, ai_brain FROM ecd_app;
REVOKE USAGE ON SCHEMA public, ai_brain FROM ecd_app;

COMMIT;

-- COMPROBACION POSTERIOR (debe devolver 0):
--   SELECT count(*) FROM information_schema.table_privileges WHERE grantee='ecd_app';
