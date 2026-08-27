-- ═══════════════════════════════════════════════════════════════════════════
-- NG-02 · FOTO entra en la LISTA CERRADA de actos de campo
--
-- Ejecutar como  ecd_migrator  (DDL). NUNCA como ecd_app ni como postgres.
--
-- EL ERROR QUE ESTO CORRIGE, Y COMO SE ENCONTRO
-- ----------------------------------------------
-- `ck_sync_objeto` fija en la BASE la lista cerrada de tipos de acto -- a
-- proposito: que nadie invente familias de actos que ninguna revision vio.
-- NG-02 amplio la lista en el CODIGO (OBJETOS += FOTO) y olvido ampliarla
-- aqui. Resultado, cazado por la EXP offline de foto: el manejador aplicaba,
-- `anotar` violaba el check, la transaccion entera se revertia y el movil
-- recibia REINTENTABLE -- degradacion correcta, avance imposible.
--
-- Es la MISMA clase de defecto que F2 (doc 93): codigo y migracion divergen y
-- ninguna prueba los casa. El tripwire nuevo (test_ng02_fotos) casa OBJETOS
-- con esta lista, en la 21 y en esta.
--
-- La restriccion se REEMPLAZA con la lista nueva -- sigue siendo cerrada; no
-- se quita el control, se actualiza la lista que controla.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE sync_operaciones DROP CONSTRAINT IF EXISTS ck_sync_objeto;
ALTER TABLE sync_operaciones ADD CONSTRAINT ck_sync_objeto
    CHECK (object_type IN ('PROTOCOLO','ISSUE','FOTO'));

COMMIT;
