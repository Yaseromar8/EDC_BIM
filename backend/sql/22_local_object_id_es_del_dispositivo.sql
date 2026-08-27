-- ═══════════════════════════════════════════════════════════════════════════
-- GAP 07 · `local_object_id` NO es un UUID: es la identidad QUE PONE EL
-- DISPOSITIVO, y el dispositivo la escribe con prefijo — `loc_<uuid>`.
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- EL ERROR QUE ESTO CORRIGE, Y COMO SE ENCONTRO
-- ----------------------------------------------
-- La migracion 21 tipo la columna como UUID. El cliente --por diseño, doc 90--
-- genera `loc_` + uuid: el prefijo distingue a simple vista una identidad
-- LOCAL (que todavia no existe en el servidor) de un id canonico. Resultado:
-- todo INSERT en `sync_operaciones` moria con «invalid input syntax for type
-- uuid», el catch generico respondia REINTENTABLE, y NINGUN acto de campo
-- podia entrar jamas.
--
-- Lo cazo la EXP real de NG-01 --seis escenarios REINTENTABLE uniformes con la
-- ruta de evidencia pasando-- y lo confirmo la reproduccion contra esta base
-- con el codigo del backend en una transaccion revertida. Ninguna de las 1438
-- pruebas lo vio: comprueban el TEXTO de la migracion y el del cliente por
-- separado, y nadie casaba los dos. El tripwire nuevo
-- (test_gap07_sincronizacion) los casa.
--
-- `operation_id` y `depende_de` SI son UUID y se quedan como estan: esos los
-- genera crypto.randomUUID() sin prefijo.
--
-- ALTER de ENSANCHAMIENTO (uuid → text): no pierde ni reescribe nada. La
-- tabla esta vacia en produccion --el error impedia precisamente llenarla--
-- pero el USING es correcto tambien con filas.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE sync_operaciones
    ALTER COLUMN local_object_id TYPE TEXT
    USING local_object_id::text;

COMMIT;
