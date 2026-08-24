-- ============================================================================
-- CAPA 14 · PROJECT TEMPLATES — configuración de obra, reproducible
-- ============================================================================
-- Se ejecuta como `ecd_migrator`. NO requiere `postgres`.
--
-- LA PREGUNTA QUE DECIDE TODO: ¿esto es CONFIGURACIÓN de la obra, o es su
-- HISTORIA? La configuración se reproduce; la historia es de UNA obra y de
-- nadie más. Copiar historia sería fabricar un pasado falso — documentos que
-- nadie subió, revisiones que nadie hizo, recibos que nadie firmó. Un
-- expediente público con historia inventada no es un expediente.
--
-- El molde se guarda como JSONB con partes declaradas (carpetas ·
-- herramientas · empresas · idoneidad). NO existe una parte para miembros, y
-- esa ausencia es deliberada: si una plantilla copiara membresías, crear una
-- obra desde plantilla concedería acceso a personas que nadie invitó a ESA
-- obra, y el acceso dejaría de nacer de un acto con autor. La estructura se
-- hereda; la gente se incorpora.
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS plantillas_de_obra (
    id           SERIAL PRIMARY KEY,
    nombre       TEXT NOT NULL,
    descripcion  TEXT,
    -- {carpetas: [...], herramientas: {...}, empresas: [...], idoneidad: [...]}
    molde        JSONB NOT NULL DEFAULT '{}'::jsonb,
    origen_obra  TEXT,
    creada_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creada_por   TEXT
);

COMMENT ON TABLE plantillas_de_obra IS
  'CAPA 14 · PROJECT TEMPLATES: la CONFIGURACIÓN de una obra, reproducible. '
  'Guarda estructura de carpetas (vacía), herramientas activas (capa 16), '
  'empresas y su función contractual, y códigos de idoneidad. NO guarda '
  'documentos, auditoría, RFI/Red Lines/revisiones, transmittals, encargos, '
  'sesiones NI MIEMBROS: eso es historia e identidad de UNA obra. Un molde '
  'vacío, no una fotocopia.';
COMMENT ON COLUMN plantillas_de_obra.origen_obra IS
  'De qué obra se capturó. PROCEDENCIA, no vínculo: la plantilla es una copia '
  'congelada y la obra origen puede cambiar o archivarse sin afectarla.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_nombre
    ON plantillas_de_obra (LOWER(nombre));

DO $$
DECLARE
    prohibidas text[] := ARRAY['miembros','documentos','auditoria','encargos',
                               'sesiones','permisos','rfis','revisiones'];
    k text;
BEGIN
    -- Contrato de esquema: si alguien añade una parte con nombre de historia,
    -- esta migración lo dirá al re-ejecutarse.
    FOREACH k IN ARRAY prohibidas LOOP
        IF EXISTS (SELECT 1 FROM plantillas_de_obra WHERE molde ? k) THEN
            RAISE EXCEPTION 'una plantilla guarda «%», que es historia y no configuración', k;
        END IF;
    END LOOP;
    RAISE NOTICE 'CAPA 14 lista: % plantillas declaradas',
                 (SELECT count(*) FROM plantillas_de_obra);
END $$;

COMMIT;
