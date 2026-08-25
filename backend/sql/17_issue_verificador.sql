-- ═══════════════════════════════════════════════════════════════════════════
-- ISSUE CORE · EL VERIFICADOR ES UNA IDENTIDAD PROPIA
--
-- Ejecutar como  ecd_migrator  (DDL).
--
-- QUE CORRIGE, Y POR QUE NO ERA COSMETICO
-- ----------------------------------------
-- La primera version de `doc_issues` tenia DOS identidades y media:
--
--     autor_id        quien DETECTA
--     responsable_id  quien CORRIGE
--     verificado_por  quien verifico  <- un REGISTRO, no un PAPEL
--
-- Sin un verificador DESIGNADO, el manejador tenia que elegir a alguien, y
-- eligio al detector: la pelota de `Corregido` iba a `autor_id` y
-- `puede_verificar` le daba autoridad de cierre. Eso convertia a quien
-- ENCUENTRA el defecto en quien AUTORIZA su cierre, por inferencia y sin que
-- nadie lo hubiera decidido.
--
-- En una no conformidad de protocolo las dos personas SI coinciden --el
-- inspector que la detecto es quien comprueba que se levanto-- y por eso el
-- error pasaba desapercibido. En un PUNCH de recepcion no coinciden: registra
-- el que recorre la obra, corrige el contratista, y aprueba el cierre la
-- SUPERVISION. Con tres papeles y solo dos columnas, el tercero se inventaba.
--
--     DETECTOR  ≠  RESPONSABLE DE CORREGIR  ≠  VERIFICADOR / FINAL APPROVER
--
-- `verificado_por` SE CONSERVA y no cambia de significado: es el HECHO de
-- quien firmo la verificacion. `verificador_id` es el PAPEL: a quien le toca.
-- Normalmente coinciden; cuando no, el hecho manda sobre la designacion y las
-- dos cosas quedan registradas.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE doc_issues ADD COLUMN IF NOT EXISTS verificador_id INTEGER;

DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT fk_issues_verificador_designado
        FOREIGN KEY (verificador_id) REFERENCES users(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LA SEPARACION, AHORA TAMBIEN EN LA DESIGNACION Y NO SOLO EN EL HECHO.
-- Antes solo se comprobaba al verificar (`verificado_por <> responsable_id`),
-- asi que un issue podia NACER con la misma persona en los dos papeles y el
-- choque no aparecia hasta el final -- cuando ya no hay a quien reasignar sin
-- tocar el registro.
DO $$ BEGIN
    ALTER TABLE doc_issues ADD CONSTRAINT ck_issues_verificador_designado_distinto
        CHECK (verificador_id IS NULL
               OR responsable_id IS NULL
               OR verificador_id <> responsable_id
               OR autoverificacion);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_issues_verificador
    ON doc_issues(verificador_id) WHERE estado IN ('Corregido','Abierto','Reabierto');

-- ── LOS ISSUES QUE YA EXISTEN ──────────────────────────────────────────────
--
-- Los seis de la obra piloto vinieron de la reclasificacion de Red Lines de QA
-- y son NO_CONFORMIDAD de protocolo: para ese tipo la regla explicita es que
-- verifica el inspector que la detecto. Se les fija el verificador CON ESE
-- CRITERIO ESCRITO, no dejandolo a la inferencia del manejador -- que es
-- justamente lo que esta migracion viene a eliminar.
--
-- Y solo cuando NO choca con el responsable: si coincidieran, se deja nulo y lo
-- resuelve un administrador. Rellenarlo igualmente crearia el conflicto que la
-- restriccion de arriba existe para impedir.
UPDATE doc_issues
   SET verificador_id = autor_id
 WHERE verificador_id IS NULL
   AND tipo = 'NO_CONFORMIDAD'
   AND autor_id IS NOT NULL
   AND (responsable_id IS NULL OR autor_id <> responsable_id);

COMMIT;
