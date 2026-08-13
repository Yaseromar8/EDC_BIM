-- CREACION DE LOS DOS ROLES DEL ECD
-- =================================
-- Escrito el 13-ago-2026, al comprobar que NINGUN guion del repositorio creaba
-- los roles. Los guiones 01..04 daban por hecho que ecd_app y ecd_migrator ya
-- existian, asi que el procedimiento completo no se podia ejecutar de principio
-- a fin: fallaba en el primer ALTER ... OWNER TO con "role does not exist".
--
-- POR QUE DOS ROLES
-- -----------------
--   ecd_app       lo que usa la aplicacion en marcha. Lee y escribe DATOS.
--                 NO puede crear ni alterar tablas, ni modificar el registro
--                 de auditoria. Si alguien compromete la aplicacion, no puede
--                 reescribir el esquema ni el pasado.
--   ecd_migrator  dueno de los objetos. Solo se usa para construir o migrar el
--                 esquema, a mano y a proposito. No lo usa ningun proceso
--                 permanente.
--
-- LAS CONTRASENAS NO ESTAN AQUI, Y NO VAN A ESTAR
-- -----------------------------------------------
-- Este fichero esta versionado en un repositorio publico. Una contrasena escrita
-- aqui nace comprometida -- que es exactamente el hallazgo 0.1 de la auditoria,
-- y ya costo una rotacion de emergencia.
--
-- Se pasan como variables de psql, que NO quedan en el fichero ni en el
-- historial de git:
--
--   psql "$CONEXION" -v app_pw="$(read -s -p 'app: ' p; echo $p)" \
--                    -v mig_pw="$(read -s -p 'mig: ' p; echo $p)" \
--                    -f 00_roles.sql
--
-- En Windows/PowerShell, o si se prefiere pegarlas, usar \prompt (abajo).
-- Cuidado con el historial del shell: en bash, un espacio delante del comando
-- evita que se guarde si HISTCONTROL=ignorespace.
--
-- CLOUD SQL EXIGE SIMBOLOS
-- ------------------------
-- La instancia tiene politica de contrasenas por SQL: un CREATE ROLE con una
-- contrasena sin simbolo es RECHAZADO por el servidor. Se comprobo en el
-- canario del 13-ago-2026. Que sean largas y con simbolos.

\set ON_ERROR_STOP on

-- Si no llegaron por -v, se piden por teclado sin que se vean escritas.
\if :{?app_pw}
\else
\prompt 'Contrasena para ecd_app: ' app_pw
\endif
\if :{?mig_pw}
\else
\prompt 'Contrasena para ecd_migrator: ' mig_pw
\endif

BEGIN;

-- Idempotente: si el rol ya existe se le cambia la contrasena, no se falla. El
-- guion tiene que poder repetirse sin miedo, porque se ejecuta con prisa.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_app') THEN
        RAISE NOTICE 'ecd_app ya existe: se actualiza la contrasena';
    ELSE
        CREATE ROLE ecd_app LOGIN;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecd_migrator') THEN
        RAISE NOTICE 'ecd_migrator ya existe: se actualiza la contrasena';
    ELSE
        CREATE ROLE ecd_migrator LOGIN;
    END IF;
END $$;

ALTER ROLE ecd_app       WITH PASSWORD :'app_pw';
ALTER ROLE ecd_migrator  WITH PASSWORD :'mig_pw';

-- Ninguno de los dos necesita crear bases ni roles, ni saltarse las politicas
-- de fila. Decirlo explicitamente evita heredar privilegios por descuido.
ALTER ROLE ecd_app       NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE ecd_migrator  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Quien ejecuta la migracion tiene que ser miembro del rol al que va a ceder
-- los objetos: obligatorio desde PostgreSQL 16, y en Cloud SQL 'postgres' no es
-- superusuario, asi que no se lo salta.
GRANT ecd_migrator TO CURRENT_USER WITH SET TRUE;
GRANT ecd_app      TO CURRENT_USER WITH SET TRUE;

-- Poder conectarse a la base. Sin esto, los roles existen y no sirven.
GRANT CONNECT ON DATABASE :"DBNAME" TO ecd_app, ecd_migrator;

COMMIT;

-- Comprobacion, para no irse sin mirar.
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
  FROM pg_roles WHERE rolname IN ('ecd_app', 'ecd_migrator') ORDER BY rolname;
