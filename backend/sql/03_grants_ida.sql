-- IDA: permisos de ecd_app. Se ejecuta como ecd_migrator, DESPUES del bootstrap.
-- Generado el 12-ago-2026. Su inverso exacto es 04_grants_vuelta.sql.
--
-- ATENCION AL EJECUTARLO: usar -v ON_ERROR_STOP=1 y LEER LA SALIDA ENTERA. En la
-- prueba local, un GRANT con la firma de funcion equivocada aborto el script y el
-- REVOKE de auditoria no llego a aplicarse: el resultado parecia correcto y la
-- auditoria habia quedado desprotegida.

BEGIN;

-- Despues de bootstrap_esquema.py, con el esquema ya construido.

-- USAGE deja VER el schema. CREATE seria poder crear objetos en el: no se concede.
REVOKE CREATE ON SCHEMA public, ai_brain FROM PUBLIC;
REVOKE CREATE ON SCHEMA public, ai_brain FROM ecd_app;
GRANT USAGE ON SCHEMA public, ai_brain TO ecd_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public, ai_brain TO ecd_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public, ai_brain TO ecd_app;

-- Sin este EXECUTE no se pueden crear carpetas: la resolucion de rutas del arbol
-- documental vive en esta funcion PL/pgSQL.
GRANT EXECUTE ON FUNCTION resolve_folder_path(text, varchar, varchar, boolean) TO ecd_app;

-- ── AUDITORIA ────────────────────────────────────────────────────────────────
-- La identidad de aplicacion solo puede LEER y ANADIR. Se comprobo que el codigo
-- unicamente inserta en estas dos tablas, y que no existen funciones SECURITY
-- DEFINER, ni triggers, ni claves foraneas en cascada que lleguen hasta ellas: no
-- hay camino indirecto.
--
-- OJO CON LO QUE ESTO SIGNIFICA Y LO QUE NO. Esto permite afirmar UNA cosa:
-- "la identidad de aplicacion no puede modificar ni borrar eventos historicos".
-- NO convierte la auditoria en inmutable: ecd_migrator sigue siendo dueno de las
-- tablas y el superusuario sigue existiendo. La inmutabilidad de verdad necesita
-- separacion de funciones, almacenamiento append-only y evidencia fuera del
-- alcance de quien administra. Ese hallazgo sigue abierto.
REVOKE UPDATE, DELETE, TRUNCATE ON activity_log, auth_events FROM ecd_app;

-- ── Objetos FUTUROS que cree el migrador ─────────────────────────────────────
-- Sin esto, la primera tabla que anada una migracion nueva seria invisible para
-- la aplicacion y el fallo aparecería en produccion, no aqui.
ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public, ai_brain
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecd_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public, ai_brain
      GRANT USAGE, SELECT ON SEQUENCES TO ecd_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ecd_migrator IN SCHEMA public, ai_brain
      GRANT EXECUTE ON FUNCTIONS TO ecd_app;

COMMIT;
