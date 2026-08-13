-- ============================================================================
--  Separacion de identidades del ECD.  Hallazgo 0.1.
--  NO EJECUTAR CONTRA PRODUCCION sin haber leido el plan de transicion.
-- ============================================================================
--
--  POR QUE
--  -------
--  Hasta ahora una sola identidad hacia todo: servir peticiones, migrar el
--  esquema y administrar. Ademas era propietaria de las 87 tablas, incluidas las
--  dos de auditoria, de modo que la misma credencial que atiende una peticion web
--  podia reescribir el registro de quien hizo que. Eso no se sostiene delante de
--  nadie que audite.
--
--  TRES IDENTIDADES
--    ecd_migrator  construye el esquema. Dueno de los objetos. No la usa la app.
--    ecd_app       atiende peticiones. Solo DATOS. Sin DDL, sin propiedad.
--    postgres      break-glass. Fuera de la aplicacion y fuera del repositorio.
--
--  ORDEN DE EJECUCION
--    1) como superusuario   : bloque [INFRA]
--    2) como ecd_migrator   : python bootstrap_esquema.py
--    3) como ecd_migrator   : bloque [GRANTS]
--
--  Sobre pgcrypto: es infraestructura de la base, no una necesidad de runtime del
--  ECD. Lo instala el superusuario una vez; sus 37 funciones NO se transfieren,
--  porque pertenecen a la extension y moverlas rompe su vinculo con ella. Esa es
--  la razon por la que aqui no se usa REASSIGN OWNED, que se las llevaria todas.
-- ============================================================================


-- ─────────────────────────────────────────────────── [INFRA] superusuario ────
-- Solo la primera vez, sobre la base destino.

-- CREATE EXTENSION exige superusuario: por eso no puede estar en el arranque de
-- la aplicacion si la aplicacion no ha de ser superusuario.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Desde PostgreSQL 15 el schema public ya no concede CREATE a todo el mundo.
-- El migrador necesita poder crear en el; se resuelve haciendolo dueno del schema.
ALTER SCHEMA public OWNER TO ecd_migrator;

-- Nadie mas crea nada en public por defecto.
REVOKE ALL ON SCHEMA public FROM PUBLIC;


-- ────────────────────────────────────────────────── [GRANTS] ecd_migrator ────
-- Despues de bootstrap_esquema.py, con el esquema ya construido.

-- USAGE deja VER el schema. CREATE seria poder crear objetos en el: no se concede.
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
